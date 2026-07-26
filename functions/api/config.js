export function onRequestGet({ env }) {
  return new Response(
    JSON.stringify({
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || ""
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

export function onRequest() {
  return new Response(
    JSON.stringify({ ok: false, message: "지원하지 않는 요청입니다." }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Allow: "GET"
      }
    }
  );
}
