/**
 * 이 브라우저를 가리키는 임의의 값.
 *
 * 로그인이 없으니 "누가 썼는지"는 알 수 없지만 "어느 기기에서 썼는지"는 알 수 있다.
 * 내가 올린 인수인계 알림이 내 폰으로 되돌아오는 걸 막는 데만 쓴다.
 */
const KEY = 'esc_device_id';

let cached = null;

export function getDeviceId() {
  if (cached) return cached;
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    // 저장이 막힌 브라우저 — 이번 세션 동안만 쓰는 값으로 대신한다
    cached = 'temp-' + Math.random().toString(36).slice(2, 10);
    return cached;
  }
}
