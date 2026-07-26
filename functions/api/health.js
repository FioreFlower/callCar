const EXPECTED_ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "VEHICLE_NUMBER",
  "PUBLIC_TURNSTILE_SITE_KEY",
  "PRIVATE_TURNSTILE_SECRET_KEY",
  "REQUEST_LIMITS"
];

export function onRequestGet({ env }) {
  const envStatus = Object.fromEntries(
    EXPECTED_ENV_KEYS.map((key) => [
      key,
      {
        present: Boolean(env[key]),
        type: typeof env[key]
      }
    ])
  );

  return new Response(
    JSON.stringify({
      ok: true,
      env: envStatus
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
