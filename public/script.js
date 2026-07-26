import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

createApp({
  data() {
    return {
      vehicleNumber: "",
      message: "차량 이동 부탁드립니다.",
      contact: "",
      website: "",
      isSending: false,
      statusMessage: "",
      statusType: "",
      formLoadedAt: Date.now(),
      turnstileSiteKey: "",
      turnstileToken: "",
      turnstileWidgetId: null,
    };
  },

  mounted() {
    this.loadConfig();
  },

  methods: {
    async loadConfig() {
      try {
        const response = await fetch("/api/config", { cache: "no-store" });
        if (!response.ok) return;

        const config = await response.json();
        this.turnstileSiteKey = config.turnstileSiteKey || "";
        this.vehicleNumber = config.vehicleNumber || "차량번호 확인 필요";
        this.$nextTick(() => this.renderTurnstile());
      } catch {
        this.turnstileSiteKey = "";
        this.vehicleNumber = "차량번호 확인 필요";
      }
    },

    renderTurnstile() {
      if (!this.turnstileSiteKey) return;

      loadTurnstileScript();

      const waitForTurnstile = window.setInterval(() => {
        if (!window.turnstile || !this.$refs.turnstile) return;

        window.clearInterval(waitForTurnstile);
        this.turnstileWidgetId = window.turnstile.render(this.$refs.turnstile, {
          sitekey: this.turnstileSiteKey,
          callback: (token) => {
            this.turnstileToken = token;
          },
          "expired-callback": () => {
            this.turnstileToken = "";
          },
          "error-callback": () => {
            this.turnstileToken = "";
            this.setStatus("스팸 방지 확인을 다시 시도해 주세요.", "error");
          },
        });
      }, 100);
    },

    async submitRequest() {
      this.setStatus("", "");

      if (this.turnstileSiteKey && !this.turnstileToken) {
        this.setStatus("스팸 방지 확인을 완료해 주세요.", "error");
        return;
      }

      this.isSending = true;

      try {
        const response = await fetch("/api/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vehicleNumber: this.vehicleNumber,
            message: this.message,
            contact: this.contact,
            website: this.website,
            page: window.location.href,
            formLoadedAt: this.formLoadedAt,
            clientInfo: await getClientInfo(),
            turnstileToken: this.turnstileToken,
          }),
        });

        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result.message || "전송에 실패했습니다.");
        }

        this.message = "";
        this.contact = "";
        this.website = "";
        this.turnstileToken = "";
        this.formLoadedAt = Date.now();
        this.resetTurnstile();
        this.setStatus("전송되었습니다. 감사합니다.", "success");
      } catch (error) {
        this.setStatus(error.message || "잠시 후 다시 시도해 주세요.", "error");
        this.resetTurnstile();
      } finally {
        this.isSending = false;
      }
    },

    resetTurnstile() {
      if (!window.turnstile || this.turnstileWidgetId === null) return;
      window.turnstile.reset(this.turnstileWidgetId);
      this.turnstileToken = "";
    },

    setStatus(message, type) {
      this.statusMessage = message;
      this.statusType = type;
    },
  },
}).mount("#app");

function loadTurnstileScript() {
  if (document.querySelector("[data-turnstile-script]")) return;

  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.dataset.turnstileScript = "true";
  document.head.append(script);
}

async function getClientInfo() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  return {
    page: getPageInfo(),
    navigator: getNavigatorInfo(),
    screen: getScreenInfo(),
    window: getWindowInfo(),
    storage: await getStorageInfo(),
    network: getNetworkInfo(connection),
    permissions: await getPermissionInfo(),
    media: await getMediaInfo(),
    capabilities: getCapabilityInfo(),
    fingerprints: await getFingerprintInfo(),
  };
}

function getPageInfo() {
  return {
    url: window.location.href,
    origin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    title: document.title,
    referrer: document.referrer || "",
    visibilityState: document.visibilityState,
    prerendering: String(document.prerendering || false),
    readyState: document.readyState,
    historyLength: String(history.length || ""),
  };
}

