import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { STORES } from '../data/stores';
import { markSelfHandoff } from '../lib/handoffAlert';

// localStorage 기반 폴백 (Firebase 미설정 시)
function getLocalData(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function setLocalData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * 삭제 전에 원본을 휴지통에 넣는다.
 *
 * 2026-07-30: 보고 11건이 사라졌고, 무엇이 지웠는지 끝내 특정하지 못했다.
 * Firestore 삭제는 되돌릴 수 없고 무료 요금제에는 복구 기능이 없다.
 * 확인창을 강화하는 것만으로는 개별 삭제로 잃는 걸 못 막는다 —
 * 지우기 전에 사본을 남기는 쪽이 유일하게 확실하다.
 *
 * undefined 는 Firestore 가 거부하므로 JSON 왕복으로 털어낸다.
 */
/**
 * localStorage 폴백에는 onSnapshot 같은 알림이 없다.
 * archive() 는 useTrash 바깥에서 쓰기 때문에, 알려주지 않으면 휴지통이 갱신되지 않는다.
 */
const TRASH_EVENT = 'esc:trash-changed';
export const HANDOFF_EVENT = 'esc:handoffs-changed';

function notify(name) {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
}

const notifyTrash = () => notify(TRASH_EVENT);
const notifyHandoffs = () => notify(HANDOFF_EVENT);

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normSeat(text) {
  const s = String(text || '').trim().replace(/번$/, '').toLowerCase();
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s;
}

/**
 * 문자의 ■고정석 번호를 "지정석 목록"(tasklists, type=seats)에 자동으로 반영한다.
 * 이미 있는 번호는 건드리지 않는다 — 시작일/종료일을 손으로 넣어둔 걸 덮어쓰면 안 된다.
 */
async function syncFixedSeatsToTaskList(storeId, fixedSeats) {
  if (!storeId || !fixedSeats || fixedSeats.length === 0) return;

  const newEntry = (text) => ({
    storeId,
    type: 'seats',
    text,
    startDate: todayStr(),
    date: '',
    memo: '',
    checked: false,
    order: Date.now(),
  });

  if (isFirebaseConfigured) {
    const snapshot = await getDocs(
      query(collection(db, 'tasklists'), where('storeId', '==', storeId), where('type', '==', 'seats'))
    );
    const existing = new Set(snapshot.docs.map((d) => normSeat(d.data().text)));
    const toAdd = fixedSeats.filter((s) => !existing.has(normSeat(s)));
    for (const text of toAdd) {
      await addDoc(collection(db, 'tasklists'), newEntry(text));
    }
    return;
  }

  const key = `tasklist_${storeId}_seats`;
  const list = getLocalData(key);
  const existing = new Set(list.map((t) => normSeat(t.text)));
  const toAdd = fixedSeats.filter((s) => !existing.has(normSeat(s)));
  if (toAdd.length === 0) return;
  for (const text of toAdd) {
    list.push({ id: generateId(), ...newEntry(text) });
  }
  setLocalData(key, list);
}

async function archive(kind, payload) {
  if (!payload) return;
  const entry = {
    kind,
    deletedAt: Date.now(),
    payload: JSON.parse(JSON.stringify(payload)),
  };
  if (isFirebaseConfigured) {
    await addDoc(collection(db, 'trash'), entry);
    return;
  }
  const list = getLocalData('trash');
  list.push({ id: generateId(), ...entry });
  setLocalData('trash', list);
  notifyTrash();
}

export function useEmployees(storeId) {
  const localKey = `employees_${storeId}`;
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    setEmployees(getLocalData(localKey));
    setLoading(false);
  }, [localKey]);

  useEffect(() => {
    if (!storeId) return;

    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }

    const q = query(
      collection(db, 'employees'),
      where('storeId', '==', storeId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setEmployees(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      setLoading(false);
    });
    return unsub;
  }, [storeId, refreshLocal]);

  const addEmployee = async (data) => {
    if (isFirebaseConfigured) {
      return addDoc(collection(db, 'employees'), { ...data, storeId });
    }
    const list = getLocalData(localKey);
    list.push({ id: generateId(), ...data, storeId });
    setLocalData(localKey, list);
    refreshLocal();
  };

  const updateEmployee = async (id, data) => {
    if (isFirebaseConfigured) {
      return updateDoc(doc(db, 'employees', id), data);
    }
    const list = getLocalData(localKey).map((e) =>
      e.id === id ? { ...e, ...data } : e
    );
    setLocalData(localKey, list);
    refreshLocal();
  };

  const removeEmployee = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'employees', id));
    }
    const list = getLocalData(localKey).filter((e) => e.id !== id);
    setLocalData(localKey, list);
    refreshLocal();
  };

  return { employees, loading, addEmployee, updateEmployee, removeEmployee };
}

