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
  const sections = [
    formatSection("페이지", clientInfo.page, [
      ["url", "URL"],
      ["referrer", "이전 페이지"],
      ["visibilityState", "페이지 상태"],
      ["readyState", "로드 상태"],
      ["historyLength", "방문 기록 길이"]
    ]),
    formatSection("브라우저", clientInfo.navigator, [
      ["userAgent", "User-Agent", 260],
      ["userAgentData.brands", "브랜드"],
      ["userAgentData.mobile", "모바일"],
      ["userAgentData.platform", "UA 플랫폼"],
      ["platform", "플랫폼"],
      ["vendor", "벤더"],
      ["language", "기본 언어"],
      ["languages", "언어 목록"],
      ["cookieEnabled", "쿠키"],
      ["doNotTrack", "Do Not Track"],
      ["globalPrivacyControl", "Global Privacy Control"],
      ["online", "온라인"],
      ["webdriver", "자동화/WebDriver"],
      ["maxTouchPoints", "터치 포인트"],
      ["hardwareConcurrency", "CPU 스레드"],
      ["deviceMemory", "메모리(GB)"],
      ["pdfViewerEnabled", "PDF 뷰어"]
    ]),
    formatSection("화면", clientInfo.screen, [
      ["size", "화면"],
      ["availableSize", "가용 화면"],
      ["devicePixelRatio", "DPR"],
      ["colorDepth", "색상 깊이"],
      ["pixelDepth", "픽셀 깊이"],
      ["orientation", "방향"]
    ]),
    formatSection("창/시간", clientInfo.window, [
      ["viewport", "뷰포트"],
      ["outerSize", "외부 창"],
      ["scroll", "스크롤"],
      ["timezone", "시간대"],
      ["timezoneOffset", "시간대 오프셋"],
      ["localeTime", "브라우저 로컬 시간"],
      ["performanceTimeOrigin", "성능 기준 시각"],
      ["performanceNow", "페이지 체류(ms)"]
    ]),
    formatStorageSection(clientInfo.storage),
    formatSection("네트워크", clientInfo.network, [
      ["effectiveType", "연결 유형"],
      ["downlink", "다운링크"],
      ["downlinkMax", "최대 다운링크"],
      ["rtt", "RTT"],
      ["saveData", "데이터 절약"]
    ]),
    formatPermissionSection(clientInfo.permissions),
    formatMediaSection(clientInfo.media),
    formatCapabilitySection(clientInfo.capabilities),
    formatFingerprintSection(clientInfo.fingerprints)
  ].filter(Boolean);

  return sections.length ? sections.flatMap((section) => ["", ...section]) : ["수집된 브라우저 정보 없음"];
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

function formatSection(title, source, fields) {
  const lines = fields
    .map(([path, label, maxLength]) => addLine(label, getPath(source, path), maxLength))
    .filter(Boolean);

  return lines.length ? [`[${title}]`, ...lines] : null;
}

function formatStorageSection(storage = {}) {
  const supported = ["localStorage", "sessionStorage", "indexedDB", "cacheStorage", "cookies"]
    .filter((key) => isTruthyValue(storage[key]))
    .map((key) => STORAGE_LABELS[key]);
  const lines = [
    supported.length ? `사용 가능: ${supported.join(", ")}` : null,
    addLine("Quota", formatBytes(storage.quota)),
    addLine("Usage", formatBytes(storage.usage)),
    addLine("영구 저장소", storage.persisted)
  ].filter(Boolean);

  return lines.length ? ["[저장소]", ...lines] : null;
}

function formatPermissionSection(permissions = {}) {
  const grouped = groupEntries(permissions, PERMISSION_LABELS);
  const lines = [
    grouped.granted.length ? `허용: ${grouped.granted.join(", ")}` : null,
    grouped.prompt.length ? `요청 전: ${grouped.prompt.join(", ")}` : null,
    grouped.denied.length ? `거부: ${grouped.denied.join(", ")}` : null,
    grouped.unsupported.length ? `미지원: ${grouped.unsupported.length}개` : null
  ].filter(Boolean);

  return lines.length ? ["[권한 상태]", ...lines] : null;
}

