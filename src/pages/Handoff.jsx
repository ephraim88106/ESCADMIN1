import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { useHandoffs } from '../hooks/useFirestore';

// 메시지를 카테고리별로 자동 파싱
function parseMessage(text) {
  const sections = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let current = null;

  for (const line of lines) {
    // ■매장명(청소일정) — 청소 일정
    if (line.startsWith('■')) {
      const cleanMatch = line.match(/\(([^)]*청소[^)]*)\)/);
      if (cleanMatch) {
        sections.push({
          label: '청소 일정',
          content: cleanMatch[1],
          checked: false,
        });
      }
      // 매장명 헤더는 별도 저장하지 않음
      current = null;
      continue;
    }

    // [고정석 ...] — 고정석
    if (line.startsWith('[') && line.includes('고정석')) {
      const seats = line.replace(/[\[\]]/g, '').replace('고정석', '').trim();
      sections.push({
        label: '고정석',
        content: seats,
        checked: false,
      });
      current = null;
      continue;
    }

    // "빈자리" 키워드
    if (/^빈\s?자리$/i.test(line)) {
      current = { label: '빈자리', lines: [] };
      continue;
    }
    if (current?.label === '빈자리') {
      current.lines.push(line);
      sections.push({
        label: '빈자리',
        content: current.lines.join('\n'),
        checked: false,
      });
      current = null;
      continue;
    }

    // "주문" 키워드
    if (/^주문$/i.test(line)) {
      current = { label: '주문/발주', lines: [] };
      continue;
    }
    if (current?.label === '주문/발주') {
      current.lines.push(line);
      continue;
    }

    // 온도 패턴: 숫자.숫자 가 포함된 줄
    if (/\d+\.\d/.test(line) && /번|카페|냉장/.test(line)) {
      // 온도체크 섹션에 모아서 추가
      const existing = sections.find((s) => s.label === '온도체크');
      if (existing) {
        existing.content += '\n' + line;
      } else {
        sections.push({
          label: '온도체크',
          content: line,
          checked: false,
        });
      }
      continue;
    }

    // 그 외 — 기타 메모
    const memo = sections.find((s) => s.label === '기타');
    if (memo) {
      memo.content += '\n' + line;
    } else {
      sections.push({
        label: '기타',
        content: line,
        checked: false,
      });
    }
  }

  // 주문/발주 마무리 (current가 남아있을 때)
  if (current?.label === '주문/발주' && current.lines.length > 0) {
    sections.push({
      label: '주문/발주',
      content: current.lines.join('\n'),
      checked: false,
    });
  }

  return sections;
}

function formatTime(ts) {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

const SAMPLE = `■화곡점(월 수 금 일 청소)
[고정석 11, 12, 14, 15, 17, 18, 19, 46, 47, 48]

카페테리아(냉장고위) 25.3
24번 23.5
37-38번 23.9
04번 24.3

빈자리
X

주문
주방세제 #긴급 (재고0, 개봉0)`;

export default function Handoff() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);
  const { handoffs, loading, addHandoff, updateHandoff, removeHandoff } =
    useHandoffs(storeId);

  const [showForm, setShowForm] = useState(false);
  const [author, setAuthor] = useState('');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  const pending = handoffs.filter((h) => !h.checkedBy);
  const history = handoffs.filter((h) => h.checkedBy);

  const handleParse = () => {
    if (!rawText.trim()) return;
    const sections = parseMessage(rawText);
    setPreview(sections);
  };

  const handleSubmit = async () => {
    if (!rawText.trim()) return;
    const sections = preview || parseMessage(rawText);
    if (sections.length === 0) return;
    await addHandoff({
      author: author.trim() || '미입력',
      rawText,
      sections,
      checkedBy: null,
      checkedAt: null,
    });
    setAuthor('');
    setRawText('');
    setPreview(null);
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
    if (window.confirm('삭제하시겠습니까?')) {
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
        const urgent = sec.content.includes('#긴급');
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
        <h2>인수인계</h2>
        <button
          className="btn-primary"
          onClick={() => { setShowForm(!showForm); setPreview(null); }}
        >
          {showForm ? '취소' : '+ 새 인수인계'}
        </button>
      </div>

      {showForm && (
        <div className="handoff-form">
          <label>
            작성자
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="이름"
            />
          </label>
          <label>
            메시지 붙여넣기
            <textarea
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setPreview(null); }}
              placeholder={SAMPLE}
              rows={8}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={handleParse}>
              미리보기
            </button>
            <button type="button" className="btn-primary" onClick={handleSubmit}>
              바로 등록
            </button>
          </div>

          {preview && (
            <div className="parse-preview">
              <div className="preview-title">파싱 결과</div>
              {preview.map((sec, i) => (
                <div key={i} className={`handoff-section${sec.content.includes('#긴급') ? ' urgent' : ''}`}>
                  <div className="section-label">{sec.label}</div>
                  <pre className="section-content">{sec.content}</pre>
                </div>
              ))}
              <button type="button" className="btn-primary" onClick={handleSubmit}>
                인수인계 등록
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : pending.length === 0 && history.length === 0 && !showForm ? (
        <p className="empty-state">인수인계 기록이 없습니다.</p>
      ) : (
        <>
          {pending.map((h) => (
            <div key={h.id} className="handoff-card pending-card">
              <div className="handoff-card-header">
                <div>
                  <span className="handoff-status pending">확인 대기</span>
                  <strong>{h.author}</strong>
                  <span className="handoff-time">{formatTime(h.createdAt)}</span>
                </div>
                <div className="handoff-card-actions">
                  <button className="btn-primary btn-confirm" onClick={() => handleConfirmAll(h)}>
                    확인 완료
                  </button>
                  <button className="btn-sm btn-danger" onClick={() => handleDelete(h)}>
                    삭제
                  </button>
                </div>
              </div>
              {renderSections(h, true)}
              <div className="check-progress">
                {h.sections.filter((s) => s.checked).length} / {h.sections.length} 확인됨
              </div>
            </div>
          ))}

          {history.length > 0 && (
            <div className="handoff-history">
              <h3>이전 기록</h3>
              {history.map((h) => (
                <div key={h.id} className="handoff-card history-card">
                  <div className="handoff-card-header clickable" onClick={() => toggleExpanded(h.id)}>
                    <div>
                      <span className="handoff-status done">확인 완료</span>
                      <strong>{h.author}</strong>
                      <span className="handoff-time">{formatTime(h.createdAt)}</span>
                      <span className="handoff-checker">→ {h.checkedBy}</span>
                    </div>
                    <span className="expand-icon">{expandedIds.has(h.id) ? '▲' : '▼'}</span>
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