export function useSchedules(storeId, year, month) {
  const localKey = `schedules_${storeId}_${year}_${month}`;
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    setSchedules(getLocalData(localKey));
    setLoading(false);
  }, [localKey]);

  useEffect(() => {
    if (!storeId) return;

    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }

    const q = query(
      collection(db, 'schedules'),
      where('storeId', '==', storeId),
      where('year', '==', year),
      where('month', '==', month)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setSchedules(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      setLoading(false);
    });
    return unsub;
  }, [storeId, year, month, refreshLocal]);

  const addSchedule = async (data) => {
    if (isFirebaseConfigured) {
      return addDoc(collection(db, 'schedules'), { ...data, storeId, year, month });
    }
    const list = getLocalData(localKey);
    list.push({ id: generateId(), ...data, storeId, year, month });
    setLocalData(localKey, list);
    refreshLocal();
  };

  const updateSchedule = async (id, data) => {
    if (isFirebaseConfigured) {
      return updateDoc(doc(db, 'schedules', id), data);
    }
    const list = getLocalData(localKey).map((s) =>
      s.id === id ? { ...s, ...data } : s
    );
    setLocalData(localKey, list);
    refreshLocal();
  };

  const removeSchedule = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'schedules', id));
    }
    const list = getLocalData(localKey).filter((s) => s.id !== id);
    setLocalData(localKey, list);
    refreshLocal();
  };

  return { schedules, loading, addSchedule, updateSchedule, removeSchedule };
}

export function useHandoffs(storeId) {
  const localKey = `handoffs_${storeId}`;
  const [handoffs, setHandoffs] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    const data = getLocalData(localKey);
    data.sort((a, b) => b.createdAt - a.createdAt);
    setHandoffs(data);
    setLoading(false);
  }, [localKey]);

  useEffect(() => {
    if (!storeId) return;

    if (!isFirebaseConfigured) {
      refreshLocal();
      window.addEventListener(HANDOFF_EVENT, refreshLocal);
      return () => window.removeEventListener(HANDOFF_EVENT, refreshLocal);
    }

    const q = query(
      collection(db, 'handoffs'),
      where('storeId', '==', storeId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.createdAt - a.createdAt);
      setHandoffs(data);
      setLoading(false);
    });
    return unsub;
  }, [storeId, refreshLocal]);

  const addHandoff = async (data, targetStoreId) => {
    const sid = targetStoreId || storeId;
    const entry = { ...data, storeId: sid, createdAt: Date.now() };
    if (isFirebaseConfigured) {
      const ref = await addDoc(collection(db, 'handoffs'), entry);
      markSelfHandoff(ref.id); // 내가 쓴 글로 나한테 알림이 오면 안 된다
      return ref;
    }
    const key = targetStoreId ? `handoffs_${targetStoreId}` : localKey;
    const list = getLocalData(key);
    const id = generateId();
    markSelfHandoff(id);
    list.push({ id, ...entry });
    setLocalData(key, list);
    notifyHandoffs();
    if (!targetStoreId || targetStoreId === storeId) refreshLocal();
  };

  const updateHandoff = async (id, data) => {
    if (isFirebaseConfigured) {
      return updateDoc(doc(db, 'handoffs', id), data);
    }
    const list = getLocalData(localKey).map((h) =>
      h.id === id ? { ...h, ...data } : h
    );
    setLocalData(localKey, list);
    refreshLocal();
  };

  const removeHandoff = async (id) => {
    await archive('handoff', handoffs.find((h) => h.id === id));
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'handoffs', id));
    }
    const list = getLocalData(localKey).filter((h) => h.id !== id);
    setLocalData(localKey, list);
    refreshLocal();
  };

  return { handoffs, loading, addHandoff, updateHandoff, removeHandoff };
}

/**
 * 전 매장 보고를 한 번에 구독한다. 대시보드('오늘의 순회')용.
 * 기존 useHandoffs 는 매장 하나만 보므로 17개를 나란히 세울 수 없었다.
 */
