import { useCallback, useEffect, useState } from 'react';
import {
  ALL_STORES,
  getSubscription,
  isIOS,
  isStandalone,
  pushConfigured,
  pushSupported,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
  updateStores,
} from '../lib/webPush';

// 어느 지점을 받기로 했는지는 구독 객체에 안 담긴다. 화면에 보여주려고 따로 적어둔다.
const STORES_KEY = 'esc_push_stores';

function loadStores() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORES_KEY) || 'null');
    return Array.isArray(raw) && raw.length > 0 ? raw : [ALL_STORES];
  } catch {
    return [ALL_STORES];
  }
}

function persistStores(stores) {
  try {
    localStorage.setItem(STORES_KEY, JSON.stringify(stores));
  } catch {
    // 저장이 막혀도 구독 자체는 Firestore 에 남아 알림은 온다
  }
  return stores;
}

/**
 * 앱을 껐어도 오는 알림(웹 푸시)의 구독 상태.
 *
 * 브라우저가 구독을 스스로 바꾸는 경우가 있어(만료·재발급), 앱을 열 때마다
 * 지금 구독을 다시 저장한다. 문서 ID 를 구독 주소로 잡아둬서 몇 번을 해도 한 건만 남는다.
 */
export function usePushSubscription() {
  const [subscribed, setSubscribed] = useState(false);
  const [stores, setStores] = useState(loadStores);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pushSupported) return undefined;
    let cancelled = false;

    (async () => {
      try {
        await registerServiceWorker();
        const subscription = await getSubscription();
        if (cancelled) return;
        setSubscribed(Boolean(subscription));
        if (subscription && pushConfigured) {
          // 구독 주소가 바뀌었을 수 있다 — 열 때마다 최신으로 맞춰둔다
          await updateStores(loadStores());
        }
      } catch {
        // 서비스워커 등록 실패 — 화면 안 알림은 그대로 동작하므로 조용히 넘어간다
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async (nextStores) => {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPush(nextStores);
      setStores(persistStores(nextStores));
      setSubscribed(true);
      return true;
    } catch (e) {
      setError(e?.message || '알림을 켜지 못했습니다.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
      return true;
    } catch (e) {
      setError(e?.message || '알림을 끄지 못했습니다.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    supported: pushSupported,
    configured: pushConfigured,
    // 아이폰은 홈 화면에 추가해야만 푸시가 된다
    needsHomeScreen: isIOS && !isStandalone(),
    subscribed,
    stores,
    busy,
    error,
    enable,
    disable,
  };
}
