/**
 * 웹 푸시 공개키(VAPID public key).
 *
 * 공개되어도 안전한 값이다 — 이걸로는 알림을 보낼 수 없고, 짝이 되는 비밀키는
 * Cloudflare Worker 에만 들어간다. 그래서 소스에 그대로 둔다.
 *
 * 만드는 법: worker/README.md 참고 (`node scripts/gen-vapid.mjs`)
 * 비어 있으면 휴대폰 알림 기능이 화면에 뜨지 않는다.
 */
export const VAPID_PUBLIC_KEY = '';
