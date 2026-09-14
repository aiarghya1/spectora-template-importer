-- Private, short-lived source files for uploads above Vercel's request-body limit.
-- Every object path begins with the authenticated user's UUID. The app removes
-- a staged file after a successful commit, or when its preview is discarded.
insert into storage.buckets (id, name, public, file_size_limit)
values ('template-import-staging', 'template-import-staging', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

create policy "staging owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'template-import-staging'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.](xlsx|xls|csv)$')
  );
create policy "staging owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'template-import-staging' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "staging owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'template-import-staging' and (storage.foldername(name))[1] = (select auth.uid())::text);
