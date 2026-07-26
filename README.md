# Call Car

QR 코드로 접속한 사람이 차량 이동 요청 메시지를 보내면 텔레그램 봇으로 전달되는 Cloudflare Pages 웹페이지입니다.

## 설정

차량번호는 `public/script.js`에서 아래 부분을 실제 번호로 바꾸면 됩니다.

```js
const vehicleNumber = "56너 2855";
```

Cloudflare Pages 프로젝트의 환경 변수에 아래 값을 추가합니다.

- `TELEGRAM_BOT_TOKEN`: BotFather에서 받은 봇 토큰
- `TELEGRAM_CHAT_ID`: 메시지를 받을 채팅 ID
- `ALLOWED_ORIGIN`: 선택 사항. 커스텀 도메인을 쓴다면 `https://example.com`처럼 입력

Turnstile을 쓰려면 Cloudflare에서 Turnstile 위젯을 만든 뒤 아래도 설정합니다.

- `TURNSTILE_SECRET_KEY`: Turnstile Secret key
- `public/script.js`의 `turnstileSiteKey`: Turnstile Site key

스팸 방지를 위해 KV 네임스페이스도 하나 연결합니다.

- Binding name: `REQUEST_LIMITS`
- 제한값: 같은 IP 기준 10분에 3회

KV 없이도 배포는 가능하지만, IP별 반복 요청 제한은 동작하지 않습니다.

## Cloudflare 보안 권장 설정

- SSL/TLS mode: `Full (strict)`
- Always Use HTTPS: 켜기
- Automatic HTTPS Rewrites: 켜기
- Bot Fight Mode: 켜기
- Security Level: `Medium`
- WAF custom rule: `/api/request` 경로에 대해 위협 점수가 높은 요청은 Challenge
- Rate limiting rule: `/api/request` 기준 같은 IP에서 10분 3회 초과 시 차단 또는 Challenge

## Cloudflare Pages 배포

Pages 설정값은 아래처럼 두면 됩니다.

- Build command: 비워두기
- Build output directory: `public`
- Functions directory: `functions`

GitHub 저장소를 연결해서 배포하거나 Wrangler로 직접 배포할 수 있습니다.

```bash
npm run deploy
```

로컬에서 Pages Functions까지 같이 테스트하려면 Wrangler가 필요합니다.

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

## 텔레그램 Chat ID 확인

봇에게 아무 메시지나 보낸 뒤 아래 주소를 브라우저에서 열어 `chat.id` 값을 확인할 수 있습니다.

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

## 배포 메모

실제 QR 코드에는 Cloudflare Pages에서 발급된 HTTPS 주소를 넣으세요. 봇 토큰은 반드시 Cloudflare 환경 변수에만 저장하고, `public` 폴더 안 파일이나 브라우저 코드에 넣으면 안 됩니다.
