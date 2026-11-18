import { hashReplyToken, isReplyKey, repliesEnabled, replyJson } from "../lib/replies.js";

export async function onRequestGet({ request, env }) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([^ ]+)$/)?.[1];
  if (!repliesEnabled(env) || !isReplyKey(token)) return replyJson({ ok: false }, 404);

  const row = await env.CAR_REPLIES
    .prepare("SELECT reply FROM vehicle_replies WHERE token_hash = ? AND expires_at > ?")
    .bind(await hashReplyToken(token), Date.now())
    .first();

  return row ? replyJson({ reply: row.reply }) : replyJson({ ok: false }, 404);
}
