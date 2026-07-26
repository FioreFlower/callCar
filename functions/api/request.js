export async function onRequestPost(context) {
  const { request, env } = context;
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  const turnstileSecretKey = env.PRIVATE_TURNSTILE_SECRET_KEY || env.TURNSTILE_SECRET_KEY;
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
    ...formatServerInfo(request),
    "",
    "[브라우저 정보]",
    ...formatClientInfo(clientInfo)
  ].filter(Boolean);

  const telegramResult = await sendTelegramMessages(botToken, chatId, lines.join("\n"));
  if (!telegramResult.ok) {
    console.error("Telegram error:", telegramResult.detail);
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
  return cleanObject(info, 0);
}

function formatServerInfo(request) {
  const cf = request.cf || {};

  return [
    `국가: ${cleanHeader(request, "CF-IPCountry") || cleanText(cf.country || "", 80) || "알 수 없음"}`,
    addLine("지역", cf.region || cf.regionCode),
    addLine("도시", cf.city),
    addLine("우편번호", cf.postalCode),
    cf.latitude || cf.longitude
      ? `좌표: ${cleanText(cf.latitude || "", 40)}, ${cleanText(cf.longitude || "", 40)}`
      : null,
    addLine("Cloudflare colo", cf.colo),
    addLine("ASN", cf.asn),
    addLine("AS 조직", cf.asOrganization),
    addLine("HTTP", cf.httpProtocol),
    addLine("TLS", cf.tlsVersion),
    addLine("TLS cipher", cf.tlsCipher),
    addLine("CF-Ray", request.headers.get("CF-Ray")),
    addLine("Accept-Language", request.headers.get("Accept-Language")),
    addLine("Sec-CH-UA", request.headers.get("Sec-CH-UA")),
    addLine("Sec-CH-UA-Mobile", request.headers.get("Sec-CH-UA-Mobile")),
    addLine("Sec-CH-UA-Platform", request.headers.get("Sec-CH-UA-Platform"))
  ];
}

function formatClientInfo(clientInfo) {
  const lines = flattenClientInfo(clientInfo);
  return lines.length ? lines : ["수집된 브라우저 정보 없음"];
}

function addLine(label, value, maxLength = 160) {
  const cleanValue = cleanText(value || "", maxLength);
  return cleanValue ? `${label}: ${cleanValue}` : null;
}

function cleanObject(value, depth) {
  if (value === null || value === undefined || depth > 4) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => cleanObject(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 120)
        .map(([key, item]) => [
          cleanText(key, 80),
          cleanObject(item, depth + 1)
        ])
        .filter(([key]) => Boolean(key))
    );
  }

  return cleanText(value, 500);
}

function flattenClientInfo(value, prefix = "") {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  if (typeof value !== "object") {
    return [`${prefix}: ${cleanText(value, 500)}`];
  }

  return Object.entries(value).flatMap(([key, item]) => {
    const label = prefix ? `${prefix}.${key}` : key;
    return flattenClientInfo(item, label);
  });
}

async function sendTelegramMessages(botToken, chatId, text) {
  const chunks = splitTelegramText(text);

  for (const [index, chunk] of chunks.entries()) {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunks.length > 1 ? `[${index + 1}/${chunks.length}]\n${chunk}` : chunk,
          disable_notification: false
        })
      }
    );

    if (!response.ok) {
      return { ok: false, detail: await response.text() };
    }
  }

  return { ok: true, detail: "" };
}

function splitTelegramText(text) {
  const maxLength = 3600;
  const chunks = [];
  let current = "";

  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = line;
      } else {
        chunks.push(line.slice(0, maxLength));
        current = line.slice(maxLength);
      }
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
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