export function useAllHandoffs() {
  const [byStore, setByStore] = useState({});
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    const map = {};
    for (const store of STORES) {
      const list = getLocalData(`handoffs_${store.id}`);
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      map[store.id] = list;
    }
    setByStore(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      refreshLocal();
      window.addEventListener(HANDOFF_EVENT, refreshLocal);
      return () => window.removeEventListener(HANDOFF_EVENT, refreshLocal);
    }
    const unsub = onSnapshot(collection(db, 'handoffs'), (snapshot) => {
      const map = {};
      for (const store of STORES) map[store.id] = [];
      snapshot.docs.forEach((d) => {
        const item = { id: d.id, ...d.data() };
        if (!map[item.storeId]) map[item.storeId] = [];
        map[item.storeId].push(item);
      });
      for (const key of Object.keys(map)) {
        map[key].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      }
      setByStore(map);
      setLoading(false);
    });
    return unsub;
  }, [refreshLocal]);

  /**
   * 같은 매장·같은 날짜 보고가 이미 있으면 덮어쓴다(v3 결정사항).
   * @returns {'created'|'updated'}
   */
  const upsertHandoff = async (storeId, data) => {
    const dateKey = data.parsed?.dateKey ?? null;
    const existing = dateKey
      ? (byStore[storeId] || []).find((h) => h.parsed?.dateKey === dateKey)
      : null;

    let mode;
    if (isFirebaseConfigured) {
      if (existing) {
        await updateDoc(doc(db, 'handoffs', existing.id), {
          ...data,
          storeId,
          updatedAt: Date.now(),
        });
        mode = 'updated';
      } else {
        const ref = await addDoc(collection(db, 'handoffs'), {
          ...data,
          storeId,
          createdAt: Date.now(),
        });
        markSelfHandoff(ref.id);
        mode = 'created';
      }
    } else {
      const key = `handoffs_${storeId}`;
      const list = getLocalData(key);
      if (existing) {
        const next = list.map((h) =>
          h.id === existing.id ? { ...h, ...data, storeId, updatedAt: Date.now() } : h
        );
        setLocalData(key, next);
        mode = 'updated';
      } else {
        const id = generateId();
        markSelfHandoff(id);
        list.push({ id, ...data, storeId, createdAt: Date.now() });
        setLocalData(key, list);
        mode = 'created';
      }
      notifyHandoffs();
      refreshLocal();
    }

    await syncFixedSeatsToTaskList(storeId, data.parsed?.fixedSeats);
    return mode;
  };

  /** 같은 매장·같은 날짜 보고가 이미 있는지 확인 (등록 전 경고용) */
  const findSameDay = (storeId, dateKey) =>
    dateKey
      ? (byStore[storeId] || []).find((h) => h.parsed?.dateKey === dateKey) || null
      : null;

  /**
   * 보고 한 건을 지운다.
   * 붙여넣기는 대시보드에서 하는데 삭제 버튼은 매장별 인수인계 페이지에만 있었다.
   * 잘못 붙여넣었을 때 네 단계를 이동해야 지울 수 있어서, 입력한 자리에서 바로 지우게 한다.
   */
  const removeHandoff = async (storeId, id) => {
    await archive('handoff', (byStore[storeId] || []).find((h) => h.id === id));
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'handoffs', id));
    }
    const key = `handoffs_${storeId}`;
    setLocalData(
      key,
      getLocalData(key).filter((h) => h.id !== id)
    );
    refreshLocal();
  };

  return { byStore, loading, upsertHandoff, findSameDay, removeHandoff };
}

/**
 * 임원이 직접 닫은 고장·해야할일.
 *
 * v3 규칙은 "매장이 다음 문자에서 그 줄을 빼면 해결"이다. 그런데 임원이 현장에서
 * 고쳐놓고도 매장 문자를 기다려야 목록이 줄어드는 게 실제 불편이었다.
 * 이 컬렉션은 그 기다림을 건너뛰기 위한 것이고, 판정 규칙 자체를 바꾸지는 않는다.
 *
 * 문서 형태: { storeId, kind: 'fault'|'todo', text, resolvedAt, resolvedBy }
 */
/**
 * 휴지통. 지운 보고를 되살리는 유일한 경로다.
 * 오래된 건 주인님이 직접 비우게 둔다 — 자동으로 지우면 휴지통이 있는 의미가 없다.
 */
