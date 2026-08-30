# 인수인계 푸시 발송기

앱을 껐어도 새 인수인계 알림이 오게 하는 부분이다.

앱 안의 알림(화면 오른쪽 아래 카드, 브라우저 알림)은 앱이 켜져 있어야만 뜬다.
그건 앱이 직접 하고, 여기는 **앱이 꺼져 있을 때**를 맡는다.

```
(1분마다) Cloudflare Worker → Firestore "새 인수인계 있나?"
                            → 있으면 → 구독한 기기의 푸시 서버 → 폰 알림
```

앱이 Worker 를 직접 부르게 하면 즉시 보낼 수 있지만, 저장소가 공개라 Worker 주소가
그대로 드러나고 아무나 가짜 알림을 쏠 수 있다. 이쪽은 밖으로 열리는 게 없고
대신 최대 1분 늦는다.

## 설치 순서 (터미널 없이, 브라우저만으로)

1. Cloudflare 에서 Worker 를 만들고 이 폴더(`worker/`)의 코드를 올린다.
   저장소를 연결해두면 이후 코드가 바뀔 때 자동으로 다시 올라간다.
2. 배포된 주소 뒤에 `/genkey` 를 붙여 연다. 열쇠 두 개가 나온다.
3. 비밀 열쇠 → Cloudflare 설정의 `VAPID_PRIVATE_KEY` (Secret 로)
4. 공개 열쇠 → `src/data/pushConfig.js` 의 `VAPID_PUBLIC_KEY`
5. Cron Trigger 를 `* * * * *` 로 넣는다 (wrangler 로 배포하면 자동으로 붙는다)

`/genkey` 는 부를 때마다 새 열쇠를 만들어 보여줄 뿐 저장하지 않는다.
실제로 쓰는 열쇠와는 상관이 없으므로 설치 후 그냥 두면 된다.

## 설치 순서 (터미널이 있을 때)

### 1. 키 한 쌍 만들기

```bash
cd worker
npm install
npm run vapid
```

공개키와 비밀키가 출력된다.
**출력된 값을 그대로 써야 한다** — 문서나 대화에 예시로 적힌 키는 이미 남에게 보인
것이라 쓰면 안 된다.

### 2. 공개키를 앱에 넣기

출력된 공개키를 `src/data/pushConfig.js` 에 붙여넣는다.

```js
export const VAPID_PUBLIC_KEY = 'B...여기';
```

공개돼도 안전한 값이라 저장소에 그대로 커밋한다. 이 값이 비어 있으면
앱에 휴대폰 알림 버튼 자체가 뜨지 않는다.

### 3. 비밀키를 Cloudflare 에 넣기

```bash
npx wrangler login          # 처음 한 번만
npx wrangler secret put VAPID_PRIVATE_KEY
```

물어보면 출력된 비밀키를 붙여넣는다. **저장소에는 절대 넣지 않는다.**

### 4. Worker 올리기

```bash
npx wrangler deploy
```

### 5. 앱 올리기

`src/data/pushConfig.js` 를 커밋하고 main 에 올리면 GitHub Pages 가 자동 배포한다.

### 6. 각자 폰에서 알림 켜기

- **안드로이드·PC**: 앱 왼쪽 메뉴에서 `📱 휴대폰 알림 받기` → 받을 지점 고르기 → 알림 허용
- **아이폰**: 사파리에서 앱을 연 뒤 공유 버튼 → `홈 화면에 추가`를 **먼저** 해야 한다.
  그 다음 홈 화면 아이콘으로 들어가야 알림 버튼이 보인다. (iOS 16.4 이상)

## 잘 돌아가는지 보기

```
https://escadmin-handoff-push.<계정이름>.workers.dev/health
```

```json
{ "vapid": true, "cursor": "2026-08-30T06:00:00.000Z", "subscriptions": 3 }
```

- `vapid: false` → 3번(비밀키)이 안 들어갔다
- `subscriptions: 0` → 아직 아무도 6번을 안 했다
- `cursor: "아직 없음"` → Worker 가 아직 한 번도 안 돌았다. 1분 기다린다

실시간 로그: `npx wrangler tail`

## 알아둘 것

- **첫 실행 때는 아무것도 안 보낸다.** 기준 시각만 잡는다. 안 그러면 그동안 쌓인
  인수인계가 한꺼번에 날아간다.
- **글을 올린 기기에는 안 보낸다.** 기기마다 붙은 표시(`deviceId`)로 거른다.
- **죽은 구독은 자동으로 지운다.** 푸시 서버가 404/410 을 주면 그 구독을 삭제한다.
  (앱 삭제, 브라우저 데이터 삭제, 폰 교체 등)
- **지점을 늘리면 `src/stores.js` 도 같이 고쳐야 한다.** 알림 제목에 쓸 이름이라
  앱의 `src/data/stores.js` 와 따로 들고 있다.
- 무료 한도 안에서 돈다. Worker 실행 1분마다(하루 1440회, 한도 10만),
  Firestore 읽기는 새 글이 있을 때만이다.
