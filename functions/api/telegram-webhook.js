import { isReplyKey, repliesEnabled, REPLY_REFERENCE_PREFIX, replyJson } from "../lib/replies.js";

export async function onRequestPost({ request, env }) {
  if (!repliesEnabled(env) ||
      request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return replyJson({ ok: false }, 403);
  }

  const update = await request.json().catch(() => null);
  const message = update?.message;
  const original = message?.reply_to_message;
  const chatId = String(message?.chat?.id ?? "");
  const ownerId = env.TELEGRAM_REPLY_OWNER_ID?.trim() ||
    (message?.chat?.type === "private" ? chatId : "");
  const botId = env.TELEGRAM_BOT_TOKEN?.split(":", 1)[0];
  const text = typeof message?.text === "string" ? message.text.trim() : "";

  if (!text || !ownerId || !botId ||
      chatId !== String(env.TELEGRAM_CHAT_ID ?? "") ||
      String(message.from?.id ?? "") !== ownerId ||
      !original?.from?.is_bot || String(original.from.id) !== botId ||
      !Number.isSafeInteger(message.message_id)) {
    return replyJson({ ok: true });
  }

  const reference = original.text?.split("\n", 1)[0];
  const id = reference?.startsWith(REPLY_REFERENCE_PREFIX)
    ? reference.slice(REPLY_REFERENCE_PREFIX.length)
    : null;
  if (!isReplyKey(id)) return replyJson({ ok: true });

  await env.CAR_REPLIES.prepare(
    "UPDATE vehicle_replies SET reply = ?, reply_message_id = ? " +
    "WHERE request_id = ? AND expires_at > ? AND reply_message_id < ?"
  ).bind(text.slice(0, 500), message.message_id, id, Date.now(), message.message_id).run();

  return replyJson({ ok: true });
}
