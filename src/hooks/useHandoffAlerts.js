import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { STORES, getStoreById } from '../data/stores';
import { HANDOFF_EVENT } from './useFirestore';
import {
  askNotificationPermission,
  currentPermission,
  isSelfHandoff,
  isSoundOn,
  playAlertSound,
  saveSoundOn,
  showBrowserNotification,
} from '../lib/handoffAlert';

const UNREAD_KEY = 'handoff_unread';
const MAX_UNREAD = 100;
const MAX_TOASTS = 4;
const TOAST_MS = 12000;

function loadUnread() {
  try {
    const raw = JSON.parse(localStorage.getItem(UNREAD_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveUnread(list) {
  try {
    localStorage.setItem(UNREAD_KEY, JSON.stringify(list));
  } catch {
    // 저장이 막혀도 화면에 떠 있는 동안은 그대로 보인다
  }
  return list;
}

function readLocalHandoffs() {
  const all = [];
  for (const store of STORES) {
    try {
      const list = JSON.parse(localStorage.getItem(`handoffs_${store.id}`) || '[]');
      for (const h of list) all.push({ ...h, storeId: h.storeId || store.id });
    } catch {
      // 한 매장이 깨져도 나머지는 읽는다
    }
  }
  return all;
}

/** 알림에 한 줄로 띄울 요약. 첫 섹션이 없으면 원본 앞머리를 쓴다. */
function summarize(handoff) {
  const first = (handoff.sections || []).find((s) => s.content?.trim());
  const text = first ? `${first.label} ${first.content}` : handoff.rawText || '';
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '내용 없음';
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine;
}

function isUrgent(handoff) {
  return /#긴급|#급/.test(handoff.rawText || '');
}

function toAlert(handoff) {
  return {
    id: handoff.id,
    storeId: handoff.storeId,
    storeName: getStoreById(handoff.storeId)?.name || handoff.storeId,
    author: handoff.author || '미입력',
    summary: summarize(handoff),
    urgent: isUrgent(handoff),
    at: handoff.createdAt ?? Date.now(),
  };
}

/**
 * 어느 지점이든 새 인수인계가 등록되면 알린다.
 *
 * 앱을 켜 둔 사람 모두가 대상이다 — 보고 있는 화면이 어느 지점이든 상관없다.
 * 다만 마침 그 지점 인수인계 화면을 보고 있으면 목록에 바로 나타나므로
 * 알리지 않는다(viewingStoreId).
 *
 * 화면을 보고 있으면 토스트로 충분하고, 다른 탭에 가 있거나 화면이 꺼져 있을 때만
 * 브라우저(OS) 알림을 띄운다. 같은 걸 두 번 알리지 않기 위해서다.
 */
export function useHandoffAlerts(viewingStoreId) {
  const [toasts, setToasts] = useState([]);
  const [unread, setUnread] = useState(loadUnread);
  const [permission, setPermission] = useState(currentPermission);
  const [soundOn, setSoundOn] = useState(isSoundOn);

  const soundRef = useRef(soundOn);
  const viewingRef = useRef(viewingStoreId);
  const timersRef = useRef(new Map());

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    viewingRef.current = viewingStoreId;
  }, [viewingStoreId]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushAlerts = useCallback(
    (items) => {
      if (items.length === 0) return;

      setUnread((prev) => saveUnread([...items, ...prev].slice(0, MAX_UNREAD)));
      setToasts((prev) => [...items, ...prev].slice(0, MAX_TOASTS));
      for (const item of items) {
        timersRef.current.set(
          item.id,
          setTimeout(() => dismissToast(item.id), TOAST_MS)
        );
      }

      if (soundRef.current) playAlertSound();

      if (document.hidden) {
        for (const item of items.slice(0, 3)) {
          showBrowserNotification({
            title: `${item.urgent ? '🚨 ' : '📝 '}${item.storeName} 인수인계`,
            body: `${item.author} · ${item.summary}`,
            tag: item.id,
            onClick: () => {
              window.location.hash = `/store/${item.storeId}/board/handoff`;
            },
          });
        }
      }
    },
    [dismissToast]
  );

  useEffect(() => {
    const known = new Set();
    let primed = false;

    // 처음 받은 목록은 이미 있던 글이라 알리지 않는다. 기준선만 잡는다.
    const handleIncoming = (handoffs) => {
      const fresh = [];
      for (const h of handoffs) {
        if (!h.id || known.has(h.id)) continue;
        known.add(h.id);
        if (!primed) continue;
        if (isSelfHandoff(h.id)) continue;
        if (h.storeId && h.storeId === viewingRef.current) continue;
        fresh.push(toAlert(h));
      }
      primed = true;
      pushAlerts(fresh);
    };

    if (!isFirebaseConfigured) {
      const refresh = () => handleIncoming(readLocalHandoffs());
      refresh();
      window.addEventListener(HANDOFF_EVENT, refresh);
      return () => window.removeEventListener(HANDOFF_EVENT, refresh);
    }

    // hasPendingWrites 는 아직 서버에 닿지 않은 내 글이라는 뜻이다. 내가 쓴 건 거른다.
    const unsub = onSnapshot(collection(db, 'handoffs'), (snapshot) => {
      const added = snapshot
        .docChanges()
        .filter((c) => c.type === 'added' && !c.doc.metadata.hasPendingWrites)
        .map((c) => ({ id: c.doc.id, ...c.doc.data() }));
      handleIncoming(added);
    });
    return unsub;
  }, [pushAlerts]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  /** 그 지점 인수인계 화면을 열면 쌓여 있던 표시를 지운다. */
  const markStoreRead = useCallback((storeId) => {
    if (!storeId) return;
    setUnread((prev) => {
      const next = prev.filter((u) => u.storeId !== storeId);
      return next.length === prev.length ? prev : saveUnread(next);
    });
  }, []);

  const clearAllUnread = useCallback(() => {
    setUnread((prev) => (prev.length === 0 ? prev : saveUnread([])));
  }, []);

  const enableNotifications = useCallback(async () => {
    setPermission(await askNotificationPermission());
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      saveSoundOn(!prev);
      if (!prev) playAlertSound(); // 켜는 순간 어떤 소리인지 들려준다
      return !prev;
    });
  }, []);

  const unreadByStore = useMemo(() => {
    const map = {};
    for (const u of unread) map[u.storeId] = (map[u.storeId] || 0) + 1;
    return map;
  }, [unread]);

  return {
    toasts,
    dismissToast,
    unreadByStore,
    unreadTotal: unread.length,
    markStoreRead,
    clearAllUnread,
    permission,
    enableNotifications,
    soundOn,
    toggleSound,
  };
}
