-- Template importer schema. See docs/schema.md for the model and rationale.
-- All functions are SECURITY INVOKER: they run as the calling user, so RLS still applies.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.templates (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 200),
  copied_from_id  uuid references public.templates (id) on delete set null,
  import_id       uuid, -- FK added after imports exists; copied on duplicate so copies keep their report
  version        integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index templates_owner_updated_idx on public.templates (owner_id, updated_at desc);

-- Per-user quota so imports/duplicates can't be used to exhaust storage.
create or replace function public.enforce_template_quota()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if (select count(*) from public.templates where owner_id = new.owner_id) >= 200 then
    raise exception 'template limit reached (200 per account)' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger templates_quota before insert on public.templates
  for each row execute function public.enforce_template_quota();

create table public.sections (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.templates (id) on delete cascade,
  position     integer not null check (position >= 0),
  name         text not null check (char_length(name) <= 500),
  source_row   integer,
  extras       jsonb not null default '{}'::jsonb check (jsonb_typeof(extras) = 'object'),
  version      integer not null default 1,
  -- target for the composite FK below (keeps children in the same template as their parent)
  unique (id, template_id),
  -- deferrable so two rows can swap positions inside one transaction
  constraint sections_position_key unique (template_id, position) deferrable initially deferred
);

create table public.items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.templates (id) on delete cascade,
  section_id   uuid not null,
  position     integer not null check (position >= 0),
  name         text not null check (char_length(name) <= 500),
  source_row   integer,
  extras       jsonb not null default '{}'::jsonb check (jsonb_typeof(extras) = 'object'),
  version      integer not null default 1,
  foreign key (section_id, template_id) references public.sections (id, template_id) on delete cascade,
  unique (id, template_id),
  constraint items_position_key unique (section_id, position) deferrable initially deferred
);

create table public.comments (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.templates (id) on delete cascade,
  item_id       uuid not null,
  position      integer not null check (position >= 0),
  title         text not null default '' check (char_length(title) <= 1000),
  body_html     text not null default '' check (char_length(body_html) <= 200000),
  comment_type  text check (char_length(comment_type) <= 100),
  source_row    integer,
  extras        jsonb not null default '{}'::jsonb check (jsonb_typeof(extras) = 'object'),
  version       integer not null default 1,
  foreign key (item_id, template_id) references public.items (id, template_id) on delete cascade,
  constraint comments_position_key unique (item_id, position) deferrable initially deferred
);

-- FK lookups for cascades and RLS joins
create index items_template_idx on public.items (template_id);
create index comments_template_idx on public.comments (template_id);

-- One row per import attempt that reached commit. Survives template deletion for audit.
create table public.imports (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  template_id    uuid references public.templates (id) on delete set null,
  filename       text not null check (char_length(filename) <= 255),
  file_sha256    text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  source_rows    integer not null check (source_rows >= 0),
  summary        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index imports_owner_idx on public.imports (owner_id, created_at desc);
create index imports_template_idx on public.imports (template_id);

alter table public.templates
  add constraint templates_import_id_fkey foreign key (import_id) references public.imports (id) on delete set null;

create table public.import_issues (
  id          bigint generated always as identity primary key,
  import_id   uuid not null references public.imports (id) on delete cascade,
  source_row  integer,
  severity    text not null check (severity in ('info', 'warning', 'error')),
  category    text not null check (category in ('missing_in_export', 'unsupported', 'sanitized', 'structure')),
  code        text not null check (char_length(code) <= 100),
  message     text not null check (char_length(message) <= 2000),
  detail      jsonb not null default '{}'::jsonb
);
create index import_issues_import_idx on public.import_issues (import_id, source_row);

-- ---------------------------------------------------------------------------
-- Row level security: a user sees only their own data.
-- (select auth.uid()) is evaluated once per statement instead of per row.
-- ---------------------------------------------------------------------------

alter table public.templates     enable row level security;
alter table public.sections      enable row level security;
alter table public.items         enable row level security;
alter table public.comments      enable row level security;
alter table public.imports       enable row level security;
alter table public.import_issues enable row level security;

create policy templates_owner on public.templates
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.owns_template(p_template_id uuid)
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.templates t
    where t.id = p_template_id and t.owner_id = (select auth.uid())
  );
