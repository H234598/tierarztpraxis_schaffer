export function responseHeaders(origin?: string): Headers {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });

  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }

  return headers;
}

export function json(
  body: Record<string, unknown>,
  status = 200,
  origin?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

export function accepted(requestId: string, origin: string): Response {
  return json({ accepted: true, requestId }, 202, origin);
}