export function useTrash() {
  const [items, setItems] = useState(() =>
    isFirebaseConfigured
      ? []
      : getLocalData('trash').slice().sort((a, b) => b.deletedAt - a.deletedAt)
  );

  const refreshLocal = useCallback(() => {
    setItems(getLocalData('trash').slice().sort((a, b) => b.deletedAt - a.deletedAt));
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      window.addEventListener(TRASH_EVENT, refreshLocal);
      return () => window.removeEventListener(TRASH_EVENT, refreshLocal);
    }
    const unsub = onSnapshot(collection(db, 'trash'), (snapshot) => {
      setItems(
        snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
      );
    });
    return unsub;
  }, [refreshLocal]);

  /** 되살린다. 원래 문서 id 는 버리고 새로 만든다 — 같은 id 를 되쓰려다 충돌내는 게 더 위험하다. */
  const restore = async (entry) => {
    if (entry?.kind !== 'handoff' || !entry.payload) return;
    const { id: _drop, ...body } = entry.payload;
    if (isFirebaseConfigured) {
      await addDoc(collection(db, 'handoffs'), body);
      await deleteDoc(doc(db, 'trash', entry.id));
      return;
    }
    const key = `handoffs_${body.storeId}`;
    const list = getLocalData(key);
    list.push({ id: generateId(), ...body });
    setLocalData(key, list);
    setLocalData('trash', getLocalData('trash').filter((t) => t.id !== entry.id));
    notifyTrash();
    notifyHandoffs();
  };

  const purge = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'trash', id));
    }
    setLocalData('trash', getLocalData('trash').filter((t) => t.id !== id));
    notifyTrash();
  };

  return { items, restore, purge };
}

function resolutionsToMap(list) {
  const map = {};
  for (const store of STORES) map[store.id] = [];
  for (const r of list) {
    if (!map[r.storeId]) map[r.storeId] = [];
    map[r.storeId].push(r);
  }
  return map;
}

export function useResolutions() {
  const localKey = 'resolutions';
  // Firebase 를 안 쓰는 환경에서는 첫 렌더에 바로 채운다.
  // 이걸 effect 안에서 하면 불필요한 재렌더가 한 번 더 돈다.
  const [byStore, setByStore] = useState(() =>
    isFirebaseConfigured ? {} : resolutionsToMap(getLocalData('resolutions'))
  );

  const refreshLocal = useCallback(() => {
    setByStore(resolutionsToMap(getLocalData(localKey)));
  }, [localKey]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = onSnapshot(collection(db, 'resolutions'), (snapshot) => {
      setByStore(resolutionsToMap(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
    });
    return unsub;
  }, []);

  const resolve = async (storeId, kind, text, resolvedBy) => {
    // 누가 닫았는지를 남긴다. 이름을 안 넘긴 옛 호출은 그대로 '임원'으로 둔다.
    const entry = {
      storeId,
      kind,
      text,
      resolvedAt: Date.now(),
      resolvedBy: String(resolvedBy || '').trim() || '임원',
    };
    if (isFirebaseConfigured) {
      return addDoc(collection(db, 'resolutions'), entry);
    }
    const list = getLocalData(localKey);
    list.push({ id: generateId(), ...entry });
    setLocalData(localKey, list);
    refreshLocal();
  };

  /** 잘못 눌렀을 때 되돌린다 */
  const unresolve = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'resolutions', id));
    }
    setLocalData(
      localKey,
      getLocalData(localKey).filter((r) => r.id !== id)
    );
    refreshLocal();
  };

  return { byStore, resolve, unresolve };
}

/**
 * 품목 마스터. 문자에 나온 이름을 대표 품목으로 묶는다.
 * 문서 형태: { canonical: '롤휴지', aliases: ['점보롤', '점보롤휴지'], threshold: 2 }
 */
