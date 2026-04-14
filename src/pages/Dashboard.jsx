import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { STORES } from '../data/stores';

function getLocalData(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

export default function Dashboard() {
  const [storeSummary, setStoreSummary] = useState(
    STORES.map((s) => ({ ...s, noticeCount: 0, uncheckedNotices: 0, handoffPending: false }))
  );
  const [totals, setTotals] = useState({ notices: 0, unchecked: 0, pendingHandoffs: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // localStorage에서 집계
    const allNotices = getLocalData('notices_global');

    const summary = STORES.map((store) => {
      // 이 매장 대상 공지
      const storeNotices = allNotices.filter((n) =>
        n.targetStores?.includes(store.id)
      );
      const unchecked = storeNotices.filter(
        (n) => !(n.checkedStores || []).includes(store.id)
      ).length;

      // 인수인계 미확인
      const handoffs = getLocalData(`handoffs_${store.id}`);
      const pendingCount = handoffs.filter((h) => !h.checkedBy).length;

      return {
        ...store,
        noticeCount: storeNotices.length,
        uncheckedNotices: unchecked,
        handoffPending: pendingCount > 0,
        handoffPendingCount: pendingCount,
      };
    });

    const totalUnchecked = summary.reduce((a, b) => a + b.uncheckedNotices, 0);
    const totalPending = summary.reduce((a, b) => a + b.handoffPendingCount, 0);

    setStoreSummary(summary);
    setTotals({
      notices: allNotices.length,
      unchecked: totalUnchecked,
      pendingHandoffs: totalPending,
    });
    setLoading(false);
  }, []);

  return (
    <div className="dashboard">
      <h2>종합 대시보드</h2>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-label">전체 지점</div>
          <div className="summary-value">{STORES.length}개</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">미확인 공지</div>
          <div className={`summary-value${totals.unchecked > 0 ? ' text-danger' : ''}`}>
            {loading ? '...' : `${totals.unchecked}건`}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">인수인계 대기</div>
          <div className={`summary-value${totals.pendingHandoffs > 0 ? ' text-warn' : ''}`}>
            {loading ? '...' : `${totals.pendingHandoffs}건`}
          </div>
        </div>
      </div>

      <h3>지점별 현황</h3>
      <div className="store-grid">
        {storeSummary.map((store) => (
          <Link
            key={store.id}
            to={`/store/${store.id}/tasks`}
            className={`store-card${store.uncheckedNotices > 0 || store.handoffPending ? ' store-card-alert' : ''}`}
          >
            <div className="store-card-name">{store.name}</div>
            <div className="store-card-stats">
              {store.uncheckedNotices > 0 && (
                <span className="stat-badge stat-danger">공지 {store.uncheckedNotices}</span>
              )}
              {store.handoffPending && (
                <span className="stat-badge stat-warn">인수인계 {store.handoffPendingCount}</span>
              )}
              {store.uncheckedNotices === 0 && !store.handoffPending && (
                <span className="stat-ok">✓ 확인 완료</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
