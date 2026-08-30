/**
 * 새 인수인계 알림에 쓰는 도구들 — 알림음, 브라우저 알림, 내가 쓴 글 표시.
 *
 * 서버가 없으니 "새 글이 올라왔다"를 알 수 있는 건 앱이 켜져 있는 동안뿐이다.
 * 전 매장 onSnapshot 구독은 이미 돌고 있으므로(useAllHandoffs), 그 순간에
 * 소리와 브라우저 알림을 얹는 것으로 충분하다. 앱을 아예 껐을 때도 받으려면
 * 발송해 줄 서버가 따로 있어야 한다.
 */

const SOUND_KEY = 'handoff_alert_sound';

// 내가 방금 등록한 글로 나한테 알림이 오면 안 된다.
const selfIds = new Set();

export function markSelfHandoff(id) {
  if (id) selfIds.add(String(id));
}

export function isSelfHandoff(id) {
  return selfIds.has(String(id));
}

export function isSoundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveSoundOn(on) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // 저장이 막혀도 이번 세션 동안은 그대로 동작한다
  }
}

let audioCtx = null;

/** 짧은 두 음. 음원 파일을 따로 두지 않으려고 WebAudio 로 만든다. */
export function playAlertSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const start = audioCtx.currentTime;
    [880, 1174.7].forEach((freq, i) => {
      const at = start + i * 0.16;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + 0.16);
    });
  } catch {
    // 소리는 덤이라 막히면 그냥 넘어간다
  }
}

export const notificationSupported =
  typeof window !== 'undefined' && 'Notification' in window;

export function currentPermission() {
  return notificationSupported ? Notification.permission : 'unsupported';
}

/** 권한 요청은 사용자가 직접 버튼을 눌렀을 때만 통한다. */
export async function askNotificationPermission() {
  if (!notificationSupported) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showBrowserNotification({ title, body, tag, onClick }) {
  if (!notificationSupported || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
    });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
  } catch {
    // 서비스워커 없이는 못 띄우는 브라우저가 있다 — 화면 안 알림으로 대신한다
  }
}
