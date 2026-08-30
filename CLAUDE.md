# ESCADMIN1

지점 운영 관리 도구. React 19 + Vite, 데이터는 Firebase Firestore
(`.env`가 없으면 localStorage로 대체 동작).

## 작업 후 확인

```bash
npm run build   # 반드시 통과해야 한다
npx eslint <수정한 파일>
```

`npm run lint`은 저장소 전체에 기존 오류(`react-hooks/*`)가 남아 있어
전부 통과하지 않는다. 새로 만든 오류가 없는지만 수정한 파일 단위로 본다.

## 게시 (커밋·푸시)

"커밋 푸시해줘"는 **main까지 반영해서 게시하라는 뜻**이다. 작업 브랜치에
올려두고 멈추지 말고, 다음까지 한 번에 끝낸다.

1. 빌드·린트 확인
2. 커밋 → 작업 브랜치 push
3. main으로 fast-forward 머지 → `git push origin main`
4. 결과를 한 줄로 보고

되돌리기 어려운 것만 따로 묻는다: force push, 히스토리 재작성,
원격 브랜치 삭제, 되돌릴 수 없는 파일 삭제.

작업 브랜치에서 커밋한다. 머지 직후에는 로컬이 main에 머물러 있으니,
다음 작업을 시작하기 전에 작업 브랜치로 돌아왔는지 확인한다.

## 코드 관례

- 화면 문구·주석·커밋 메시지는 한국어로 쓴다.
- 목록 한 줄에 입력칸을 새로 끼워 넣지 않는다. 폭이 모자라 버튼이 밀린다.
  담당자 이름처럼 처리할 때 받아야 하는 값은
  `components/CheckerConfirm.jsx` 확인창으로 받는다.
- 입력값은 주변 코드처럼 `onChange`에서 바로 저장한다 (메모·날짜 칸과 동일).

## 알림

인수인계 알림은 두 벌로 나뉜다. 고칠 때 어느 쪽인지 보고 손댄다.

- **앱이 켜져 있을 때** — `hooks/useHandoffAlerts.js`, `components/HandoffToasts.jsx`.
  전 매장 `handoffs` 구독에서 새 글을 잡아 화면 알림·소리·브라우저 알림을 낸다.
- **앱이 꺼져 있을 때** — `worker/` (Cloudflare Worker). 이 저장소와 따로 배포된다.
  `npm run build` 나 GitHub Pages 배포로는 안 올라가니 `worker/README.md` 를 본다.

`src/data/pushConfig.js` 의 공개키가 비어 있으면 휴대폰 알림 기능은 화면에 뜨지 않는다.
