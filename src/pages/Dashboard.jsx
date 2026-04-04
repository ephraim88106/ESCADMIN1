import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { STORES } from '../data/stores';

export default function Dashboard() {
  const [storeSummary, setStoreSummary] = useState(
    STORES.map((s) => ({ ...s, employeeCount: 0, scheduledShifts: 0 }))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      if (!isFirebaseConfigured) {
        // localStorage에서 집계
        const summary = STORES.map((store) => {
          let empCount = 0;
          let schedCount = 0;
          try {
            empCount = JSON.parse(localStorage.getItem(`employees_${store.id}`) || '[]').length;
          } catch { /* empty */ }
          try {
            const now = new Date();
            const key = `schedules_${store.id}_${now.getFullYear()}_${now.getMonth() + 1}`;
            schedCount = JSON.parse(localStorage.getItem(key) || '[]').length;
          } catch { /* empty */ }
          return { ...store, employeeCount: empCount, scheduledShifts: schedCount };
        });
        setStoreSummary(summary);
        setLoading(false);
        return;
      }

      try {
        const empSnap = await getDocs(collection(db, 'employees'));
        const empByStore = {};
        empSnap.docs.forEach((doc) => {
          const data = doc.data();
          if (!empByStore[data.storeId]) empByStore[data.storeId] = [];
          empByStore[data.storeId].push(data);
        });

        const now = new Date();
        const schedSnap = await getDocs(
          query(
            collection(db, 'schedules'),
            where('year', '==', now.getFullYear()),
            where('month', '==', now.getMonth() + 1)
          )
        );
        const schedByStore = {};
        schedSnap.docs.forEach((doc) => {
          const data = doc.data();
          if (!schedByStore[data.storeId]) schedByStore[data.storeId] = 0;
          schedByStore[data.storeId]++;
        });

        setStoreSummary(
          STORES.map((store) => ({
            ...store,
            employeeCount: empByStore[store.id]?.length || 0,
            scheduledShifts: schedByStore[store.id] || 0,
          }))
        );
      } catch {
        setStoreSummary(STORES.map((s) => ({ ...s, employeeCount: 0, scheduledShifts: 0 })));
      }
      setLoading(false);
    }
    fetchSummary();
  }, []);

  const totalEmployees = storeSummary.reduce((a, b) => a + b.employeeCount, 0);
  const totalShifts = storeSummary.reduce((a, b) => a + b.scheduledShifts, 0);

  return (
    <div className="dashboard">
      <h2>종합 대시보드</h2>

      {!isFirebaseConfigured && (
        <div className="notice">
          Firebase 미연결 상태입니다. 현재 브라우저 로컬 저장소를 사용 중입니다.
        </div>
      )}

      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-label">전체 지점</div>
          <div className="summary-value">{STORES.length}개</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">전체 직원</div>
          <div className="summary-value">
            {loading ? '...' : `${totalEmployees}명`}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">이번 달 스케줄</div>
          <div className="summary-value">
            {loading ? '...' : `${totalShifts}건`}
          </div>
        </div>
      </div>

      <h3>지점별 현황</h3>
      <div className="store-grid">
        {storeSummary.map((store) => (
          <Link
            key={store.id}
            to={`/store/${store.id}/employees`}
            className="store-card"
          >
            <div className="store-card-name">{store.name}</div>
            <div className="store-card-stats">
              <span>직원 {store.employeeCount}명</span>
              <span>스케줄 {store.scheduledShifts}건</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
