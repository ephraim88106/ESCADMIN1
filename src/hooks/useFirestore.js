import { useState, useEffect } from 'react';
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
import { db } from '../firebase';

export function useEmployees(storeId) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    const q = query(
      collection(db, 'employees'),
      where('storeId', '==', storeId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setEmployees(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
      setLoading(false);
    });
    return unsub;
  }, [storeId]);

  const addEmployee = (data) =>
    addDoc(collection(db, 'employees'), { ...data, storeId });

  const updateEmployee = (id, data) =>
    updateDoc(doc(db, 'employees', id), data);

  const removeEmployee = (id) => deleteDoc(doc(db, 'employees', id));

  return { employees, loading, addEmployee, updateEmployee, removeEmployee };
}

export function useSchedules(storeId, year, month) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    const q = query(
      collection(db, 'schedules'),
      where('storeId', '==', storeId),
      where('year', '==', year),
      where('month', '==', month)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setSchedules(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
      setLoading(false);
    });
    return unsub;
  }, [storeId, year, month]);

  const addSchedule = (data) =>
    addDoc(collection(db, 'schedules'), { ...data, storeId, year, month });

  const updateSchedule = (id, data) =>
    updateDoc(doc(db, 'schedules', id), data);

  const removeSchedule = (id) => deleteDoc(doc(db, 'schedules', id));

  return { schedules, loading, addSchedule, updateSchedule, removeSchedule };
}
