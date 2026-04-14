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
