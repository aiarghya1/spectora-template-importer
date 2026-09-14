/**
 * Minimal chainable stand-in for the Supabase JS client. Every awaited query is recorded as an `Op`
 * and answered by a resolver, so tests assert exactly what was sent (table, action, payload, filters)
 * and control what comes back (rows or a Postgres error code).
 *
 *   const db = fakeSupabase((op) => op.name === "sections" && op.action === "update" ? { data: [...] } : {});
 *   vi.mocked(createClient).mockResolvedValue(db.client as never);
 */
export interface Op {
  kind: "table" | "rpc";
  name: string;
  action: "none" | "select" | "insert" | "update" | "delete" | "upsert" | "rpc";
  payload?: unknown;
  columns?: string;
  filters: unknown[][];
  order: unknown[][];
  range?: [number, number];
  limit?: number;
  single?: "single" | "maybeSingle";
}

export interface FakeResult {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}

export type Resolver = (op: Op, index: number) => FakeResult | undefined;

type Settled = { data: unknown; error: FakeResult["error"] };

export interface Chain extends PromiseLike<Settled> {
  select(columns?: string): Chain;
  insert(payload: unknown): Chain;
  update(payload: unknown): Chain;
  upsert(payload: unknown): Chain;
  delete(): Chain;
  eq(column: string, value: unknown): Chain;
  neq(column: string, value: unknown): Chain;
  in(column: string, values: unknown[]): Chain;
  not(column: string, operator: string, value: unknown): Chain;
  order(column: string, options?: unknown): Chain;
  limit(count: number): Chain;
  range(from: number, to: number): Chain;
  single<T = unknown>(): Chain & PromiseLike<{ data: T; error: FakeResult["error"] }>;
  maybeSingle(): Chain;
}

type AuthMethods = Record<string, (...args: never[]) => unknown>;

export function fakeSupabase(
  resolve: Resolver,
  options: { claims?: Record<string, unknown> | null; auth?: AuthMethods } = {},
) {
  const ops: Op[] = [];

  function chain(op: Op): Chain {
    const self: Chain = {
      select(columns) {
        if (op.action === "none") op.action = "select";
        op.columns = columns;
        return self;
      },
      insert(payload) {
        op.action = "insert";
        op.payload = payload;
        return self;
      },
      update(payload) {
        op.action = "update";
        op.payload = payload;
        return self;
      },
      upsert(payload) {
        op.action = "upsert";
        op.payload = payload;
        return self;
      },
      delete() {
        op.action = "delete";
        return self;
      },
      eq(column, value) {
        op.filters.push(["eq", column, value]);
        return self;
      },
      neq(column, value) {
        op.filters.push(["neq", column, value]);
        return self;
      },
      in(column, values) {
        op.filters.push(["in", column, values]);
        return self;
      },
      not(column, operator, value) {
        op.filters.push(["not", column, operator, value]);
        return self;
      },
      order(column, orderOptions) {
        op.order.push([column, orderOptions]);
        return self;
      },
      limit(count) {
        op.limit = count;
        return self;
      },
      range(from, to) {
        op.range = [from, to];
        return self;
      },
      single() {
        op.single = "single";
        return self as never;
      },
      maybeSingle() {
        op.single = "maybeSingle";
        return self;
      },
      then(onfulfilled, onrejected) {
        const index = ops.push(op) - 1;
        const result = resolve(op, index) ?? {};
        return Promise.resolve<Settled>({ data: result.data ?? null, error: result.error ?? null }).then(onfulfilled, onrejected);
      },
    };
    return self;
  }

  const client = {
    from: (table: string) => chain({ kind: "table", name: table, action: "none", filters: [], order: [] }),
    rpc: (name: string, args?: unknown) => chain({ kind: "rpc", name, action: "rpc", payload: args, filters: [], order: [] }),
    auth: {
      getClaims: async () => ({
        data: options.claims === null ? null : { claims: options.claims ?? { sub: "user-1" } },
        error: null,
      }),
      ...options.auth,
    },
  };

  return { client, ops };
}

export const isOp = (op: Op, name: string, action: Op["action"]) => op.name === name && op.action === action;
