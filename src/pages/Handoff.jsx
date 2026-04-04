import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { useHandoffs } from '../hooks/useFirestore';

const SECTION_TYPES = [
  { type: 'fixed_seats', label: '고정석', placeholder: '11, 12, 14, 15, 17, 18, 19, 46, 47, 48' },
  { type: 'temperature', label: '온도체크', placeholder: '카페테리아(냉장고위) 25.3\n24번 23.5\n37-38번 23.9' },
  { type: 'empty_seats', label: '빈자리', placeholder: 'X 또는 빈자리 번호' },
  { type: 'orders', label: '주문/발주', placeholder: '주방세제 #긴급 (재고0, 개봉0)' },
  { type: 'cleaning', label: '청소', placeholder: '청소 완료 여부, 특이사항' },
  { type: 'memo', label: '기타 메모', placeholder: '기타 전달사항' },
];

function formatTime(ts) {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

function hasUrgent(content) {
  return content.includes('#긴급');
}

const EMPTY_FORM = Object.fromEntries(SECTION_TYPES.map((s) => [s.type, '']));

export default function Handoff() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);
  const { handoffs, loading, addHandoff, updateHandoff, removeHandoff } =
    useHandoffs(storeId);

  const [showForm, setShowForm] = useState(false);
  const [author, setAuthor] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [expandedIds, setExpandedIds] = useState(new Set());

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  // 가장 최근 미확인 인수인계
  const pending = handoffs.find((h) => !h.checkedBy);
  const history = handoffs.filter((h) => h.checkedBy);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!author.trim()) return;

    const sections = SECTION_TYPES
      .filter((s) => form[s.type].trim())
      .map((s) => ({
        type: s.type,
        label: s.label,
        content: form[s.type].trim(),
        checked: false,
      }));

    if (sections.length === 0) return;

    await addHandoff({
      author: author.trim(),
      sections,
      checkedBy: null,
      checkedAt: null,
    });

    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  };

  const handleToggleCheck = async (handoff, sectionIdx) => {
    const newSections = handoff.sections.map((sec, i) =>
      i === sectionIdx ? { ...sec, checked: !sec.checked } : sec
    );
    await updateHandoff(handoff.id, { sections: newSections });
  };

  const handleConfirmAll = async (handoff) => {
    const checkerName = window.prompt('확인자 이름을 입력하세요:');
    if (!checkerName?.trim()) return;

    const allChecked = handoff.sections.map((sec) => ({ ...sec, checked: true }));
    await updateHandoff(handoff.id, {
      sections: allChecked,
      checkedBy: checkerName.trim(),
      checkedAt: Date.now(),
    });
  };

  const handleDelete = async (handoff) => {
    if (window.confirm('이 인수인계를 삭제하시겠습니까?')) {
      await removeHandoff(handoff.id);
    }
  };

  const toggleExpanded = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderSections = (handoff, editable) => (
    <div className="handoff-sections">
      {handoff.sections.map((sec, i) => {
        const urgent = sec.type === 'orders' && hasUrgent(sec.content);
        return (
          <div
            key={i}
            className={`handoff-section${urgent ? ' urgent' : ''}${sec.checked ? ' checked' : ''}`}
          >
            <div className="section-header">
              {editable ? (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={sec.checked}
                    onChange={() => handleToggleCheck(handoff, i)}
                  />
                  <span className="section-label">{sec.label}</span>
                  {urgent && <span className="urgent-tag">#긴급</span>}
                </label>
              ) : (
                <span className="section-label">
                  {sec.checked ? '✓ ' : ''}{sec.label}
                  {urgent && <span className="urgent-tag">#긴급</span>}
                </span>
              )}
            </div>
            <pre className="section-content">{sec.content}</pre>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="handoff-page">
      <div className="page-header">
        <h2>{store.name} - 인수인계</h2>
        <button
          className="btn-primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '취소' : '+ 새 인수인계'}
        </button>
      </div>

      {/* 작성 폼 */}
      {showForm && (
        <form className="handoff-form" onSubmit={handleSubmit}>
          <label>
            작성자
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="이름"
              required
            />
          </label>
          {SECTION_TYPES.map((s) => (
            <label key={s.type}>
              {s.label}
              <textarea
                value={form[s.type]}
                onChange={(e) =>
                  setForm({ ...form, [s.type]: e.target.value })
                }
                placeholder={s.placeholder}
                rows={s.type === 'temperature' || s.type === 'memo' ? 3 : 1}
              />
            </label>
          ))}
          <button type="submit" className="btn-primary">
            인수인계 등록
          </button>
        </form>
      )}

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : handoffs.length === 0 && !showForm ? (
        <p className="empty-state">인수인계 기록이 없습니다. 새 인수인계를 작성해주세요.</p>
      ) : (
        <>
          {/* 확인 대기 중인 최신 인수인계 */}
          {pending && (
            <div className="handoff-card pending-card">
              <div className="handoff-card-header">
                <div>
                  <span className="handoff-status pending">확인 대기</span>
                  <strong>{pending.author}</strong>
                  <span className="handoff-time">{formatTime(pending.createdAt)}</span>
                </div>
                <div className="handoff-card-actions">
                  <button
                    className="btn-primary btn-confirm"
                    onClick={() => handleConfirmAll(pending)}
                  >
                    전체 확인 완료
                  </button>
                  <button
                    className="btn-sm btn-danger"
                    onClick={() => handleDelete(pending)}
                  >
                    삭제
                  </button>
                </div>
              </div>
              {renderSections(pending, true)}
              <div className="check-progress">
                {pending.sections.filter((s) => s.checked).length} / {pending.sections.length} 확인됨
              </div>
            </div>
          )}

          {/* 이전 기록 */}
          {history.length > 0 && (
            <div className="handoff-history">
              <h3>이전 기록</h3>
              {history.map((h) => (
                <div key={h.id} className="handoff-card history-card">
                  <div
                    className="handoff-card-header clickable"
                    onClick={() => toggleExpanded(h.id)}
                  >
                    <div>
                      <span className="handoff-status done">확인 완료</span>
                      <strong>{h.author}</strong>
                      <span className="handoff-time">{formatTime(h.createdAt)}</span>
                      <span className="handoff-checker">
                        → {h.checkedBy} ({formatTime(h.checkedAt)})
                      </span>
                    </div>
                    <span className="expand-icon">
                      {expandedIds.has(h.id) ? '▲' : '▼'}
                    </span>
                  </div>
                  {expandedIds.has(h.id) && renderSections(h, false)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