function formatMediaSection(media = {}) {
  return formatSection("미디어 장치", media, [
    ["enumerateDevices", "장치 열거 가능"],
    ["audioInputs", "마이크 수"],
    ["audioOutputs", "스피커 수"],
    ["videoInputs", "카메라 수"],
    ["labelsVisible", "장치명 노출"]
  ]);
}

function formatCapabilitySection(capabilities = {}) {
  const entries = Object.entries(capabilities);
  const supported = entries
    .filter(([, value]) => isTruthyValue(value))
    .map(([key]) => CAPABILITY_LABELS[key] || key);
  const unsupportedCount = entries.filter(([, value]) => isFalsyValue(value)).length;
  const lines = [
    supported.length ? `지원됨: ${supported.join(", ")}` : null,
    unsupportedCount ? `미지원/차단: ${unsupportedCount}개` : null
  ].filter(Boolean);

  return lines.length ? ["[브라우저 기능]", ...lines] : null;
}

function formatFingerprintSection(fingerprints = {}) {
  const webGL = fingerprints.webGL || {};
  const lines = [
    addLine("Canvas hash", shortHash(fingerprints.canvas)),
    addLine("Audio hash", shortHash(fingerprints.audio)),
    addLine("WebGL vendor", webGL.vendor),
    addLine("WebGL renderer", webGL.renderer, 220),
    addLine("WebGL version", webGL.version),
    addLine("WebGL shader", webGL.shadingLanguageVersion),
    addLine("WebGL max texture", webGL.maxTextureSize),
    addLine("폰트 힌트", fingerprints.fonts, 260),
    addLine("플러그인", fingerprints.plugins, 360),
    addLine("MIME 타입", summarizeList(fingerprints.mimeTypes), 360)
  ].filter(Boolean);

  return lines.length ? ["[지문/렌더링]", ...lines] : null;
}

function getPath(source, path) {
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function groupEntries(source, labels) {
  return Object.entries(source).reduce(
    (groups, [key, value]) => {
      const state = cleanText(value || "", 40);
      const label = labels[key] || key;
      if (!groups[state]) {
        groups[state] = [];
      }
      groups[state].push(label);
      return groups;
    },
    { granted: [], prompt: [], denied: [], unsupported: [] }
  );
}

function isTruthyValue(value) {
  return value === true || value === "true" || value === "1" || value === "granted";
}

function isFalsyValue(value) {
  return value === false || value === "false" || value === "0" || value === "";
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function shortHash(value) {
  const hash = cleanText(value || "", 80);
  return hash ? `${hash.slice(0, 16)}...` : "";
}

function summarizeList(value) {
  const items = cleanText(value || "", 1000)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length <= 12) {
    return items.join(", ");
  }

  return `${items.slice(0, 12).join(", ")} 외 ${items.length - 12}개`;
}

const STORAGE_LABELS = {
  localStorage: "localStorage",
  sessionStorage: "sessionStorage",
  indexedDB: "IndexedDB",
  cacheStorage: "Cache Storage",
  cookies: "Cookies"
};

const PERMISSION_LABELS = {
  geolocation: "위치",
  notifications: "알림",
  camera: "카메라",
  microphone: "마이크",
  "persistent-storage": "영구 저장소",
  "clipboard-read": "클립보드 읽기",
  "clipboard-write": "클립보드 쓰기",
  "local-fonts": "로컬 폰트"
};

const CAPABILITY_LABELS = {
  serviceWorker: "Service Worker",
  pushManager: "Push",
  notification: "Notification",
  bluetooth: "Bluetooth",
  usb: "USB",
  serial: "Serial",
  hid: "HID",
  nfc: "NFC",
  credentials: "Credentials",
  paymentRequest: "Payment Request",
  share: "Share",
  clipboard: "Clipboard",
  contacts: "Contacts",
  wakeLock: "Wake Lock",
  webGL: "WebGL",
  webGL2: "WebGL2",
  webGPU: "WebGPU",
  wasm: "WebAssembly",
  worker: "Worker",
  sharedWorker: "SharedWorker",
  broadcastChannel: "BroadcastChannel",
  webSocket: "WebSocket",
  eventSource: "EventSource",
  speechSynthesis: "Speech Synthesis",
  speechRecognition: "Speech Recognition",
  touchEvent: "Touch Event",
  pointerEvent: "Pointer Event"
};

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
