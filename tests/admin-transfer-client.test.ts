import { describe, expect, it, vi } from "vitest";

import {
  AdminRequestError,
  requestAdminJson,
} from "../src/scripts/admin-transfer-client";

describe("Admin-Datentransfer-Client", () => {
  it("ruft die Access-geschützte API same-origin ohne Assertion-Eigenbau auf", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, admin: { email: "admin@example.test" } }),
        {
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(requestAdminJson("/api/admin/session", {}, fetcher)).resolves.toEqual({
      ok: true,
      admin: { email: "admin@example.test" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/session",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("weist fremde Pfade ab und sendet nur JSON mit festen Optionen", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(
      requestAdminJson("https://evil.test/api/admin/cases", {}, fetcher),
    ).rejects.toThrow("same-origin");
    await requestAdminJson(
      "/api/admin/cases",
      { method: "POST", body: { petName: "Luna" } },
      fetcher,
    );
    expect(fetcher).toHaveBeenLastCalledWith("/api/admin/cases", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ petName: "Luna" }),
    });
  });

  it("liefert Status und Vorgangskennung ohne Serverdetails", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "invalid_request", message: "intern", requestId: "request-7" },
        }),
        { status: 400 },
      ),
    );
    await expect(requestAdminJson("/api/admin/cases", {}, fetcher)).rejects.toEqual(
      new AdminRequestError(
        "Anfrage fehlgeschlagen. Vorgangskennung: request-7",
        400,
        "request-7",
      ),
    );
  });
});
