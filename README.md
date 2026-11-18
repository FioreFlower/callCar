# Call Car

QR 코드로 접속한 사람이 차량 이동 요청 메시지를 보내면 텔레그램 봇으로 차주에게 전달되는 Cloudflare Pages 앱입니다.

## 구조

- `public/`: Vue 3 기반 정적 페이지
- `functions/api/request.js`: 텔레그램 전송 API
- `functions/api/config.js`: 공개 설정 API
- `public/_headers`: 보안 헤더
- `public/robots.txt`: 검색 색인 차단

## 환경변수

Cloudflare Pages의 Production 환경변수에 아래 값을 설정합니다.

```text
TELEGRAM_BOT_TOKEN=BotFather에서 받은 봇 토큰
TELEGRAM_CHAT_ID=메시지를 받을 텔레그램 chat id
VEHICLE_NUMBER=페이지에 표시할 차량번호
PUBLIC_TURNSTILE_SITE_KEY=Turnstile Site key
PRIVATE_TURNSTILE_SECRET_KEY=Turnstile Secret key
```

`PUBLIC_TURNSTILE_SITE_KEY`는 브라우저로 내려가는 공개값입니다. `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `PRIVATE_TURNSTILE_SECRET_KEY`는 secret으로 관리하세요.

## 스팸 방지

- Turnstile 검증
- 허니팟 필드
- 제출 시간 검증
- Origin 검증
- KV 기반 IP 제한

KV 바인딩 이름:

```text
REQUEST_LIMITS
```

제한값은 같은 IP 기준 10분에 3회입니다.

## 로컬 실행

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

로컬 주소는 Wrangler 출력값을 사용하세요. 보통 `http://localhost:8788`입니다.

## Cloudflare Pages 배포

Pages 설정:

```text
Build command: 비워두기
Build output directory: public
Functions directory: functions
Production branch: main
```

직접 배포:

```bash
npm run deploy
```

GitHub Actions 배포를 쓰려면 GitHub repository secrets에 아래 값을 넣습니다.

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

## 텔레그램 Chat ID 확인

봇에게 아무 메시지나 보낸 뒤 아래 주소를 브라우저에서 엽니다.

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

응답의 `chat.id` 값을 `TELEGRAM_CHAT_ID`로 사용합니다.

## 보안 메모

- 차량번호와 토큰은 공개 저장소 코드에 넣지 않습니다.
- 실제 QR 코드에는 배포된 HTTPS 주소를 넣습니다.
- `callcar.pages.dev` 기본 도메인을 쓰면 Zone 단위 WAF/Bot Fight 설정은 제한적입니다.
- 커스텀 도메인을 연결하면 해당 Zone에서 WAF, Bot Fight Mode, Rate limiting rule을 추가로 설정할 수 있습니다.

## Telegram 답장 표시

요청 알림에 Telegram의 **답장** 기능으로 텍스트를 보내면 요청을 보낸 탭에 표시됩니다. 화면이 열려 있는 동안 약 6초 간격으로 확인하며, 같은 탭에서 새로고침해도 요청 후 30분까지 답변을 확인할 수 있습니다. 이후 조회가 만료됩니다. 만료된 기록은 다음 답장 세션이 생성될 때 정리됩니다.

### Cloudflare 설정

1. D1 데이터베이스를 만들고 아래 명령을 저장소 루트에서 실행해 스키마를 적용합니다. 데이터베이스 이름이 다르면 명령의 이름을 바꿉니다.

   ```bash
   npx wrangler d1 execute callcar-replies --remote --file=db/replies.sql
   ```

2. Pages 프로젝트의 Production 설정에서 위 데이터베이스를 `CAR_REPLIES`라는 D1 바인딩으로 추가합니다.
3. Pages의 Production 환경에 `TELEGRAM_WEBHOOK_SECRET`을 Secret으로 추가합니다. 예를 들어 `openssl rand -hex 32`로 생성한 값을 사용합니다.
4. 봇과의 개인 채팅은 기존 `TELEGRAM_CHAT_ID`를 사용합니다. 단체 채팅을 쓰는 경우 답장을 보낼 차주의 숫자 Telegram 사용자 ID를 `TELEGRAM_REPLY_OWNER_ID`에 설정합니다.
5. Pages를 다시 배포합니다. 기존 Telegram 및 Turnstile 환경변수와 `REQUEST_LIMITS` 바인딩은 계속 사용합니다.

### Telegram 웹훅 등록

1. 봇의 `getWebhookInfo`를 확인합니다. 다른 서비스가 사용하는 웹훅이 등록돼 있으면 그 서비스에 영향을 주므로 등록 주소를 바꾸기 전에 확인합니다.
2. 배포 후 [Telegram Bot API의 setWebhook](https://core.telegram.org/bots/api#setwebhook)에 아래 JSON으로 POST합니다. API 주소는 `https://api.telegram.org/bot<BOT_TOKEN>/setWebhook`입니다. 봇 토큰과 웹훅 시크릿은 개인 환경에서만 사용합니다.

   ```json
   {
     "url": "https://<PRODUCTION_HOST>/api/telegram-webhook",
     "secret_token": "<TELEGRAM_WEBHOOK_SECRET과 동일한 값>",
     "allowed_updates": ["message"]
   }
   ```

3. 요청을 새로 보내고 Telegram에서 해당 알림에 답장합니다. 요청한 탭에는 답변이 표시되고, 별도 시크릿 창에는 표시되지 않는지 확인합니다.

D1 바인딩이나 웹훅 시크릿이 없으면 기존 차량 이동 알림만 작동합니다.