export function useItems() {
  const localKey = 'items_master';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    setItems(getLocalData(localKey));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }
    const unsub = onSnapshot(collection(db, 'items'), (snapshot) => {
      setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [refreshLocal]);

  const writeLocal = (next) => {
    setLocalData(localKey, next);
    refreshLocal();
  };

  const findByCanonical = (name) =>
    items.find((i) => i.canonical === name) || null;

  /**
   * alias 를 target 대표 품목 아래로 넣는다.
   * - alias 가 자기 문서를 갖고 있으면 별칭까지 흡수한 뒤 그 문서를 삭제
   * - alias 가 다른 대표 품목의 별칭이었다면 거기서 떼어낸다
   *   (한 이름이 두 대표에 동시에 속하면 합산이 어느 쪽으로 갈지 모호해진다)
   */
  const mergeInto = async (targetCanonical, aliasName) => {
    if (!targetCanonical || !aliasName || targetCanonical === aliasName) return;

    const source = findByCanonical(aliasName);
    const absorbed = [aliasName, ...(source?.aliases || [])];
    const target = findByCanonical(targetCanonical);
    const nextAliases = [...new Set([...(target?.aliases || []), ...absorbed])].filter(
      (a) => a !== targetCanonical
    );

    // 옮겨오는 이름들을 붙들고 있던 다른 대표 품목에서 제거
    const moving = new Set(absorbed);
    const detachFrom = items.filter(
      (i) =>
        i.canonical !== targetCanonical &&
        i.canonical !== aliasName &&
        (i.aliases || []).some((a) => moving.has(a))
    );

    if (isFirebaseConfigured) {
      for (const other of detachFrom) {
        await updateDoc(doc(db, 'items', other.id), {
          aliases: (other.aliases || []).filter((a) => !moving.has(a)),
        });
      }
      if (target) {
        await updateDoc(doc(db, 'items', target.id), { aliases: nextAliases });
      } else {
        await addDoc(collection(db, 'items'), {
          canonical: targetCanonical,
          aliases: nextAliases,
          threshold: null,
        });
      }
      if (source) await deleteDoc(doc(db, 'items', source.id));
      return;
    }

    let list = getLocalData(localKey)
      .filter((i) => i.canonical !== aliasName)
      .map((i) =>
        i.canonical === targetCanonical
          ? i
          : { ...i, aliases: (i.aliases || []).filter((a) => !moving.has(a)) }
      );
    if (list.some((i) => i.canonical === targetCanonical)) {
      list = list.map((i) =>
        i.canonical === targetCanonical ? { ...i, aliases: nextAliases } : i
      );
    } else {
      list.push({
        id: generateId(),
        canonical: targetCanonical,
        aliases: nextAliases,
        threshold: null,
      });
    }
    writeLocal(list);
  };

  /** 대표 품목에서 별칭 하나를 떼어낸다 */
  const unmerge = async (targetCanonical, aliasName) => {
    const target = findByCanonical(targetCanonical);
    if (!target) return;
    const nextAliases = (target.aliases || []).filter((a) => a !== aliasName);
    if (isFirebaseConfigured) {
      await updateDoc(doc(db, 'items', target.id), { aliases: nextAliases });
      return;
    }
    writeLocal(
      getLocalData(localKey).map((i) =>
        i.canonical === targetCanonical ? { ...i, aliases: nextAliases } : i
      )
    );
  };

  /** 품목별 발주 임계치. null 이면 기본값(2)을 쓴다 */
  const setThreshold = async (canonical, threshold) => {
    const target = findByCanonical(canonical);
    const value = threshold === '' || threshold == null ? null : Number(threshold);

    if (isFirebaseConfigured) {
      if (target) {
        await updateDoc(doc(db, 'items', target.id), { threshold: value });
      } else {
        await addDoc(collection(db, 'items'), { canonical, aliases: [], threshold: value });
      }
      return;
    }
    const list = getLocalData(localKey);
    if (list.some((i) => i.canonical === canonical)) {
      writeLocal(list.map((i) => (i.canonical === canonical ? { ...i, threshold: value } : i)));
    } else {
      list.push({ id: generateId(), canonical, aliases: [], threshold: value });
      writeLocal(list);
    }
  };

  return { items, loading, mergeInto, unmerge, setThreshold };
}

export function useChecklist(storeId, dateKey) {
  const localKey = `checklist_${storeId}_${dateKey}`;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    const list = getLocalData(localKey);
    setRecord(list[0] || null);
    setLoading(false);
  }, [localKey]);

  useEffect(() => {
    if (!storeId || !dateKey) return;

    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }

    const q = query(
      collection(db, 'checklists'),
      where('storeId', '==', storeId),
      where('dateKey', '==', dateKey)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRecord(docs[0] || null);
      setLoading(false);
    });
    return unsub;
  }, [storeId, dateKey, refreshLocal]);

  const saveChecklist = async (data) => {
    if (isFirebaseConfigured) {
      if (record?.id) {
        return updateDoc(doc(db, 'checklists', record.id), data);
      }
      return addDoc(collection(db, 'checklists'), {
        ...data,
        storeId,
        dateKey,
        createdAt: Date.now(),
      });
    }
    const list = getLocalData(localKey);
    if (list[0]) {
      list[0] = { ...list[0], ...data };
    } else {
      list.push({ id: generateId(), ...data, storeId, dateKey, createdAt: Date.now() });
    }
    setLocalData(localKey, list);
    refreshLocal();
  };

  return { record, loading, saveChecklist };
}

