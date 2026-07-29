import { useMemo, useState } from 'react';
import { STORES } from '../data/stores';
import { useAllHandoffs, useItems } from '../hooks/useFirestore';
import { buildStockView, reorderToText, waitLabel, DEFAULT_THRESHOLD } from '../lib/stock';
import { buildAliasMap, canonicalName, itemKey, suggestMerges } from '../lib/itemName';
import { todayKey } from '../lib/patrol';

const TABS = [
  { key: 'reorder', label: '발주 필요' },
  { key: 'matrix', label: '매장 × 품목' },
  { key: 'names', label: '품목 정리' },
];

export default function Stock() {
  const { byStore, loading } = useAllHandoffs();
  const { items: master, mergeInto, unmerge, setThreshold } = useItems();
  const [tab, setTab] = useState('reorder');

  const aliasMap = useMemo(() => buildAliasMap(master), [master]);
  const view = useMemo(
    () => buildStockView(STORES, byStore, master, aliasMap, todayKey()),
    [byStore, master, aliasMap]
  );

  const handleCopy = () => {
    const text = reorderToText(view.reorder);
    navigator.clipboard?.writeText(text).catch(() => {});
    window.alert('발주 목록을 복사했습니다.');
  };

  return (
    <div className="dashboard stock-page">
      <div className="page-header">
        <h2>재고 현황</h2>
        {tab === 'reorder' && view.reorder.length > 0 && (
          <button className="btn-secondary btn-sm" onClick={handleCopy}>
            목록 복사
          </button>
        )}
      </div>

      <div className="stock-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`stock-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : tab === 'reorder' ? (
        <ReorderList view={view} />
      ) : tab === 'matrix' ? (
        <Matrix view={view} />
      ) : (
        <NameManager
          view={view}
          master={master}
          aliasMap={aliasMap}
          mergeInto={mergeInto}
          unmerge={unmerge}
          setThreshold={setThreshold}
        />
      )}
    </div>
  );
}

