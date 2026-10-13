import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STORES } from '../data/stores';
import { useAllHandoffs, useItems, useResolutions } from '../hooks/useFirestore';
import { buildAliasMap } from '../lib/itemName';
import { buildPatrolList, todayKey, THRESHOLDS } from '../lib/patrol';
import CheckerConfirm from '../components/CheckerConfirm';

/**
 * 전사 고장 현황.
 *
 * 재고 현황이 ■주문을 17개 매장 기준으로 모으듯, 이 화면은 ■고장을 모은다.
 * 집계는 새로 하지 않는다 — patrol.js 가 매장별로 이미 계산해 둔 faults 를
 * 한 줄씩 펴서 오래된 순으로 세우는 게 전부다.
 *
 * 정렬을 방치 일수로 두는 이유: 고장은 건수보다 '얼마나 오래 방치됐나'가 위험이다.
 * 한 매장에 세 건 있는 것보다, 한 건이 9일째인 쪽이 먼저 처리돼야 한다.
 */

/** 방치 일수에 따른 색 단계. 3일(staleDays)을 넘기면 눈에 띄게 만든다. */
function dayLevel(age) {
  if (age >= 7) return 3;
  if (age >= THRESHOLDS.staleDays) return 2;
  if (age >= 1) return 1;
  return 0;
}

function DayBadge({ age }) {
  return (
    <span className={`fault-day lv-${dayLevel(age)}`}>
      {age === 0 ? '오늘' : `${age}일째`}
    </span>
  );
}