export function useChecklistHistory(storeId) {
  const localKeyPrefix = `checklist_${storeId}_`;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    const all = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(localKeyPrefix)) {
        const list = getLocalData(k);
        list.forEach((r) => all.push(r));
      }
    }
    all.sort((a, b) => (b.dateKey || '').localeCompare(a.dateKey || ''));
    setHistory(all);
    setLoading(false);
  }, [localKeyPrefix]);

  useEffect(() => {
    if (!storeId) return;

    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }

    const q = query(
      collection(db, 'checklists'),
      where('storeId', '==', storeId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.dateKey || '').localeCompare(a.dateKey || ''));
      setHistory(data);
      setLoading(false);
    });
    return unsub;
  }, [storeId, refreshLocal]);

  const removeRecord = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'checklists', id));
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(localKeyPrefix)) {
        const list = getLocalData(k).filter((r) => r.id !== id);
        setLocalData(k, list);
      }
    }
    refreshLocal();
  };

  return { history, loading, removeRecord };
}

export function useInventory(storeId) {
  const localKey = `inventory_${storeId}`;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    const data = getLocalData(localKey);
    data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setItems(data);
    setLoading(false);
  }, [localKey]);

  useEffect(() => {
    if (!storeId) return;

    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }

    const q = query(
      collection(db, 'inventory'),
      where('storeId', '==', storeId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setItems(data);
      setLoading(false);
    });
    return unsub;
  }, [storeId, refreshLocal]);

  const addItem = async (data) => {
    const entry = { ...data, storeId, stock: 0, opened: 0, order: Date.now() };
    if (isFirebaseConfigured) {
      return addDoc(collection(db, 'inventory'), entry);
    }
    const list = getLocalData(localKey);
    list.push({ id: generateId(), ...entry });
    setLocalData(localKey, list);
    refreshLocal();
  };

  const updateItem = async (id, data) => {
    if (isFirebaseConfigured) {
      return updateDoc(doc(db, 'inventory', id), data);
    }
    const list = getLocalData(localKey).map((item) =>
      item.id === id ? { ...item, ...data } : item
    );
    setLocalData(localKey, list);
    refreshLocal();
  };

  const removeItem = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'inventory', id));
    }
    const list = getLocalData(localKey).filter((item) => item.id !== id);
    setLocalData(localKey, list);
    refreshLocal();
  };

  return { items, loading, addItem, updateItem, removeItem };
}

export function useTaskList(storeId, type) {
  const localKey = `tasklist_${storeId}_${type}`;
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    const data = getLocalData(localKey);
    data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setTasks(data);
    setLoading(false);
  }, [localKey]);

  useEffect(() => {
    if (!storeId) return;

    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }

    const q = query(
      collection(db, 'tasklists'),
      where('storeId', '==', storeId),
      where('type', '==', type)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setTasks(data);
      setLoading(false);
    });
    return unsub;
  }, [storeId, type, refreshLocal]);

  const addTask = async (data) => {
    const entry = { ...data, storeId, type, checked: false, order: Date.now() };
    if (isFirebaseConfigured) {
      return addDoc(collection(db, 'tasklists'), entry);
    }
    const list = getLocalData(localKey);
    list.push({ id: generateId(), ...entry });
    setLocalData(localKey, list);
    refreshLocal();
  };

  const updateTask = async (id, data) => {
    if (isFirebaseConfigured) {
      return updateDoc(doc(db, 'tasklists', id), data);
    }
    const list = getLocalData(localKey).map((t) =>
      t.id === id ? { ...t, ...data } : t
    );
    setLocalData(localKey, list);
    refreshLocal();
  };

  const removeTask = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'tasklists', id));
    }
    const list = getLocalData(localKey).filter((t) => t.id !== id);
    setLocalData(localKey, list);
    refreshLocal();
  };

  return { tasks, loading, addTask, updateTask, removeTask };
}

