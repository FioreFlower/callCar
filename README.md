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
