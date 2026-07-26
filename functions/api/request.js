export async function onRequestPost(context) {
  const { request, env } = context;
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const turnstileSecretKey = env.TURNSTILE_SECRET_KEY;
  const ip = getClientIp(request);

  if (!isAllowedOrigin(request, env.ALLOWED_ORIGIN)) {
    return json(
      { ok: false, message: "허용되지 않은 요청입니다." },
      403
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const message = cleanText(body.message || "", 500);
  const contact = cleanText(body.contact || "", 80);
  const vehicleNumber = cleanText(body.vehicleNumber || "", 40);
  const page = cleanText(body.page || "", 200);
  const trap = cleanText(body.website || "", 80);
  const formLoadedAt = Number(body.formLoadedAt || 0);
  const clientInfo = cleanClientInfo(body.clientInfo || {});
  const turnstileToken = cleanText(body.turnstileToken || "", 2048);

  if (trap) {
    return json({ ok: true, message: "전송되었습니다." });
  }

  if (!isPlausibleSubmitTime(formLoadedAt)) {
    return json(
      { ok: false, message: "잠시 후 다시 시도해 주세요." },
      400
    );
  }

  if (message.length < 2) {
    return json(
      { ok: false, message: "요청 내용을 2글자 이상 입력해 주세요." },
      400
    );
  }

  if (turnstileSecretKey) {
    const turnstile = await verifyTurnstile(turnstileSecretKey, turnstileToken, ip);
    if (!turnstile.success) {
      return json(
        { ok: false, message: "스팸 방지 확인에 실패했습니다. 다시 시도해 주세요." },
        400
      );
    }
  }

  if (!botToken || !chatId) {
    return json(
      { ok: false, message: "텔레그램 설정이 아직 완료되지 않았습니다." },
      500
    );
  }

  const limit = await checkRateLimit(env.REQUEST_LIMITS, ip);
  if (!limit.allowed) {
    return json(
      {
        ok: false,
        message: `요청이 너무 많습니다. ${limit.retryAfterSeconds}초 후 다시 보내 주세요.`
      },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  const lines = [
    "긴급 차량 이동 요청이 도착했습니다.",
    "",
    `차량번호: ${vehicleNumber || "미설정"}`,
    `요청 내용: ${message}`,
    contact ? `연락처: ${contact}` : null,
    `접속 페이지: ${page || "알 수 없음"}`,
    `수신 시각: ${new Date().toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul"
    })}`,
    "",
    "[접속 정보]",
    `IP: ${ip}`,
    `국가: ${cleanHeader(request, "CF-IPCountry") || "알 수 없음"}`,
    `브라우저: ${clientInfo.userAgent || "알 수 없음"}`,
    `언어: ${clientInfo.languages || clientInfo.language || "알 수 없음"}`,
    `플랫폼: ${clientInfo.platform || "알 수 없음"}`,
    `시간대: ${clientInfo.timezone || "알 수 없음"}`,
    `화면: ${clientInfo.screen || "알 수 없음"}`,
    `뷰포트: ${clientInfo.viewport || "알 수 없음"}`,
    `DPR: ${clientInfo.devicePixelRatio || "알 수 없음"}`,
    clientInfo.referrer ? `이전 페이지: ${clientInfo.referrer}` : null
  ].filter(Boolean);

  const telegramResponse = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        disable_notification: false
      })
    }
  );

  if (!telegramResponse.ok) {
    const detail = await telegramResponse.text();
    console.error("Telegram error:", detail);
    return json(
      { ok: false, message: "텔레그램 전송에 실패했습니다. 설정을 확인해 주세요." },
      502
    );
  }

  return json({ ok: true, message: "전송되었습니다." });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS"
    }
  });
}

export function onRequestGet() {
  return json({ ok: false, message: "지원하지 않는 요청입니다." }, 405, {
    Allow: "POST, OPTIONS"
  });
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function cleanText(value, maxLength) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isAllowedOrigin(request, configuredOrigin) {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return true;
  }

  const requestOrigin = new URL(request.url).origin;
  const allowedOrigin = cleanText(configuredOrigin || "", 200);

  return origin === requestOrigin || origin === allowedOrigin;
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown"
  );
}

function cleanHeader(request, name) {
  return cleanText(request.headers.get(name) || "", 120);
}

function cleanClientInfo(info) {
  return {
    userAgent: cleanText(info.userAgent || "", 240),
    language: cleanText(info.language || "", 40),
    languages: cleanText(info.languages || "", 160),
    platform: cleanText(info.platform || "", 80),
    timezone: cleanText(info.timezone || "", 80),
    screen: cleanText(info.screen || "", 40),
    viewport: cleanText(info.viewport || "", 40),
    devicePixelRatio: cleanText(info.devicePixelRatio || "", 20),
    referrer: cleanText(info.referrer || "", 200)
  };
}

function isPlausibleSubmitTime(formLoadedAt) {
  const now = Date.now();
  const elapsed = now - formLoadedAt;
  const maxAge = 1000 * 60 * 60 * 6;

  return Number.isFinite(formLoadedAt) && elapsed >= 1000 && elapsed <= maxAge;
}

async function checkRateLimit(kv, ip) {
  const windowSeconds = 60 * 10;
  const maxRequests = 3;

  if (!kv) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const key = `ip:${await sha256(ip)}`;
  const current = Number((await kv.get(key)) || 0);

  if (current >= maxRequests) {
    return { allowed: false, retryAfterSeconds: windowSeconds };
  }

  await kv.put(key, String(current + 1), { expirationTtl: windowSeconds });
  return { allowed: true, retryAfterSeconds: 0 };
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) {
    return { success: false };
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: ip
    })
  });

  if (!response.ok) {
    return { success: false };
  }

  return response.json();
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