function getNavigatorInfo() {
  const userAgentData = navigator.userAgentData
    ? {
        brands: navigator.userAgentData.brands?.map((brand) => `${brand.brand} ${brand.version}`).join(", "),
        mobile: String(navigator.userAgentData.mobile),
        platform: navigator.userAgentData.platform,
      }
    : {};

  return {
    userAgent: navigator.userAgent,
    appCodeName: navigator.appCodeName,
    appName: navigator.appName,
    appVersion: navigator.appVersion,
    vendor: navigator.vendor,
    vendorSub: navigator.vendorSub,
    product: navigator.product,
    productSub: navigator.productSub,
    platform: navigator.platform,
    language: navigator.language,
    languages: navigator.languages?.join(", "),
    cookieEnabled: String(navigator.cookieEnabled),
    doNotTrack: navigator.doNotTrack || window.doNotTrack || "",
    online: String(navigator.onLine),
    webdriver: String(navigator.webdriver || false),
    maxTouchPoints: String(navigator.maxTouchPoints || 0),
    hardwareConcurrency: String(navigator.hardwareConcurrency || ""),
    deviceMemory: String(navigator.deviceMemory || ""),
    pdfViewerEnabled: String(navigator.pdfViewerEnabled ?? ""),
    globalPrivacyControl: String(navigator.globalPrivacyControl ?? ""),
    userAgentData,
  };
}

function getScreenInfo() {
  return {
    size: `${screen.width}x${screen.height}`,
    availableSize: `${screen.availWidth}x${screen.availHeight}`,
    colorDepth: String(screen.colorDepth || ""),
    pixelDepth: String(screen.pixelDepth || ""),
    orientation: getScreenOrientation(),
    devicePixelRatio: String(window.devicePixelRatio || 1),
  };
}

function getWindowInfo() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    outerSize: `${window.outerWidth}x${window.outerHeight}`,
    scroll: `${window.scrollX || 0},${window.scrollY || 0}`,
    timezone,
    timezoneOffset: String(new Date().getTimezoneOffset()),
    localeTime: new Date().toString(),
    performanceTimeOrigin: String(Math.round(performance.timeOrigin || 0)),
    performanceNow: String(Math.round(performance.now())),
  };
}

function getScreenOrientation() {
  return screen.orientation
    ? `${screen.orientation.type || ""} ${screen.orientation.angle ?? ""}`.trim()
    : String(window.orientation ?? "");
}

async function getStorageInfo() {
  const estimate = navigator.storage?.estimate
    ? await navigator.storage.estimate().catch(() => null)
    : null;

  return {
    localStorage: String(canUseStorage("localStorage")),
    sessionStorage: String(canUseStorage("sessionStorage")),
    indexedDB: String("indexedDB" in window),
    cacheStorage: String("caches" in window),
    cookies: String(navigator.cookieEnabled),
    quota: estimate?.quota ? String(estimate.quota) : "",
    usage: estimate?.usage ? String(estimate.usage) : "",
    persisted: navigator.storage?.persisted
      ? String(await navigator.storage.persisted().catch(() => ""))
      : "",
  };
}

