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
