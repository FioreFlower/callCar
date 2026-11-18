# Call Car

차량에 부착된 QR 코드로 접속해 차주에게 이동을 요청하는 사이트입니다. 요청은 차주의 Telegram 봇 채팅에 전달되며, 차주가 해당 알림에 답장하면 요청을 보낸 탭에 답변이 표시됩니다. 연락처 입력은 선택입니다.

- [운영 사이트](https://callcar.pages.dev/)
- [운영 설정](#운영-설정)
- [동작 확인](#동작-확인)
- [문제 해결](#문제-해결)
- [로컬 실행](#로컬-실행)

## 이용 방법

1. QR 코드로 접속해 차량번호를 확인합니다.
2. 요청 내용을 확인하고 Turnstile 검증을 완료한 뒤 **차량 이동 요청 보내기**를 누릅니다.
3. 차주는 Telegram에서 해당 알림을 선택하고 **답장**으로 텍스트를 보냅니다.
4. 요청자는 같은 탭의 **차주 답변**에서 확인합니다. 열린 화면은 약 6초마다 답변을 확인하며, 같은 탭에서 새로고침해도 요청 후 30분까지 조회할 수 있습니다. 만료된 기록은 이후 새 답장 세션이 생성될 때 정리됩니다.

## 운영 설정

Cloudflare **Workers 및 Pages → callcar → 설정 → Production**에서 관리합니다. 운영 사이트의 D1 연결과 Telegram 답장 수신은 2026-11-19(KST)에 확인했습니다.

### 변수와 비밀

| 이름 | 유형 | 용도 |
| --- | --- | --- |
| `VEHICLE_NUMBER` | 텍스트 | 화면에 표시할 차량번호 |
| `TELEGRAM_BOT_TOKEN` | 비밀 | BotFather에서 발급한 봇 토큰 |
| `TELEGRAM_CHAT_ID` | 비밀 | 이동 요청 알림을 받을 Telegram 채팅 ID |
| `PUBLIC_TURNSTILE_SITE_KEY` | 텍스트 | 브라우저에서 사용하는 Turnstile 사이트 키 |
| `PRIVATE_TURNSTILE_SECRET_KEY` | 비밀 | 서버에서 Turnstile 응답을 검증하는 키 |
| `TELEGRAM_WEBHOOK_SECRET` | 비밀 | Telegram 웹훅 요청을 검증하는 값 |
| `TELEGRAM_REPLY_OWNER_ID` | 텍스트 | 단체 채팅에서 답변을 등록할 차주의 숫자 사용자 ID. 개인 채팅에서는 생략 가능 |

실제 차량번호, 채팅 ID, 토큰, 비밀 값은 공개 저장소에 커밋하지 않습니다. 웹훅 비밀 값은 개인 환경에서 `openssl rand -hex 32`로 생성할 수 있습니다.

### Cloudflare 바인딩

| 이름 | 유형 | 용도 |
| --- | --- | --- |
| `REQUEST_LIMITS` | Workers KV | 같은 IP의 요청을 10분에 3회로 제한 |
| `CAR_REPLIES` | D1 | 요청별 답변과 조회 만료 시각 저장 |

새 환경을 구성할 때 D1 데이터베이스 `callcar-replies`를 생성하고 [답장 스키마](db/replies.sql)를 적용합니다. 저장소 루트에서 실행합니다.

```bash
npx wrangler d1 execute callcar-replies --remote --file=db/replies.sql
```

Production에서 이 데이터베이스를 `CAR_REPLIES`에 연결합니다. 변수나 바인딩을 변경한 뒤에는 운영 환경을 다시 배포합니다. 요청 API는 Turnstile 외에도 Origin, 허니팟 필드, 제출 시각을 확인합니다.

### Telegram 웹훅

1. [getWebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo)로 현재 주소를 확인합니다. 다른 서비스의 주소가 등록돼 있다면 변경 전에 그 서비스의 사용 여부를 확인합니다.
2. 새 설정이 적용된 운영 배포를 확인한 뒤, [setWebhook](https://core.telegram.org/bots/api#setwebhook)에 다음 JSON을 POST합니다. 봇 토큰을 사용하는 API 호출은 개인 환경에서 실행합니다.

   ```json
   {
     "url": "https://callcar.pages.dev/api/telegram-webhook",
     "secret_token": "<TELEGRAM_WEBHOOK_SECRET과 같은 값>",
     "allowed_updates": ["message"]
   }
   ```

3. `getWebhookInfo`를 다시 호출해 등록된 `url`이 위 주소와 일치하는지 확인합니다.

D1 바인딩이나 웹훅 비밀 값이 빠져 있으면 기존 Telegram 이동 요청 알림만 작동합니다. 웹훅을 사용하는 동안 해당 봇은 `getUpdates`로 업데이트를 받을 수 없습니다. [Telegram Bot API](https://core.telegram.org/bots/api#setwebhook)

### 배포

| 항목 | 값 |
| --- | --- |
| 운영 브랜치 | `main` |
| 빌드 명령 | 비워 둠 |
| 빌드 출력 | `public` |
| Pages Functions | `functions` |

[GitHub Actions 워크플로](.github/workflows/cloudflare-pages.yml)는 `main`에 변경이 올라오거나 수동으로 실행할 때 배포합니다. 이 워크플로에는 저장소 비밀 `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`가 필요합니다. Wrangler로 직접 운영 배포할 때는 `npm run deploy`를 사용합니다.

## 동작 확인

1. 운영 사이트에서 Turnstile 검증을 완료하고 실제 이동이 필요 없다는 내용의 테스트 요청을 한 건 보냅니다.
2. 웹 화면에서 전송 성공과 **차주 답변** 대기 표시를 확인합니다.
3. Telegram에서 도착한 테스트 알림에 **답장**으로 텍스트를 보냅니다.
4. 요청 탭을 열어 둔 상태에서 답변이 자동으로 표시되는지 확인합니다.
5. 같은 운영 주소를 별도 탭에서 직접 열어, 테스트 답변이 그 탭에도 표시되는지 비교합니다. 요청 탭에만 표시되면 정상입니다.

## 문제 해결

| 증상 | 확인할 항목 |
| --- | --- |
| 요청이 전송되지 않음 | Turnstile 완료 여부, Telegram 봇 토큰과 채팅 ID, Pages 배포 기록을 확인합니다. |
| 요청이 너무 많다는 메시지 | 화면 안내에 표시된 시간만큼 기다립니다. |
| Telegram 알림은 오지만 답변 영역이 없음 | `CAR_REPLIES`, 스키마, `TELEGRAM_WEBHOOK_SECRET`이 현재 Production 배포에 적용됐는지 확인합니다. |
| 답변 영역에 대기 문구만 표시됨 | 해당 알림에 Telegram **답장**을 보냈는지, 등록된 웹훅 주소와 비밀 값이 맞는지 확인합니다. 단체 채팅이면 답장 발신자 ID도 확인합니다. |
| 예전에 보낸 요청의 답변이 보이지 않음 | 요청 후 30분이 지났는지, 요청을 보낸 탭을 열고 있는지 확인합니다. |

## 로컬 실행

Node.js 20 이상에서 실행합니다. 테스트용 설정을 사용하면 운영 봇으로 테스트 알림이 가는 일을 피할 수 있습니다.

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

`.dev.vars`를 채운 뒤 Wrangler가 표시하는 주소로 접속합니다. 보통 `http://localhost:8788`입니다.

## 저장소 구조

| 경로 | 역할 |
| --- | --- |
| [public/](public/) | Vue 3 요청 화면, 보안 헤더, 검색 색인 차단 설정 |
| [functions/api/config.js](functions/api/config.js) | 차량번호와 공개 Turnstile 키 제공 |
| [functions/api/request.js](functions/api/request.js) | 요청 검증, 요청 제한, Telegram 알림 전송 |
| [functions/api/telegram-webhook.js](functions/api/telegram-webhook.js) | 차주의 Telegram 답장 확인 및 저장 |
| [functions/api/reply.js](functions/api/reply.js) | 요청별 비공개 키로 답변 조회 |
| [db/replies.sql](db/replies.sql) | D1 답장 테이블과 인덱스 |
