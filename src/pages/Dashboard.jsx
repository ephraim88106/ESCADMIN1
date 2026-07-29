import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STORES } from '../data/stores';
import { useAllHandoffs, useNotices, useItems } from '../hooks/useFirestore';
import { buildPatrolList, summarize, todayKey, THRESHOLDS } from '../lib/patrol';
import { buildStoreReorder, storeReorderToText, waitLabel } from '../lib/stock';
import { buildAliasMap } from '../lib/itemName';
import PasteBox from '../components/PasteBox';

const REASON_CLASS = {
  missing: 'reason-missing',
  stale: 'reason-stale',
  open: 'reason-open',
  order: 'reason-order',
  temp: 'reason-temp',
};

function AgeTag({ age }) {
  const cls = age >= THRESHOLDS.staleDays ? 'age-tag stale' : 'age-tag';
  return <span className={cls}>{age}일</span>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { byStore, loading, upsertHandoff, findSameDay } = useAllHandoffs();
  const { notices } = useNotices();
  const { items: master } = useItems();
  const [showPaste, setShowPaste] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const today = todayKey();
  const patrol = useMemo(
    () => buildPatrolList(STORES, byStore, today),
    [byStore, today]
  );
  const stats = useMemo(() => summarize(patrol), [patrol]);

  const uncheckedNotices = useMemo(
    () =>
      notices.reduce((acc, n) => {
        const targets = n.targetStores || [];
        const checked = n.checkedStores || [];
        return acc + targets.filter((t) => !checked.includes(t)).length;
      }, 0),
    [notices]
  );

  // 정상 매장은 접어둔다. 17개를 다 보려 하면 관리가 무너진다.
  const needsAttention = patrol.filter((s) => !s.isClear);
  const clear = patrol.filter((s) => s.isClear);
  const visible = showAll ? patrol : needsAttention;

  const selectedStatus = selected
    ? patrol.find((s) => s.store.id === selected) || null
    : null;

  const aliasMap = useMemo(() => buildAliasMap(master), [master]);
  // '지금 시켜야 할 것'은 미도착 발주와 다르다. 재고가 임계치 미만인데 아직 안 시킨 품목.
  const selectedStock = useMemo(
    () => (selected ? buildStoreReorder(byStore[selected] || [], aliasMap, today) : null),
    [selected, byStore, aliasMap, today]
  );

  const handleCopyReorder = () => {
    if (!selectedStatus || !selectedStock) return;
    const text = storeReorderToText(
      selectedStatus.store.name,
      selectedStock.needOrder,
      selectedStock.prevOrders
    );
    navigator.clipboard?.writeText(text).catch(() => {});
    window.alert('발주 목록을 복사했습니다.');
  };

  return (
    <div className="dashboard">
      <div className="page-header">
        <h2>종합 대시보드</h2>
        <button className="btn-primary" onClick={() => setShowPaste((v) => !v)}>
          {showPaste ? '닫기' : '📋 문자 붙여넣기'}
        </button>
      </div>

      {showPaste && (
        <PasteBox upsertHandoff={upsertHandoff} findSameDay={findSameDay} />
      )}

      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-label">오늘 보고</div>
          <div className={`summary-value${stats.missing > 0 ? ' text-danger' : ''}`}>
            {loading ? '...' : `${stats.submitted}/${stats.total}`}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">{THRESHOLDS.staleDays}일↑ 방치</div>
          <div className={`summary-value${stats.staleTotal > 0 ? ' text-danger' : ''}`}>
            {loading ? '...' : `${stats.staleTotal}건`}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">전체 미해결</div>
          <div className={`summary-value${stats.openTotal > 0 ? ' text-warn' : ''}`}>
            {loading ? '...' : `${stats.openTotal}건`}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">발주 필요</div>
          <div className={`summary-value${stats.needOrder > 0 ? ' text-warn' : ''}`}>
            {loading ? '...' : `${stats.needOrder}건`}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">미도착 발주</div>
          <div className={`summary-value${stats.orderOverdue > 0 ? ' text-danger' : ''}`}>
            {loading ? '...' : `${stats.orderOverdue}건`}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-label">미확인 공지</div>
          <div className={`summary-value${uncheckedNotices > 0 ? ' text-warn' : ''}`}>
            {uncheckedNotices}건
          </div>
        </div>
      </div>

      <div className="patrol-header">
        <h3>오늘의 순회 <span className="patrol-sub">위험한 순서</span></h3>
        <button className="btn-sm btn-secondary" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '이상 있는 곳만' : `전체 보기 (${patrol.length})`}
        </button>
      </div>

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : visible.length === 0 ? (
        <p className="empty-state">
          이상 있는 매장이 없습니다. 17개 전부 오늘 보고가 들어왔고 미해결 항목도 없습니다.
        </p>
      ) : (
        <ol className="patrol-list">
          {visible.map((s, idx) => (
            <li
              key={s.store.id}
              className={`patrol-item${s.submittedToday ? '' : ' patrol-missing'}${s.isClear ? ' patrol-clear' : ''}`}
              onClick={() => setSelected(s.store.id)}
            >
              <span className="patrol-rank">{idx + 1}</span>
              <div className="patrol-body">
                <div className="patrol-name">
                  {s.store.name}
                  {s.maxAge > 0 && <AgeTag age={s.maxAge} />}
                </div>
                <div className="patrol-reasons">
                  {s.reasons.length === 0 ? (
                    <span className="reason-chip reason-ok">이상 없음</span>
                  ) : (
                    s.reasons.map((r, i) => (
                      <span key={i} className={`reason-chip ${REASON_CLASS[r.kind] || ''}`}>
                        {r.text}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <span className="patrol-arrow">›</span>
            </li>
          ))}
        </ol>
      )}

      {!showAll && clear.length > 0 && (
        <p className="patrol-footnote">
          나머지 {clear.length}개 매장은 오늘 보고 완료 · 미해결 없음
        </p>
      )}

      {selectedStatus && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal store-modal" onClick={(e) => e.stopPropagation()}>
            <div className="store-modal-header">
              <h3>{selectedStatus.store.name}</h3>
              <span className="store-modal-temp">
                {selectedStatus.lastDateKey
                  ? `최근 보고 ${selectedStatus.lastDateKey}`
                  : '보고 기록 없음'}
              </span>
            </div>

            <div className="store-modal-section">
              <div className="store-modal-label">
                📦 발주 필요
                <span className="label-sub">문자의 ■주문</span>
                {selectedStock?.needOrder.length > 0 && (
                  <button className="btn-sm btn-secondary label-action" onClick={handleCopyReorder}>
                    복사
                  </button>
                )}
              </div>
              {!selectedStock || selectedStock.needOrder.length === 0 ? (
                <p className="store-modal-empty">
                  {selectedStock?.reported ? '없음' : '보고가 없습니다'}
                </p>
              ) : (
                <ul className="order-quick-list">
                  {selectedStock.needOrder.map((n) => (
                    <li key={n.name} className="order-quick-item">
                      <span>{n.name}</span>
                      <span className="need-qty">
                        {n.qty != null ? `${n.qty}${n.unit}` : '수량 미기재'}
                        {n.stock != null && (
                          <span className="need-stock"> · 현재고 {n.stock}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="store-modal-section">
              <div className="store-modal-label">
                🚚 미도착 발주
                <span className="label-sub">문자의 (이전요청)</span>
              </div>
              {selectedStatus.orderOverdue.length === 0 ? (
                <p className="store-modal-empty">없음</p>
              ) : (
                <ul className="order-quick-list">
                  {selectedStatus.orderOverdue.map((o, i) => (
                    <li key={i} className="order-quick-item">
                      <span>{o.text}</span>
                      <span className="wait-tag">{waitLabel(o.age)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DetailSection
              title="🔧 미해결 고장"
              items={selectedStatus.faults}
              empty="없음"
            />
            <DetailSection
              title="🗒️ 미해결 해야할일"
              items={selectedStatus.todos}
              empty="없음"
            />

            {selectedStatus.tempFlags.length > 0 && (
              <div className="store-modal-section">
                <div className="store-modal-label">🌡️ 온습도 이탈</div>
                <ul className="order-quick-list">
                  {selectedStatus.tempFlags.map((t, i) => (
                    <li key={i} className="order-quick-item">{t}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-actions store-modal-actions">
              <button className="btn-secondary" onClick={() => setSelected(null)}>닫기</button>
              <button
                className="btn-primary"
                onClick={() => navigate(`/store/${selectedStatus.store.id}/board/handoff`)}
              >
                인수인계 보기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailSection({ title, items, empty }) {
  return (
    <div className="store-modal-section">
      <div className="store-modal-label">{title}</div>
      {items.length === 0 ? (
        <p className="store-modal-empty">{empty}</p>
      ) : (
        <ul className="order-quick-list">
          {items.map((it, i) => (
            <li key={i} className="order-quick-item">
              <span>{it.text}</span>
              <AgeTag age={it.age} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