$$;

create policy sections_owner on public.sections
  for all to authenticated
  using (public.owns_template(template_id)) with check (public.owns_template(template_id));
create policy items_owner on public.items
  for all to authenticated
  using (public.owns_template(template_id)) with check (public.owns_template(template_id));
create policy comments_owner on public.comments
  for all to authenticated
  using (public.owns_template(template_id)) with check (public.owns_template(template_id));

create policy imports_owner on public.imports
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy import_issues_owner on public.import_issues
  for all to authenticated
  using (exists (select 1 from public.imports i where i.id = import_id and i.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.imports i where i.id = import_id and i.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- import_template: writes a whole parsed template in one transaction.
-- p_sections: [{name, source_row, extras, items: [{name, source_row, extras,
--              comments: [{title, body_html, comment_type, source_row, extras}]}]}]
-- p_issues:   [{source_row, severity, category, code, message, detail}]
-- Array order becomes position. Any error rolls back everything.
-- ---------------------------------------------------------------------------

create or replace function public.import_template(
  p_name        text,
  p_filename    text,
  p_file_sha256 text,
  p_source_rows integer,
  p_summary     jsonb,
  p_sections    jsonb,
  p_issues      jsonb
)
returns table (template_id uuid, import_id uuid)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_template uuid;
  v_import   uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.imports
      where owner_id = (select auth.uid()) and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'import rate limit reached (30 per hour)' using errcode = '54000';
  end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'template has no sections' using errcode = '22023';
  end if;

  insert into public.templates (name) values (p_name) returning id into v_template;

  insert into public.sections (template_id, position, name, source_row, extras)
  select v_template, (s.ord - 1)::int, s.v ->> 'name', (s.v ->> 'source_row')::int,
         coalesce(s.v -> 'extras', '{}'::jsonb)
  from jsonb_array_elements(p_sections) with ordinality as s(v, ord);

  insert into public.items (template_id, section_id, position, name, source_row, extras)
  select v_template, sec.id, (i.ord - 1)::int, i.v ->> 'name', (i.v ->> 'source_row')::int,
         coalesce(i.v -> 'extras', '{}'::jsonb)
  from jsonb_array_elements(p_sections) with ordinality as s(v, ord)
  join public.sections sec on sec.template_id = v_template and sec.position = s.ord - 1
  cross join lateral jsonb_array_elements(coalesce(s.v -> 'items', '[]'::jsonb)) with ordinality as i(v, ord);

  insert into public.comments (template_id, item_id, position, title, body_html, comment_type, source_row, extras)
  select v_template, it.id, (c.ord - 1)::int,
         coalesce(c.v ->> 'title', ''), coalesce(c.v ->> 'body_html', ''), c.v ->> 'comment_type',
         (c.v ->> 'source_row')::int, coalesce(c.v -> 'extras', '{}'::jsonb)
  from jsonb_array_elements(p_sections) with ordinality as s(v, ord)
  join public.sections sec on sec.template_id = v_template and sec.position = s.ord - 1
  cross join lateral jsonb_array_elements(coalesce(s.v -> 'items', '[]'::jsonb)) with ordinality as i(v, ord)
  join public.items it on it.section_id = sec.id and it.position = i.ord - 1
  cross join lateral jsonb_array_elements(coalesce(i.v -> 'comments', '[]'::jsonb)) with ordinality as c(v, ord);

  insert into public.imports (template_id, filename, file_sha256, source_rows, summary)
  values (v_template, p_filename, p_file_sha256, p_source_rows, coalesce(p_summary, '{}'::jsonb))
  returning id into v_import;

  update public.templates set import_id = v_import where id = v_template;

  insert into public.import_issues (import_id, source_row, severity, category, code, message, detail)
  select v_import, (x.v ->> 'source_row')::int, x.v ->> 'severity', x.v ->> 'category',
         x.v ->> 'code', left(x.v ->> 'message', 2000), coalesce(x.v -> 'detail', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) as x(v);

  return query select v_template, v_import;
end;
$$;

-- ---------------------------------------------------------------------------
-- duplicate_template: deep copy with fresh ids. Nothing is shared with the source,
-- so edits to either template cannot affect the other.
-- ---------------------------------------------------------------------------

create or replace function public.duplicate_template(p_source uuid, p_name text)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_new uuid;
begin
  -- RLS hides other users' templates, so "not found" also covers "not yours".
  if not exists (select 1 from public.templates where id = p_source) then
    raise exception 'template not found' using errcode = 'P0002';
  end if;

  insert into public.templates (name, copied_from_id, import_id)
  select p_name, t.id, t.import_id from public.templates t where t.id = p_source
  returning id into v_new;

  insert into public.sections (template_id, position, name, source_row, extras)
  select v_new, position, name, source_row, extras
  from public.sections where template_id = p_source;

  insert into public.items (template_id, section_id, position, name, source_row, extras)
  select v_new, ns.id, i.position, i.name, i.source_row, i.extras
  from public.items i
  join public.sections os on os.id = i.section_id
  join public.sections ns on ns.template_id = v_new and ns.position = os.position
  where i.template_id = p_source;

  insert into public.comments (template_id, item_id, position, title, body_html, comment_type, source_row, extras)
  select v_new, ni.id, c.position, c.title, c.body_html, c.comment_type, c.source_row, c.extras
  from public.comments c
  join public.items oi on oi.id = c.item_id
  join public.sections os on os.id = oi.section_id
  join public.sections ns on ns.template_id = v_new and ns.position = os.position
  join public.items ni on ni.section_id = ns.id and ni.position = oi.position
  where c.template_id = p_source;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_node: swap a section/item/comment with its previous (-1) or next (+1) sibling.
-- ---------------------------------------------------------------------------

create or replace function public.move_node(p_kind text, p_id uuid, p_direction integer)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_table  text;
  v_parent text;
  v_parent_id uuid;
  v_pos    integer;
  v_other  uuid;
  v_other_pos integer;
begin
  if p_direction not in (-1, 1) then
    raise exception 'direction must be -1 or 1' using errcode = '22023';
  end if;
  case p_kind
    when 'section' then v_table := 'sections'; v_parent := 'template_id';
    when 'item'    then v_table := 'items';    v_parent := 'section_id';
    when 'comment' then v_table := 'comments'; v_parent := 'item_id';
    else raise exception 'unknown kind %', p_kind using errcode = '22023';
  end case;

  execute format('select %I, position from public.%I where id = $1 for update', v_parent, v_table)
    into v_parent_id, v_pos using p_id;
  if v_parent_id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  execute format(
    'select id, position from public.%I where %I = $1 and position %s $2 order by position %s limit 1 for update',
    v_table, v_parent, case when p_direction = 1 then '>' else '<' end,
    case when p_direction = 1 then 'asc' else 'desc' end)
    into v_other, v_other_pos using v_parent_id, v_pos;
  if v_other is null then
    return; -- already first/last
  end if;

  execute format('update public.%I set position = $1, version = version + 1 where id = $2', v_table)
    using v_other_pos, p_id;
  execute format('update public.%I set position = $1, version = version + 1 where id = $2', v_table)
    using v_pos, v_other;
end;
$$;

revoke all on function public.import_template(text, text, text, integer, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.duplicate_template(uuid, text) from public, anon;
revoke all on function public.move_node(text, uuid, integer) from public, anon;
grant execute on function public.import_template(text, text, text, integer, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.duplicate_template(uuid, text) to authenticated;
grant execute on function public.move_node(text, uuid, integer) to authenticated;
