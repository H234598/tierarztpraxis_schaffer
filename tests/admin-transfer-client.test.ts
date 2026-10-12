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
      redirect: "manual",
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

  it.each([
    {
      name: "403",
      response: () =>
        new Response(JSON.stringify({ ok: false }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      status: 403,
    },
    {
      name: "HTML-200",
      response: () =>
        new Response("<!doctype html><title>Access login</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      status: 200,
    },
  ])(
    "klassifiziert $name als verlorene Access-Sitzung",
    async ({ response, status }) => {
      const fetcher = vi.fn().mockResolvedValue(response());

      await expect(
        requestAdminJson("/api/admin/cases", {}, fetcher),
      ).rejects.toMatchObject({
        message: "Admin-Zugang erforderlich.",
        status,
        authenticationLost: true,
      });
    },
  );

  it("klassifiziert Redirectziele trotz JSON-200 als verlorene Access-Sitzung", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: "https://access.example.test/cdn-cgi/access/login" },
    });
    const fetcher = vi.fn().mockResolvedValue(response);

    await expect(
      requestAdminJson("/api/admin/cases", {}, fetcher),
    ).rejects.toMatchObject({
      message: "Admin-Zugang erforderlich.",
      status: 200,
      authenticationLost: true,
    });
  });

  it("klassifiziert unerwartete Antwortziele als verlorene Access-Sitzung", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    Object.defineProperty(response, "url", {
      value: "https://access.example.test/cdn-cgi/access/login",
    });
    const fetcher = vi.fn().mockResolvedValue(response);

    await expect(
      requestAdminJson("/api/admin/cases", {}, fetcher),
    ).rejects.toMatchObject({
      message: "Admin-Zugang erforderlich.",
      status: 200,
      authenticationLost: true,
    });
  });

  it("klassifiziert Transportabbrüche als verlorene Access-Sitzung", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      requestAdminJson("/api/admin/cases", {}, fetcher),
    ).rejects.toMatchObject({
      message: "Admin-Zugang erforderlich.",
      status: 0,
      authenticationLost: true,
    });
  });

  it("behält echte API-Konflikte im normalen Fehlerpfad", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { code: "conflict" } }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      requestAdminJson("/api/admin/cases", {}, fetcher),
    ).rejects.toMatchObject({
      message: "Anfrage fehlgeschlagen.",
      status: 409,
      authenticationLost: false,
    });
  });
});
