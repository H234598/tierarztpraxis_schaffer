import { describe, expect, it, vi } from "vitest";
import { cleanupExpired } from "../src/transfers/cleanup";

describe("Datentransfer-Cleanup", () => {
  it("löscht R2 nicht, wenn der Schlüssel fehlt, und bleibt fail-closed", async () => {
    const prepare = vi.fn((query: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () => ({
          results: query.includes("transfer_files") ? [{ id: "f1", r2_key: "" }] : [],
        }),
        run: async () => ({}),
      }),
    }));
    const env = {
      TRANSFER_DB: { prepare, batch: vi.fn() },
      TRANSFER_FILES: { delete: vi.fn() },
    } as any;
    const result = await cleanupExpired(env, new Date("2026-08-05T03:00:00.000Z"));
    expect(result.files).toBe(0);
    expect(env.TRANSFER_FILES.delete).not.toHaveBeenCalled();
  });

  it("löscht nur tatsächlich abgelaufene geschlossene Fälle", async () => {
    const queries: string[] = [];
    const prepare = vi.fn((query: string) => {
      queries.push(query);
      return {
        bind: (..._args: unknown[]) => ({
          all: async () => ({ results: [] }),
          run: async () => ({}),
        }),
      };
    });
    const env = {
      TRANSFER_DB: { prepare, batch: vi.fn() },
      TRANSFER_FILES: { delete: vi.fn() },
    } as any;
    await cleanupExpired(env, new Date("2026-08-05T03:00:00.000Z"));
    expect(
      queries.some((query) => query.includes("status IN ('closed', 'expired')")),
    ).toBe(true);
  });

  it("löscht nur alte, nicht in D1 referenzierte Transferobjekte", async () => {
    const old = new Date("2026-08-03T00:00:00.000Z");
    const activeKey = "cases/case-1/submissions/sub-1/file-1";
    const orphanKey = "cases/orphan/submissions/sub/file";
    const prepare = vi.fn((query: string) => {
      const all = async () => ({
        results: query.includes("SELECT r2_key") ? [{ r2_key: activeKey }] : [],
      });
      return {
        bind: (..._args: unknown[]) => ({
          all,
          run: async () => ({ meta: { changes: 0 } }),
        }),
        all,
      };
    });
    const remove = vi.fn();
    const list = vi.fn().mockResolvedValue({
      objects: [
        { key: activeKey, uploaded: old },
        { key: orphanKey, uploaded: old },
      ],
      truncated: false,
    });
    const env = {
      TRANSFER_DB: { prepare, batch: vi.fn() },
      TRANSFER_FILES: { delete: remove, list },
    } as any;

    await cleanupExpired(env, new Date("2026-08-05T03:00:00.000Z"));

    expect(list).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(orphanKey);
    expect(remove).not.toHaveBeenCalledWith(activeKey);
  });

  it("stellt hängende Benachrichtigungen wieder in die Queue", async () => {
    const notificationId = "11111111-1111-4111-8111-111111111111";
    const prepare = vi.fn((query: string) => {
      const statement = {
        bind: (..._args: unknown[]) => statement,
        all: async () => ({
          results: query.includes("FROM transfer_notifications")
            ? [{ id: notificationId }]
            : [],
        }),
        run: async () => ({ meta: { changes: 1 } }),
      };
      return statement;
    });
    const send = vi.fn().mockResolvedValue(undefined);
    const env = {
      TRANSFER_DB: { prepare, batch: vi.fn() },
      TRANSFER_FILES: { delete: vi.fn() },
      TRANSFER_NOTIFICATIONS: { send },
    } as any;

    const result = await cleanupExpired(env, new Date("2026-08-05T03:00:00.000Z"));

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ notificationId }, { contentType: "json" });
    expect(result.notifications).toBe(1);
  });
});
