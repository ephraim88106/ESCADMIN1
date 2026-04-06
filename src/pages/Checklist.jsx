import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { CHECKLIST_TEMPLATE } from '../data/checklistTemplate';
import { useChecklist, useChecklistHistory } from '../hooks/useFirestore';

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildInitialChecks() {
  // { "카테고리::항목": false }
  const obj = {};
  CHECKLIST_TEMPLATE.forEach((cat) => {
    cat.items.forEach((item) => {
      obj[`${cat.category}::${item}`] = false;
    });
  });
  return obj;
}

export default function Checklist() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);
  const [dateKey] = useState(todayKey());
  const { record, loading, saveChecklist } = useChecklist(storeId, dateKey);
  const { history } = useChecklistHistory(storeId);
  const [checkerName, setCheckerName] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());

  const checks = useMemo(() => {
    const base = buildInitialChecks();
    if (record?.checks) {
      return { ...base, ...record.checks };
    }
    return base;
  }, [record]);

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  const totalCount = Object.keys(checks).length;
  const checkedCount = Object.values(checks).filter(Boolean).length;
  const isComplete = checkedCount === totalCount;

  const handleToggle = async (key) => {
    const next = { ...checks, [key]: !checks[key] };
    await saveChecklist({
      checks: next,
      checkedBy: record?.checkedBy || null,
      completedAt: record?.completedAt || null,
    });
  };

  const handleCheckAll = async () => {
    const next = {};
    Object.keys(checks).forEach((k) => (next[k] = true));
    await saveChecklist({
      checks: next,
      checkedBy: record?.checkedBy || null,
      completedAt: record?.completedAt || null,
    });
  };

  const handleReset = async () => {
    if (!window.confirm('오늘 체크 내역을 초기화하시겠습니까?')) return;
    await saveChecklist({
      checks: buildInitialChecks(),
      checkedBy: null,
      completedAt: null,
    });
  };

  const handleComplete = async () => {
    if (!isComplete) {
      if (!window.confirm('아직 체크하지 않은 항목이 있습니다. 완료 처리하시겠습니까?')) return;
    }
    const name = checkerName.trim() || window.prompt('확인자 이름을 입력하세요:');
    if (!name?.trim()) return;
    await saveChecklist({
      checks,
      checkedBy: name.trim(),
      completedAt: Date.now(),
    });
    setCheckerName('');
  };

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pastHistory = history.filter((h) => h.dateKey !== dateKey);

  return (
    <div className="checklist-page">
      <div className="page-header">
        <h2>매장관리 체크리스트</h2>
        <span className="checklist-date">{dateKey}</span>
      </div>

      <div className="checklist-progress-bar">
        <div
          className="checklist-progress-fill"
          style={{ width: `${(checkedCount / totalCount) * 100}%` }}
        />
        <span className="checklist-progress-text">
          {checkedCount} / {totalCount} 완료
        </span>
      </div>

      {record?.checkedBy && (
        <div className="checklist-done-banner">
          ✓ {record.checkedBy} 확인 완료
        </div>
      )}

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : (
        <>
          {CHECKLIST_TEMPLATE.map((cat) => (
            <div key={cat.category} className="checklist-category">
              <div className="checklist-category-title">
                {cat.icon} {cat.category}
              </div>
              <div className="checklist-items">
                {cat.items.map((item) => {
                  const key = `${cat.category}::${item}`;
                  const checked = !!checks[key];
                  return (
                    <label
                      key={key}
                      className={`checklist-item${checked ? ' checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggle(key)}
                      />
                      <span>{item}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="checklist-actions">
            <button className="btn-secondary" onClick={handleCheckAll}>
              전체 체크
            </button>
            <button className="btn-secondary" onClick={handleReset}>
              초기화
            </button>
            <input
              type="text"
              className="checker-input"
              placeholder="확인자 이름"
              value={checkerName}
              onChange={(e) => setCheckerName(e.target.value)}
            />
            <button className="btn-primary" onClick={handleComplete}>
              확인 완료
            </button>
          </div>

          {pastHistory.length > 0 && (
            <div className="checklist-history">
              <h3>이전 기록</h3>
              {pastHistory.map((h) => {
                const done = Object.values(h.checks || {}).filter(Boolean).length;
                const total = Object.keys(h.checks || {}).length;
                const expanded = expandedIds.has(h.id);
                return (
                  <div key={h.id} className="checklist-history-item">
                    <div
                      className="checklist-history-header clickable"
                      onClick={() => toggleExpanded(h.id)}
                    >
                      <strong>{h.dateKey}</strong>
                      <span className="handoff-time">{done} / {total}</span>
                      {h.checkedBy && (
                        <span className="handoff-checker">→ {h.checkedBy}</span>
                      )}
                      <span className="expand-icon">{expanded ? '▲' : '▼'}</span>
                    </div>
                    {expanded && (
                      <div className="checklist-history-body">
                        {CHECKLIST_TEMPLATE.map((cat) => (
                          <div key={cat.category} className="checklist-category">
                            <div className="checklist-category-title">
                              {cat.icon} {cat.category}
                            </div>
                            {cat.items.map((item) => {
                              const key = `${cat.category}::${item}`;
                              const checked = !!h.checks?.[key];
                              return (
                                <div
                                  key={key}
                                  className={`checklist-item readonly${checked ? ' checked' : ''}`}
                                >
                                  <span>{checked ? '✓' : '○'}</span>
                                  <span>{item}</span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
