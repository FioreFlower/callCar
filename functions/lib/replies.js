export const REPLY_REFERENCE_PREFIX = "답장 번호: ";
const REPLY_WINDOW_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function repliesEnabled(env) {
  return Boolean(env.CAR_REPLIES && env.TELEGRAM_WEBHOOK_SECRET);
}

export function isReplyKey(value) {
  return typeof value === "string" && UUID.test(value);
}

export async function hashReplyToken(token) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createReplySession(env) {
  if (!repliesEnabled(env)) return null;

  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + REPLY_WINDOW_MS;

  try {
    const db = env.CAR_REPLIES;
    await db.batch([
      db.prepare("DELETE FROM vehicle_replies WHERE expires_at <= ?").bind(now),
      db.prepare("INSERT INTO vehicle_replies (request_id, token_hash, expires_at) VALUES (?, ?, ?)")
        .bind(id, await hashReplyToken(token), expiresAt),
    ]);
    return { id, token, expiresAt };
  } catch {
    console.error("Could not create vehicle reply session.");
    return null;
  }
}

export function replyJson(payload, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
