import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STORES } from '../data/stores';
import { useAllHandoffs, useNotices, useItems, useResolutions, useTrash, useTaskList } from '../hooks/useFirestore';
import { buildPatrolList, summarize, todayKey, THRESHOLDS, cardClass } from '../lib/patrol';
import { buildStoreReorder, storeReorderToText, waitLabel } from '../lib/stock';
import { buildAliasMap } from '../lib/itemName';
import PasteBox from '../components/PasteBox';

const REASON_CLASS = {
  missing: 'reason-missing',
  none: 'reason-none',
  stale: 'reason-stale',
  open: 'reason-open',
  order: 'reason-order',
  temp: 'reason-temp',
};

function formatSeatDate(dateStr) {
  if (!dateStr) return '?';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${y.slice(2)}.${Number(m)}.${Number(d)}`;
}

function daysUntilSeatEnd(dateStr) {
  if (!dateStr) return null;
  const end = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end - today) / 86400000);
}

function nowMs() {
  return Date.now();
}

function daysSinceCheck(ms) {
  if (!ms) return null;
  return Math.floor((nowMs() - ms) / 86400000);
}

function monthlyCheckBadgeClass(days) {
  if (days === null || days >= 30) return 'seat-days-red';
  if (days >= 20) return 'seat-days-orange';
  if (days >= 10) return 'seat-days-yellow';
  if (days >= 1) return 'seat-days-green';
  return 'seat-days-blue';
}

function seatDaysBadgeClass(days) {
  if (days <= 7) return 'seat-days-red';
  if (days <= 14) return 'seat-days-orange';
  if (days <= 30) return 'seat-days-yellow';
  if (days <= 60) return 'seat-days-green';
  return 'seat-days-blue';
}

function emptySeatBadgeClass(count) {
  if (count <= 1) return 'empty-seat-1';
  if (count === 2) return 'empty-seat-2';
  if (count === 3) return 'empty-seat-3';
  if (count === 4) return 'empty-seat-4';
  if (count === 5) return 'empty-seat-5';
  return 'empty-seat-6';
}

function AgeTag({ age }) {
  const cls = age >= THRESHOLDS.staleDays ? 'age-tag stale' : 'age-tag';
  return <span className={cls}>{age}일</span>;
}

/**
 * 같은 항목이 몇 번의 보고에 올라왔는지.
 * 칸을 늘리지 않고 한 줄로 접되, 얼마나 되풀이됐는지는 이 배지로 보여준다.
 */
function RepeatTag({ count, changed }) {
  if (!count) return null;
  const cls = count >= 3 ? 'repeat-tag hot' : 'repeat-tag';
  return (
    <span className={cls} title={changed ? '문구가 바뀌었지만 같은 건으로 이어붙였습니다' : `${count}번 올라옴`}>
      +{count}
      {changed && <span className="repeat-changed">✎</span>}
    </span>
  );
}

/**
 * 합쳐진 원본 문구들.
 * 칸은 하나로 접되, 어떤 줄들이 묶였는지는 보여줘야 한다.
 * 안 그러면 `번호등 13` 이 `번호등 15` 에 묻혀 화면에서 사라진다.
 */
function Variants({ list, current }) {
  const others = (list || []).filter((v) => v !== current);
  if (others.length === 0) return null;
  return <span className="item-variants">묶임 · {others.join(' / ')}</span>;
}

function storeName(id) {
  return STORES.find((s) => s.id === id)?.name || id || '매장 모름';
}

/** 등록 시각. 같은 날 두 번 넣었을 때 어느 게 나중 것인지 구분하려면 시각이 필요하다. */
function formatStamp(ms, what = '등록') {
  if (!ms) return `${what} 시각 모름`;
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} ${what}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { byStore, loading, upsertHandoff, findSameDay, removeHandoff } = useAllHandoffs();
  const { byStore: resolutionsByStore, resolve, unresolve } = useResolutions();
  const { items: trash, restore, purge } = useTrash();
  const { notices } = useNotices();
  const { items: master } = useItems();
  const [showPaste, setShowPaste] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showAll, setShowAll] = useState(false);
  // 삭제가 실패해도 지금까지는 화면에 아무 표시가 없었다 → "눌렀는데 안 되네"가 됐다
  const [deleteError, setDeleteError] = useState(null);
  const [showTrash, setShowTrash] = useState(false);

  const today = todayKey();
  const patrol = useMemo(
    () => buildPatrolList(STORES, byStore, today, resolutionsByStore),
    [byStore, today, resolutionsByStore]
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

  const { tasks: selectedSeats, loading: seatsLoading } = useTaskList(selected, 'seats');
  const {
    tasks: selectedMonthlyChecks,
    loading: monthlyChecksLoading,
    updateTask: updateMonthlyCheck,
  } = useTaskList(selected, 'monthlyCheck');

  const handleMonthlyCheck = async (id, lastCheckedAt) => {
    await updateMonthlyCheck(id, { lastCheckedAt: lastCheckedAt ? null : nowMs() });
  };

  const aliasMap = useMemo(() => buildAliasMap(master), [master]);
  // '지금 시켜야 할 것'은 미도착 발주와 다르다. 재고가 임계치 미만인데 아직 안 시킨 품목.
  const selectedStock = useMemo(
    () => (selected ? buildStoreReorder(byStore[selected] || [], aliasMap, today) : null),
    [selected, byStore, aliasMap, today]
  );

  /** 고장·해야할일 한 줄을 임원이 직접 닫는다 */
  const handleResolve = async (kind, text) => {
    if (!selectedStatus) return;
    if (!window.confirm(`"${text}"\n해결된 것으로 처리할까요?`)) return;
    await resolve(selectedStatus.store.id, kind, text);
  };

  /**
   * 보고 한 건을 지운다.
   *
   * 실패를 삼키지 않는다. 예전에는 await 만 걸어둬서 서버가 거부해도 화면이 그대로였고,
   * 그래서 "삭제가 안 된다"로 보였다. 실패하면 이유를 띄운다.
   */
  const handleDeleteReport = async (report) => {
    if (!selectedStatus || !report?.id) return;
    const label = report.dateKey || '';
    if (!window.confirm(`${selectedStatus.store.name} ${label} 보고를 지울까요?\n되돌릴 수 없습니다.`)) {
      return;
    }
    setDeleteError(null);
    try {
      await removeHandoff(selectedStatus.store.id, report.id);
    } catch (e) {
      setDeleteError(`${label} 보고를 지우지 못했습니다 — ${e?.code || e?.message || '알 수 없는 오류'}`);
    }
  };

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

      {trash.length > 0 && (
        <div className="trash-box">
          <button className="trash-toggle" onClick={() => setShowTrash((v) => !v)}>
            🗑 휴지통 {trash.length}건 {showTrash ? '▲' : '▼'}
          </button>
          {showTrash && (
            <ul className="order-quick-list">
              {trash.map((t) => (
                <li key={t.id} className="order-quick-item">
                  <span className="item-main">
                    <span>
                      {storeName(t.payload?.storeId)} {t.payload?.parsed?.dateKey || ''}
                    </span>
                    <span className="item-variants">{formatStamp(t.deletedAt, '삭제')}</span>
                  </span>
                  <span className="order-quick-tags">
                    <button className="btn-sm btn-restore" onClick={() => restore(t)}>
                      되살리기
                    </button>
                    <button
                      className="btn-sm btn-danger"
                      onClick={() => {
                        if (window.confirm('완전히 지웁니다. 이건 되돌릴 수 없습니다.')) purge(t.id);
                      }}
                    >
                      완전삭제
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
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

      <div className="patrol-legend">
        <span className="legend-item"><i className="swatch sw-missing" />오늘 끊김</span>
        <span className="legend-item"><i className="swatch sw-a3" />5일↑</span>
        <span className="legend-item"><i className="swatch sw-a2" />3~4일</span>
        <span className="legend-item"><i className="swatch sw-a1" />1~2일</span>
        <span className="legend-item"><i className="swatch sw-a0" />오늘</span>
        <span className="legend-item"><i className="swatch sw-clear" />이상 없음</span>
        <span className="legend-item"><i className="swatch sw-none" />첫 등록 전</span>
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
              className={`patrol-item ${cardClass(s)}`}
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
              <div className="store-modal-label">💺 지정석 목록</div>
              {seatsLoading ? (
                <p className="store-modal-empty">불러오는 중...</p>
              ) : selectedSeats.length === 0 ? (
                <p className="store-modal-empty">지정석이 없습니다.</p>
              ) : (
                <ul className="order-quick-list">
                  {selectedSeats.map((seat) => {
                    const daysLeft = daysUntilSeatEnd(seat.date);
                    return (
                      <li key={seat.id} className="order-quick-item">
                        <span>{seat.text}</span>
                        <span className="seat-date-meta">
                          {(seat.startDate || seat.date) && (
                            <span className="need-stock">
                              {formatSeatDate(seat.startDate)} - {formatSeatDate(seat.date)}
                            </span>
                          )}
                          {daysLeft !== null && (
                            <span className={`seat-days-badge ${seatDaysBadgeClass(daysLeft)}`}>
                              {daysLeft < 0 ? `${-daysLeft}일 지남` : daysLeft === 0 ? '오늘 마감' : `D-${daysLeft}`}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="store-modal-section">
              <div className="store-modal-label">🗓️ 월간 점검</div>
              {monthlyChecksLoading ? (
                <p className="store-modal-empty">불러오는 중...</p>
              ) : selectedMonthlyChecks.length === 0 ? (
                <p className="store-modal-empty">없음</p>
              ) : (
                <ul className="order-quick-list">
                  {selectedMonthlyChecks.map((item) => {
                    const days = daysSinceCheck(item.lastCheckedAt);
                    return (
                      <li key={item.id} className="order-quick-item">
                        <span>{item.text}</span>
                        <span className="seat-date-meta">
                          <span className={`seat-days-badge ${monthlyCheckBadgeClass(days)}`}>
                            {days === null ? '미체크' : days === 0 ? '오늘 체크' : `${days}일 전`}
                          </span>
                          <button
                            className="btn-resolve"
                            onClick={() => handleMonthlyCheck(item.id, item.lastCheckedAt)}
                          >
                            {item.lastCheckedAt ? '체크 취소' : '✓ 체크'}
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
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
                      <span>
                        {n.name}
                        {n.urgent && <span className="urgent-badge">긴급</span>}
                      </span>
                      <span className="need-qty">
                        <RepeatTag count={n.count} changed={n.changed} />
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
              {!selectedStock || selectedStock.prevOrders.length === 0 ? (
                <p className="store-modal-empty">없음</p>
              ) : (
                <ul className="order-quick-list">
                  {selectedStock.prevOrders.map((o, i) => (
                    <li key={i} className="order-quick-item">
                      <span>
                        {o.name}
                        {o.urgent && <span className="urgent-badge">긴급</span>}
                        {o.stock != null && (
                          <span className="need-stock"> · 현재고 {o.stock}</span>
                        )}
                      </span>
                      <span className="order-quick-tags">
                        <RepeatTag count={o.count} changed={o.changed} />
                        <span className="wait-tag">{waitLabel(o.age)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DetailSection
              title="🔧 미해결 고장"
              items={selectedStatus.faults}
              resolved={selectedStatus.resolvedFaults}
              empty="없음"
              onResolve={(t) => handleResolve('fault', t)}
              onUndo={unresolve}
            />

            <div className="store-modal-section">
              <div className="store-modal-label">🪑 빈자리</div>
              {selectedStatus.emptySeats.length === 0 ? (
                <p className="store-modal-empty">없음</p>
              ) : (
                <ul className="order-quick-list">
                  {selectedStatus.emptySeats.map((it, i) => (
                    <li key={i} className="order-quick-item">
                      <span className="item-main">
                        {it.text}
                        <Variants list={it.variants} current={it.text} />
                      </span>
                      <span className={`empty-seat-badge ${emptySeatBadgeClass(it.count)}`}>
                        {it.count}회
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DetailSection
              title="🗒️ 미해결 해야할일"
              items={selectedStatus.todos}
              resolved={selectedStatus.resolvedTodos}
              empty="없음"
              onResolve={(t) => handleResolve('todo', t)}
              onUndo={unresolve}
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

            <div className="store-modal-section">
              <div className="store-modal-label">
                📄 등록된 보고
                <span className="label-sub">잘못 넣은 건 여기서 지웁니다</span>
              </div>
              {deleteError && <p className="delete-error">⚠️ {deleteError}</p>}
              {selectedStatus.reportList.length === 0 ? (
                <p className="store-modal-empty">없음</p>
              ) : (
                <ul className="order-quick-list">
                  {selectedStatus.reportList.map((r) => (
                    <li key={r.id} className="order-quick-item">
                      <span className="item-main">
                        <span>
                          {r.dateKey}
                          {r.formatVersion !== 'v3' && (
                            <span className="report-flag">구양식</span>
                          )}
                          {!r.active && <span className="report-flag dim">계산 제외</span>}
                        </span>
                        <span className="item-variants">
                          {formatStamp(r.createdAt)}
                          {!r.active && ' · 같은 날 더 최신 보고가 있습니다'}
                        </span>
                      </span>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => handleDeleteReport(r)}
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="modal-actions store-modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setSelected(null);
                  setDeleteError(null);
                }}
              >
                닫기
              </button>
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

function DetailSection({ title, items, resolved, empty, onResolve, onUndo }) {
  const closed = resolved || [];
  return (
    <div className="store-modal-section">
      <div className="store-modal-label">{title}</div>
      {items.length === 0 ? (
        <p className="store-modal-empty">{empty}</p>
      ) : (
        <ul className="order-quick-list">
          {items.map((it, i) => (
            <li key={i} className="order-quick-item">
              <span className="item-main">
                {it.text}
                <Variants list={it.variants} current={it.text} />
              </span>
              <span className="order-quick-tags">
                <AgeTag age={it.age} />
                <RepeatTag count={it.count} changed={it.changed} />
                {onResolve && (
                  <button
                    className="btn-resolve"
                    title="현장에서 고쳤으면 여기서 닫는다"
                    onClick={() => onResolve(it.text)}
                  >
                    ✓ 해결
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <ul className="order-quick-list resolved-list">
          {closed.map((it, i) => (
            <li key={i} className="order-quick-item resolved-item">
              <span className="item-main">
                <span className="resolved-text">{it.text}</span>
                <span className="item-variants">
                  해결 처리됨 · 매장이 다시 올리면 되살아납니다
                </span>
              </span>
              {onUndo && it.resolution?.id && (
                <button className="btn-undo" onClick={() => onUndo(it.resolution.id)}>
                  되돌리기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
