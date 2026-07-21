import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { STORES } from '../data/stores';

function getLocalData(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

// 온도체크 섹션에서 평균 온도 추출
function extractAvgTemp(handoffs) {
  const temps = [];
  // 최근 7일 이내 인수인계만 사용
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const h of handoffs) {
    if (h.createdAt < cutoff) continue;
    const tempSection = h.sections?.find((s) => s.label === '온도체크');
    if (!tempSection) continue;
    const lines = tempSection.content.split('\n');
    for (const line of lines) {
      // 소수점 있는 온도값 (예: 24.9, 22.7)
      const decimalMatches = line.match(/\b(\d{1,2}\.\d+)\b/g);
      if (decimalMatches) {
        for (const m of decimalMatches) {
          const n = parseFloat(m);
          if (n >= 15 && n <= 40) temps.push(n);
        }
      }
      // 콜론 뒤 정수 온도 (예: "44: 25", "28 : 25")
      const colonMatch = line.match(/:\s*(\d{2})\b/g);
      if (colonMatch) {
        for (const m of colonMatch) {
          const n = parseInt(m.replace(/.*:\s*/, ''));
          if (n >= 15 && n <= 35) temps.push(n);
        }
      }
    }
  }
  if (temps.length === 0) return null;
  return (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [storeSummary, setStoreSummary] = useState(
    STORES.map((s) => ({ ...s, noticeCount: 0, uncheckedNotices: 0, handoffPending: false }))
  );
  const [totals, setTotals] = useState({ notices: 0, unchecked: 0, pendingHandoffs: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState(null);

  useEffect(() => {
    const allNotices = getLocalData('notices_global');

    const summary = STORES.map((store) => {
      const storeNotices = allNotices.filter((n) =>
        n.targetStores?.includes(store.id)
      );
      const unchecked = storeNotices.filter(
        (n) => !(n.checkedStores || []).includes(store.id)
      ).length;

      const handoffs = getLocalData(`handoffs_${store.id}`);
      const pendingHandoffs = handoffs.filter((h) => !h.checkedBy);
      const pendingCount = pendingHandoffs.length;

      const orders = getLocalData(`orders_${store.id}`);
      const pendingOrders = orders.filter((o) => o.status === 'pending');

      const avgTemp = extractAvgTemp(handoffs);

      return {
        ...store,
        noticeCount: storeNotices.length,
        uncheckedNotices: unchecked,
        handoffPending: pendingCount > 0,
        handoffPendingCount: pendingCount,
        pendingOrders,
        avgTemp,
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

  const handleStoreClick = (store) => {
    setSelectedStore(store);
  };

  const closeModal = () => setSelectedStore(null);

  const goToStore = (path) => {
    closeModal();
    navigate(path);
  };

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
          <div
            key={store.id}
            className={`store-card store-card-clickable${store.uncheckedNotices > 0 || store.handoffPending ? ' store-card-alert' : ''}`}
            onClick={() => handleStoreClick(store)}
          >
            <div className="store-card-name">{store.name}</div>
            <div className="store-card-stats">
              {store.uncheckedNotices > 0 && (
                <span className="stat-badge stat-danger">공지 {store.uncheckedNotices}</span>
              )}
              {store.handoffPending && (
                <span className="stat-badge stat-warn">인수인계 {store.handoffPendingCount}</span>
              )}
              {store.pendingOrders?.length > 0 && (
                <span className="stat-badge stat-order">주문 {store.pendingOrders.length}</span>
              )}
              {store.uncheckedNotices === 0 && !store.handoffPending && store.pendingOrders?.length === 0 && (
                <span className="stat-ok">✓ 확인 완료</span>
              )}
            </div>
            {store.avgTemp && (
              <div className="store-card-temp">
                🌡️ 평균 {store.avgTemp}°C
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 매장 상세 모달 */}
      {selectedStore && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal store-modal" onClick={(e) => e.stopPropagation()}>
            <div className="store-modal-header">
              <h3>{selectedStore.name}</h3>
              {selectedStore.avgTemp && (
                <span className="store-modal-temp">🌡️ 평균 {selectedStore.avgTemp}°C</span>
              )}
            </div>

            <div className="store-modal-section">
              <div className="store-modal-label">📦 주문 필요 목록</div>
              {selectedStore.pendingOrders?.length > 0 ? (
                <ul className="order-quick-list">
                  {selectedStore.pendingOrders.map((o) => (
                    <li key={o.id} className="order-quick-item">
                      <span>{o.item}</span>
                      <span className="order-quick-meta">{o.author}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="store-modal-empty">주문 대기 항목이 없습니다.</p>
              )}
            </div>

            <div className="store-modal-badges">
              {selectedStore.uncheckedNotices > 0 && (
                <span className="stat-badge stat-danger">미확인 공지 {selectedStore.uncheckedNotices}건</span>
              )}
              {selectedStore.handoffPending && (
                <span className="stat-badge stat-warn">인수인계 대기 {selectedStore.handoffPendingCount}건</span>
              )}
            </div>

            <div className="modal-actions store-modal-actions">
              <button className="btn-secondary" onClick={closeModal}>닫기</button>
              <button className="btn-secondary" onClick={() => goToStore(`/store/${selectedStore.id}/board/orders`)}>
                주문내역
              </button>
              <button className="btn-primary" onClick={() => goToStore(`/store/${selectedStore.id}/tasks`)}>
                매장 바로가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
