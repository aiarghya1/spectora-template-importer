import { describe, expect, it, vi } from "vitest";
import { cleanupStaging } from "../cleanup-staging";

const USER = "11111111-1111-4111-8111-111111111111";
const OLD = "2026-09-12T00:00:00.000Z";
const NEW = "2026-09-14T11:00:00.000Z";
const NOW = Date.parse("2026-09-14T12:00:00.000Z");
const file = (name: string, created_at: string | null = OLD, id: string | null = "id") => ({ name, created_at, id });

describe("staged upload retention", () => {
  it("removes only old, valid files after listing all pages", async () => {
    const oldName = "22222222-2222-4222-8222-222222222222.xlsx";
    const extraName = "33333333-3333-4333-8333-333333333333.csv";
    const rootPage = [{ name: USER, id: null }, ...Array.from({ length: 999 }, (_, i) => ({ name: `invalid-${i}`, id: null }))];
    const filePage = [file(oldName), ...Array.from({ length: 999 }, (_, i) => file(`invalid-${i}`))];
    const list = vi.fn(async (path: string, options: { offset: number }) => {
      if (path === "") return { data: options.offset === 0 ? rootPage : [], error: null };
      return { data: options.offset === 0 ? filePage : [file(extraName), file("44444444-4444-4444-8444-444444444444.xlsx", NEW), file("55555555-5555-4555-8555-555555555555.xlsx", null), file("folder", OLD, null)], error: null };
    });
    const remove = vi.fn(async () => ({ error: null }));
    expect(await cleanupStaging({ list, remove } as never, NOW)).toBe(2);
    expect(list).toHaveBeenCalledWith("", expect.objectContaining({ offset: 1000 }));
    expect(list).toHaveBeenCalledWith(USER, expect.objectContaining({ offset: 1000 }));
    expect(remove).toHaveBeenCalledWith([`${USER}/${oldName}`, `${USER}/${extraName}`]);
  });

  it("handles an empty bucket and null list data", async () => {
    const list = vi.fn(async () => ({ data: null, error: null }));
    expect(await cleanupStaging({ list } as never, NOW)).toBe(0);
    const root = [{ name: USER, id: null }];
    const withEmptyFolder = vi.fn(async (path: string) => ({ data: path ? null : root, error: null }));
    expect(await cleanupStaging({ list: withEmptyFolder } as never, NOW)).toBe(0);
  });

  it("propagates list and removal failures so the cron can retry", async () => {
    const error = new Error("storage unavailable");
    await expect(cleanupStaging({ list: vi.fn(async () => ({ error })) } as never, NOW)).rejects.toThrow("storage unavailable");

    const root = [{ name: USER, id: null }];
    const badList = vi.fn(async (path: string) => path ? { data: null, error } : { data: root, error: null });
    await expect(cleanupStaging({ list: badList } as never, NOW)).rejects.toThrow("storage unavailable");

    const oldName = "22222222-2222-4222-8222-222222222222.xlsx";
    const list = vi.fn(async (path: string) => ({ data: path ? [file(oldName)] : root, error: null }));
    const remove = vi.fn(async () => ({ error }));
    await expect(cleanupStaging({ list, remove } as never, NOW)).rejects.toThrow("storage unavailable");
  });
});