export default function Faults() {
  const navigate = useNavigate();
  const { byStore, loading } = useAllHandoffs();
  const { byStore: resolutionsByStore, resolve, unresolve } = useResolutions();
  const { items: master } = useItems();

  const [confirmRequest, setConfirmRequest] = useState(null);
  const [checkerName, setCheckerName] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const today = todayKey();
  const aliasMap = useMemo(() => buildAliasMap(master), [master]);

  const list = useMemo(
    () => buildPatrolList(STORES, byStore, today, resolutionsByStore, aliasMap),
    [byStore, today, resolutionsByStore, aliasMap]
  );

  // 매장별로 묶여 있는 고장을 한 줄씩 펴서 오래된 순으로 세운다.
  const { open, resolved } = useMemo(() => {
    const openRows = [];
    const resolvedRows = [];
    for (const s of list) {
      for (const f of s.faults) {
        openRows.push({ store: s.store, fault: f, submittedToday: s.submittedToday });
      }
      for (const f of s.resolvedFaults) {
        resolvedRows.push({ store: s.store, fault: f });
      }
    }
    const byAge = (a, b) =>
      b.fault.age - a.fault.age || a.store.name.localeCompare(b.store.name);
    resolvedRows.sort(
      (a, b) => (b.fault.resolution?.resolvedAt ?? 0) - (a.fault.resolution?.resolvedAt ?? 0)
    );
    return { open: openRows.sort(byAge), resolved: resolvedRows };
  }, [list]);

  const storeCount = useMemo(
    () => new Set(open.map((r) => r.store.id)).size,
    [open]
  );
  const staleCount = useMemo(
    () => open.filter((r) => r.fault.age >= THRESHOLDS.staleDays).length,
    [open]
  );

  const handleResolve = (row) => {
    setConfirmRequest({
      key: `${row.store.id}:fault:${row.fault.text}`,
      title: '해결 처리',
      target: `"${row.fault.text}"`,
      detail: `${row.store.name} · 해결된 것으로 처리합니다.`,
      run: (name) => resolve(row.store.id, 'fault', row.fault.text, name),
    });
  };

  const runConfirmRequest = async (name) => {
    if (!confirmRequest) return;
    await confirmRequest.run(name);
    setCheckerName(name);
    setConfirmRequest(null);
  };

  // 담당자에게 그대로 붙여넣어 보낼 수 있는 형태로 뽑는다.
  const handleCopy = () => {
    const byManager = new Map();
    for (const r of open) {
      const key = r.store.manager || '담당 미지정';
      if (!byManager.has(key)) byManager.set(key, []);
      byManager.get(key).push(r);
    }
    const text = [...byManager.entries()]
      .map(([manager, rows]) =>
        [
          `[${manager}]`,
          ...rows.map(
            (r) =>
              `- ${r.store.name} ${r.fault.text} (${r.fault.age === 0 ? '오늘' : `${r.fault.age}일째`})`
          ),
        ].join('\n')
      )
      .join('\n\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    window.alert('고장 목록을 복사했습니다.');
  };

  return (
    <div className="dashboard fault-page">
      <div className="page-header">
        <h2>고장 현황</h2>
        {open.length > 0 && (
          <button className="btn-secondary btn-sm" onClick={handleCopy}>
            목록 복사
          </button>
        )}
      </div>

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : (
        <>
          <div className="fault-summary">
            <span>
              미해결 <b>{open.length}</b>건
            </span>
            <span>
              {storeCount}개 매장
            </span>
            {staleCount > 0 && (
              <span className="fault-summary-stale">
                {THRESHOLDS.staleDays}일 이상 방치 <b>{staleCount}</b>건
              </span>
            )}
          </div>

          {open.length === 0 ? (
            <p className="empty-state">미해결 고장이 없습니다.</p>
          ) : (
            <ul className="fault-list">
              {open.map((row) => (
                <li key={`${row.store.id}:${row.fault.text}`} className="fault-row">
                  <DayBadge age={row.fault.age} />
                  <div className="fault-body">
                    <div className="fault-text">{row.fault.text}</div>
                    <div className="fault-meta">
                      <button
                        type="button"
                        className="fault-store"
                        onClick={() => navigate(`/store/${row.store.id}/tasks`)}
                      >
                        {row.store.name}
                      </button>
                      {row.store.manager && (
                        <span className="fault-manager">{row.store.manager}</span>
                      )}
                      {row.fault.count > 1 && (
                        <span className="fault-chip">{row.fault.count}번 보고</span>
                      )}
                      {row.fault.changed && (
                        <span className="fault-chip" title="보고할 때마다 문구가 달라졌습니다">
                          문구 바뀜
                        </span>
                      )}
                      {!row.submittedToday && (
                        <span className="fault-chip warn">오늘 보고 없음</span>
                      )}
                    </div>
                  </div>
                  <button className="btn-sm btn-secondary" onClick={() => handleResolve(row)}>
                    해결
                  </button>
                </li>
              ))}
            </ul>
          )}

          {resolved.length > 0 && (
            <div className="fault-resolved">
              <button
                type="button"
                className="fault-resolved-toggle"
                onClick={() => setShowResolved((v) => !v)}
              >
                {showResolved ? '▾' : '▸'} 최근 해결 {resolved.length}건
              </button>
              {showResolved && (
                <ul className="fault-list">
                  {resolved.map((row) => (
                    <li
                      key={`${row.store.id}:${row.fault.text}`}
                      className="fault-row is-resolved"
                    >
                      <span className="fault-day done">해결</span>
                      <div className="fault-body">
                        <div className="fault-text">{row.fault.text}</div>
                        <div className="fault-meta">
                          <span className="fault-store as-text">{row.store.name}</span>
                          <span className="fault-chip">
                            {row.fault.resolution?.resolvedBy || '임원'} 처리
                          </span>
                        </div>
                      </div>
                      <button
                        className="btn-sm btn-undo"
                        onClick={() => unresolve(row.fault.resolution.id)}
                      >
                        되돌리기
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {confirmRequest && (
        <CheckerConfirm
          key={confirmRequest.key}
          request={confirmRequest}
          defaultName={checkerName}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={runConfirmRequest}
        />
      )}
    </div>
  );
}