function canUseStorage(name) {
  try {
    const key = "__callcar_storage_check__";
    window[name].setItem(key, "1");
    window[name].removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function getNetworkInfo(connection) {
  return connection
    ? {
        effectiveType: connection.effectiveType || "",
        downlink: String(connection.downlink || ""),
        downlinkMax: String(connection.downlinkMax || ""),
        rtt: String(connection.rtt || ""),
        saveData: String(connection.saveData || false),
      }
    : {};
}

async function getPermissionInfo() {
  if (!navigator.permissions?.query) return {};

  const names = [
    "geolocation",
    "notifications",
    "camera",
    "microphone",
    "persistent-storage",
    "clipboard-read",
    "clipboard-write",
    "local-fonts",
  ];
  const result = {};

  await Promise.all(
    names.map(async (name) => {
      try {
        result[name] = (await navigator.permissions.query({ name })).state;
      } catch {
        result[name] = "unsupported";
      }
    })
  );

  return result;
}

async function getMediaInfo() {
  const devices = navigator.mediaDevices?.enumerateDevices
    ? await navigator.mediaDevices.enumerateDevices().catch(() => [])
    : [];

  return {
    enumerateDevices: String(Boolean(navigator.mediaDevices?.enumerateDevices)),
    audioInputs: String(devices.filter((device) => device.kind === "audioinput").length),
    audioOutputs: String(devices.filter((device) => device.kind === "audiooutput").length),
    videoInputs: String(devices.filter((device) => device.kind === "videoinput").length),
    labelsVisible: String(devices.some((device) => Boolean(device.label))),
  };
}

function getCapabilityInfo() {
  return {
    serviceWorker: String("serviceWorker" in navigator),
    pushManager: String("PushManager" in window),
    notification: String("Notification" in window),
    bluetooth: String("bluetooth" in navigator),
    usb: String("usb" in navigator),
    serial: String("serial" in navigator),
    hid: String("hid" in navigator),
    nfc: String("NDEFReader" in window),
    credentials: String("credentials" in navigator),
    paymentRequest: String("PaymentRequest" in window),
    share: String("share" in navigator),
    clipboard: String("clipboard" in navigator),
    contacts: String("contacts" in navigator),
    wakeLock: String("wakeLock" in navigator),
    webGL: String(Boolean(getWebGLContext())),
    webGL2: String(Boolean(getWebGL2Context())),
    webGPU: String("gpu" in navigator),
    wasm: String("WebAssembly" in window),
    worker: String("Worker" in window),
    sharedWorker: String("SharedWorker" in window),
    broadcastChannel: String("BroadcastChannel" in window),
    webSocket: String("WebSocket" in window),
    eventSource: String("EventSource" in window),
    speechSynthesis: String("speechSynthesis" in window),
    speechRecognition: String("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    touchEvent: String("TouchEvent" in window),
    pointerEvent: String("PointerEvent" in window),
  };
}

async function getFingerprintInfo() {
  return {
    canvas: await getCanvasFingerprint(),
    webGL: getWebGLFingerprint(),
    audio: await getAudioFingerprint(),
    fonts: getFontHints(),
    plugins: getPluginInfo(),
    mimeTypes: getMimeTypeInfo(),
  };
}

async function getCanvasFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "top";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 280, 80);
    ctx.fillStyle = "#069";
    ctx.font = "16px Arial";
    ctx.fillText("CallCar security awareness 12345", 8, 8);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.font = "18px Georgia";
    ctx.fillText("브라우저 지문 확인", 8, 36);
    return await hashText(canvas.toDataURL());
  } catch {
    return "";
  }
}

function getWebGLFingerprint() {
  const gl = getWebGLContext();
  if (!gl) return {};

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const parameters = {
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maxTextureSize: String(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    maxViewportDims: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)).join("x"),
    aliasedLineWidthRange: Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)).join(","),
    aliasedPointSizeRange: Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)).join(","),
  };

  return parameters;
}

async function getAudioFingerprint() {
  const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContext) return "";

  try {
    const context = new AudioContext(1, 5000, 44100);
    const oscillator = context.createOscillator();
    const compressor = context.createDynamicsCompressor();

    oscillator.type = "triangle";
    oscillator.frequency.value = 10000;
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;
    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const buffer = await context.startRendering();
    const samples = Array.from(buffer.getChannelData(0).slice(4500, 5000))
      .map((sample) => sample.toFixed(6))
      .join(",");
    return await hashText(samples);
  } catch {
    return "";
  }
}

function getFontHints() {
  const fonts = [
    "Arial",
    "Courier New",
    "Georgia",
    "Times New Roman",
    "Verdana",
    "Apple SD Gothic Neo",
    "Malgun Gothic",
    "Noto Sans KR",
    "Roboto",
    "San Francisco",
  ];
  const base = "monospace";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const text = "mmmmmmmmmmlli";

  ctx.font = `72px ${base}`;
  const baseWidth = ctx.measureText(text).width;

  return fonts
    .filter((font) => {
      ctx.font = `72px "${font}", ${base}`;
      return ctx.measureText(text).width !== baseWidth;
    })
    .join(", ");
}

function getPluginInfo() {
  return Array.from(navigator.plugins || [])
    .map((plugin) => `${plugin.name} (${plugin.filename || ""})`)
    .slice(0, 20)
    .join(" | ");
}

function getMimeTypeInfo() {
  return Array.from(navigator.mimeTypes || [])
    .map((mimeType) => mimeType.type)
    .slice(0, 40)
    .join(", ");
}

function getWebGLContext() {
  const canvas = document.createElement("canvas");
  return canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
}

function getWebGL2Context() {
  const canvas = document.createElement("canvas");
  return canvas.getContext("webgl2");
}

async function hashText(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