export function useOrders(storeId) {
  const localKey = `orders_${storeId}`;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    const data = getLocalData(localKey);
    data.sort((a, b) => b.createdAt - a.createdAt);
    setOrders(data);
    setLoading(false);
  }, [localKey]);

  useEffect(() => {
    if (!storeId) return;

    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }

    const q = query(
      collection(db, 'orders'),
      where('storeId', '==', storeId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.createdAt - a.createdAt);
      setOrders(data);
      setLoading(false);
    });
    return unsub;
  }, [storeId, refreshLocal]);

  const addOrder = async (data, targetStoreId) => {
    const sid = targetStoreId || storeId;
    const entry = { ...data, storeId: sid, createdAt: Date.now() };
    if (isFirebaseConfigured) {
      return addDoc(collection(db, 'orders'), entry);
    }
    const key = targetStoreId ? `orders_${targetStoreId}` : localKey;
    const list = getLocalData(key);
    list.push({ id: generateId(), ...entry });
    setLocalData(key, list);
    if (!targetStoreId || targetStoreId === storeId) refreshLocal();
  };

  const updateOrder = async (id, data) => {
    if (isFirebaseConfigured) {
      return updateDoc(doc(db, 'orders', id), data);
    }
    const list = getLocalData(localKey).map((o) =>
      o.id === id ? { ...o, ...data } : o
    );
    setLocalData(localKey, list);
    refreshLocal();
  };

  const removeOrder = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'orders', id));
    }
    const list = getLocalData(localKey).filter((o) => o.id !== id);
    setLocalData(localKey, list);
    refreshLocal();
  };

  return { orders, loading, addOrder, updateOrder, removeOrder };
}

export function useNotices(storeId) {
  const localKey = 'notices_global';
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshLocal = useCallback(() => {
    const all = getLocalData(localKey);
    // 이 매장이 대상에 포함된 공지만 필터
    const filtered = storeId
      ? all.filter((n) => n.targetStores?.includes(storeId))
      : all;
    filtered.sort((a, b) => b.createdAt - a.createdAt);
    setNotices(filtered);
    setLoading(false);
  }, [localKey, storeId]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      refreshLocal();
      return;
    }

    const unsub = onSnapshot(collection(db, 'notices'), (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const filtered = storeId
        ? all.filter((n) => n.targetStores?.includes(storeId))
        : all;
      filtered.sort((a, b) => b.createdAt - a.createdAt);
      setNotices(filtered);
      setLoading(false);
    });
    return unsub;
  }, [storeId, refreshLocal]);

  const addNotice = async (data) => {
    const entry = { ...data, createdAt: Date.now() };
    if (isFirebaseConfigured) {
      return addDoc(collection(db, 'notices'), entry);
    }
    const list = getLocalData(localKey);
    list.push({ id: generateId(), ...entry });
    setLocalData(localKey, list);
    refreshLocal();
  };

  const updateNotice = async (id, data) => {
    if (isFirebaseConfigured) {
      return updateDoc(doc(db, 'notices', id), data);
    }
    const list = getLocalData(localKey).map((n) =>
      n.id === id ? { ...n, ...data } : n
    );
    setLocalData(localKey, list);
    refreshLocal();
  };

  const removeNotice = async (id) => {
    if (isFirebaseConfigured) {
      return deleteDoc(doc(db, 'notices', id));
    }
    const list = getLocalData(localKey).filter((n) => n.id !== id);
    setLocalData(localKey, list);
    refreshLocal();
  };

  /**
   * 공지를 읽었다고 표시한다.
   *
   * checkedStores 는 지점 단위라 "상동점은 확인함"까지만 남는다.
   * 교대 근무자가 여럿이면 누가 봤는지 모르므로 checks 에 이름과 시각을 같이 남긴다.
   * checkedStores 는 예전 화면들이 그대로 쓰고 있어 함께 갱신한다.
   */
  const checkNotice = async (notice, targetStoreId, by) => {
    const stores = notice.checkedStores || [];
    const checks = notice.checks || [];
    if (stores.includes(targetStoreId)) return;
    return updateNotice(notice.id, {
      checkedStores: [...stores, targetStoreId],
      checks: [...checks, { storeId: targetStoreId, by: String(by || '').trim(), at: Date.now() }],
    });
  };

  return { notices, loading, addNotice, updateNotice, removeNotice, checkNotice };
}
