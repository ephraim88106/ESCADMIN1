import { doc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { VAPID_PUBLIC_KEY } from '../data/pushConfig';
import { getDeviceId } from './deviceId';

/**
 * 웹 푸시 — 앱을 껐어도 오는 알림.
 *
 * 화면 안 알림(useHandoffAlerts)은 앱이 살아 있어야만 뜬다. 이건 다르다.
 * 구독 정보를 Firestore 에 적어두면, Cloudflare Worker 가 새 인수인계를 발견했을 때
 * 그 정보로 브라우저 회사의 푸시 서버에 보내고, 푸시 서버가 폰을 깨운다.
 *
 * 아이폰은 홈 화면에 추가해야만 된다 (iOS 16.4+). 사파리로 그냥 열어본 상태에서는
 * PushManager 자체가 없어서 pushSupported 가 false 가 된다.
 */

export const COLLECTION = 'pushSubscriptions';

/** 전 지점을 뜻하는 값. 본사에서 쓴다. */
export const ALL_STORES = '*';

export const pushConfigured = Boolean(VAPID_PUBLIC_KEY);

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export const isIOS =
  typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent);

/** 홈 화면에서 실행 중인지. 아이폰은 이게 true 여야 푸시를 쓸 수 있다. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 구독 주소를 문서 ID 로 쓴다 — 같은 기기가 여러 건으로 쌓이지 않게. */
async function endpointKey(endpoint) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 하위 경로에 배포될 수 있으므로 빌드 시점의 base 를 그대로 쓴다
const BASE = import.meta.env.BASE_URL;

export async function registerServiceWorker() {
  if (!pushSupported) return null;
  return navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
}

/** 이미 이 브라우저가 구독 중이면 그 구독을 준다. */
export async function getSubscription() {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.getRegistration(BASE);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function saveSubscription(subscription, stores) {
  const payload = {
    endpoint: subscription.endpoint,
    p256dh: bufferToBase64Url(subscription.getKey('p256dh')),
    auth: bufferToBase64Url(subscription.getKey('auth')),
    stores,
    deviceId: getDeviceId(),
    userAgent: navigator.userAgent.slice(0, 200),
    updatedAt: Date.now(),
  };
  if (!isFirebaseConfigured) {
    localStorage.setItem('pushSubscription', JSON.stringify(payload));
    return payload;
  }
  const id = await endpointKey(subscription.endpoint);
  await setDoc(doc(db, COLLECTION, id), payload);
  return payload;
}

/**
 * 알림 권한을 받고 구독한다.
 * @param {string[]} stores 받을 지점 id 목록. 전 지점은 [ALL_STORES].
 */
export async function subscribeToPush(stores) {
  if (!pushSupported) throw new Error('이 브라우저는 휴대폰 알림을 지원하지 않습니다.');
  if (!pushConfigured) throw new Error('알림 키가 아직 설정되지 않았습니다. (worker/README.md)');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('알림이 허용되지 않았습니다. 브라우저 설정에서 알림을 켜주세요.');
  }

  const reg = (await navigator.serviceWorker.getRegistration(BASE)) || (await registerServiceWorker());
  await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  await saveSubscription(subscription, stores);
  return subscription;
}

/** 받을 지점만 바꾼다. 이미 구독 중일 때 쓴다. */
export async function updateStores(stores) {
  const subscription = await getSubscription();
  if (!subscription) throw new Error('구독 정보가 없습니다. 알림을 다시 켜주세요.');
  await saveSubscription(subscription, stores);
}

export async function unsubscribeFromPush() {
  const subscription = await getSubscription();
  if (!subscription) return;
  if (isFirebaseConfigured) {
    const id = await endpointKey(subscription.endpoint);
    await deleteDoc(doc(db, COLLECTION, id)).catch(() => {
      // 이미 지워졌으면 그만이다 — 구독 해제는 아래에서 계속 진행한다
    });
  } else {
    localStorage.removeItem('pushSubscription');
  }
  await subscription.unsubscribe();
}
