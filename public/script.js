import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

const vehicleNumber = "56너 2855";
const turnstileSiteKey = "";

createApp({
  data() {
    return {
      vehicleNumber,
      message: "차량 이동 부탁드립니다.",
      contact: "",
      website: "",
      isSending: false,
      statusMessage: "",
      statusType: "",
      formLoadedAt: Date.now(),
      turnstileSiteKey,
      turnstileToken: "",
      turnstileWidgetId: null,
    };
  },

  mounted() {
    this.renderTurnstile();
  },

  methods: {
    renderTurnstile() {
      if (!this.turnstileSiteKey) return;

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
            clientInfo: getClientInfo(),
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

function getClientInfo() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    languages: navigator.languages?.join(", "),
    platform: navigator.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: String(window.devicePixelRatio || 1),
    referrer: document.referrer || "",
  };
}