/* ===== 발주 필요 목록 ===== */
function ReorderList({ view }) {
  if (view.reorder.length === 0) {
    return <p className="empty-state">■주문에 올라온 항목이 없습니다.</p>;
  }

  return (
    <div className="reorder-list">
      {view.reorder.map((row) => (
        <div key={row.name} className="reorder-card">
          <div className="reorder-head">
            <span className="reorder-name">{row.name}</span>
            <span className="reorder-count">{row.stores.length}개 매장</span>
          </div>
          <div className="reorder-stores">
            {row.stores.map((s, i) => (
              <div key={`${s.store.id}-${i}`} className={`reorder-store${s.kind === 'pending' ? ' pending' : ''}`}>
                <span className="reorder-store-name">{s.store.name}</span>
                <span className="reorder-qty">
                  {s.qty != null ? `${s.qty}${s.unit || ''}` : '수량 미기재'}
                </span>
                {s.stock != null && <span className="reorder-stock">현재고 {s.stock}</span>}
                {s.kind === 'pending' && <span className="reorder-wait">{waitLabel(s.age)}</span>}
                {s.urgent && <span className="reorder-urgent">긴급</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== 매장 × 품목 매트릭스 ===== */
function Matrix({ view }) {
  if (view.items.length === 0) {
    return <p className="empty-state">아직 ■재고 / ■주문이 등록된 보고가 없습니다.</p>;
  }

  return (
    <>
      <div className="matrix-legend">
        <span><b className="cell-low">빨강</b> 임계치 미만</span>
        <span><b className="cell-order">파랑</b> 발주 대기</span>
        <span><b className="cell-missing">—</b> 보고했으나 미기재</span>
        <span><b className="cell-none">·</b> 오늘 보고 없음</span>
      </div>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="matrix-corner">매장</th>
              {view.items.map((it) => (
                <th key={it.name} className="matrix-col">
                  <span className="matrix-col-name">{it.name}</span>
                  <span className="matrix-col-th">임계 {it.threshold}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STORES.map((store) => (
              <tr key={store.id}>
                <th className="matrix-row-head">{store.name}</th>
                {view.items.map((it) => {
                  const c = it.cells[store.id];
                  let cls = '';
                  let text = '';
                  if (c.notReported) {
                    cls = 'cell-none';
                    text = '·';
                  } else if (c.qty === null) {
                    cls = c.order ? 'cell-order' : 'cell-missing';
                    text = c.order ? '발주' : '—';
                  } else {
                    cls = c.low ? (c.order ? 'cell-order' : 'cell-low') : '';
                    text = `${c.qty}`;
                  }
                  return (
                    <td key={it.name} className={`matrix-cell ${cls}`} title={c.order ? waitLabel(c.order.age) : ''}>
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ===== 품목 정리 ===== */
function NameManager({ view, master, aliasMap, mergeInto, unmerge, setThreshold }) {
  const [pendingTarget, setPendingTarget] = useState({});

  // 아직 대표 품목에 묶이지 않은 원본 이름
  const unlinked = useMemo(
    () => view.rawNames.filter((n) => !aliasMap.has(itemKey(n))).sort(),
    [view.rawNames, aliasMap]
  );

  const allNames = useMemo(() => {
    const s = new Set(master.map((m) => m.canonical));
    for (const n of view.rawNames) s.add(n);
    return [...s].sort();
  }, [master, view.rawNames]);

  // 이미 같은 대표 품목으로 묶인 쌍은 추천에서 뺀다
  const suggestions = useMemo(
    () =>
      suggestMerges(allNames).filter(
        (s) => canonicalName(s.a, aliasMap) !== canonicalName(s.b, aliasMap)
      ),
    [allNames, aliasMap]
  );

  return (
    <div className="name-manager">
      {suggestions.length > 0 && (
        <div className="name-section">
          <h3>같은 물건으로 보이는 이름</h3>
          <p className="name-hint">
            이름이 서로 포함 관계이거나 한 글자만 달라 같은 품목일 가능성이 높습니다. 확인 후 눌러주세요.
          </p>
          {suggestions.map((s, i) => (
            <div key={i} className="merge-suggest">
              <span className="merge-pair">
                <b>{s.b}</b> → <b>{s.a}</b>
                <span className="merge-reason">{s.reason}</span>
              </span>
              <button className="btn-sm btn-secondary" onClick={() => mergeInto(s.a, s.b)}>
                같은 물건으로 묶기
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="name-section">
        <h3>정리 안 된 이름 ({unlinked.length})</h3>
        {unlinked.length === 0 ? (
          <p className="empty-state">모두 정리되었습니다.</p>
        ) : (
          unlinked.map((name) => (
            <div key={name} className="merge-row">
              <span className="merge-name">{name}</span>
              <select
                value={pendingTarget[name] || ''}
                onChange={(e) => setPendingTarget((p) => ({ ...p, [name]: e.target.value }))}
              >
                <option value="">대표 품목 선택...</option>
                {allNames
                  .filter((n) => n !== name)
                  .map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
              </select>
              <button
                className="btn-sm btn-secondary"
                disabled={!pendingTarget[name]}
                onClick={() => mergeInto(pendingTarget[name], name)}
              >
                묶기
              </button>
            </div>
          ))
        )}
      </div>

      <div className="name-section">
        <h3>대표 품목 ({master.length})</h3>
        {master.length === 0 ? (
          <p className="empty-state">아직 묶은 품목이 없습니다.</p>
        ) : (
          master
            .slice()
            .sort((a, b) => a.canonical.localeCompare(b.canonical))
            .map((m) => (
              <div key={m.id} className="master-row">
                <div className="master-head">
                  <span className="master-name">{m.canonical}</span>
                  <label className="master-threshold">
                    임계
                    <input
                      type="number"
                      min="0"
                      defaultValue={m.threshold ?? ''}
                      placeholder={String(DEFAULT_THRESHOLD)}
                      onBlur={(e) => setThreshold(m.canonical, e.target.value)}
                    />
                  </label>
                </div>
                {(m.aliases || []).length > 0 && (
                  <div className="master-aliases">
                    {m.aliases.map((a) => (
                      <button
                        key={a}
                        className="alias-chip"
                        title="누르면 분리됩니다"
                        onClick={() => unmerge(m.canonical, a)}
                      >
                        {a} ✕
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
