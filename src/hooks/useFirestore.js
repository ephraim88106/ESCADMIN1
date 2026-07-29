import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { STORES } from '../data/stores';

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
      return;
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
      return addDoc(collection(db, 'handoffs'), entry);
    }
    const key = targetStoreId ? `handoffs_${targetStoreId}` : localKey;
    const list = getLocalData(key);
    list.push({ id: generateId(), ...entry });
    setLocalData(key, list);
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
      return;
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

    if (isFirebaseConfigured) {
      if (existing) {
        await updateDoc(doc(db, 'handoffs', existing.id), {
          ...data,
          storeId,
          updatedAt: Date.now(),
        });
        return 'updated';
      }
      await addDoc(collection(db, 'handoffs'), {
        ...data,
        storeId,
        createdAt: Date.now(),
      });
      return 'created';
    }

    const key = `handoffs_${storeId}`;
    const list = getLocalData(key);
    if (existing) {
      const next = list.map((h) =>
        h.id === existing.id ? { ...h, ...data, storeId, updatedAt: Date.now() } : h
      );
      setLocalData(key, next);
      refreshLocal();
      return 'updated';
    }
    list.push({ id: generateId(), ...data, storeId, createdAt: Date.now() });
    setLocalData(key, list);
    refreshLocal();
    return 'created';
  };

  /** 같은 매장·같은 날짜 보고가 이미 있는지 확인 (등록 전 경고용) */
  const findSameDay = (storeId, dateKey) =>
    dateKey
      ? (byStore[storeId] || []).find((h) => h.parsed?.dateKey === dateKey) || null
      : null;

  return { byStore, loading, upsertHandoff, findSameDay };
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

  return { notices, loading, addNotice, updateNotice, removeNotice };
}
