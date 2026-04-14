import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStoreById, detectStoreFromText } from '../data/stores';
import { useHandoffs, useNotices, useInventory } from '../hooks/useFirestore';

// ===== 자동 파서 =====
function parseMessage(text) {
  const result = {
    고정석: [],
    특이사항: [],
    온도: [],
    빈자리: [],
    주문: [],
    도착: [],
    전달: [],
  };

  const lines = text.split('\n');
  let mode = null; // 현재 섹션 모드
  let tempZone = ''; // 온도 구역 (스터디, 카페존 등)

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { mode = mode; continue; } // 빈줄은 모드 유지

    // --- 매장명 헤더 (스킵) ---
    if (/^[■●▣]/.test(line) || /^\[.+점\]$/.test(line) || /^.+점\s*$/.test(line) && lines.indexOf(raw) === 0) {
      // 청소 일정 추출
      const cleanMatch = line.match(/\(([^)]*청소[^)]*)\)/);
      if (cleanMatch) {
        result.전달.push('청소 일정: ' + cleanMatch[1]);
      }
      // 매장 헤더의 부가정보 (비번 등)
      const extraMatch = line.match(/\(사무실[^)]+\)/);
      if (extraMatch) {
        result.전달.push(extraMatch[0]);
      }
      mode = null;
      tempZone = '';
      continue;
    }

    // --- 고정석/지정석 ---
    if (/고정석|지정석/.test(line)) {
      const seats = line.replace(/.*(?:고정석|지정석)[:\s]*/i, '').replace(/[\[\]()]/g, '').trim();
      if (seats) result.고정석.push(seats);
      // 같은 줄에 부가정보가 있으면 (물풀 등)
      mode = null;
      continue;
    }
    if (/^ㄴ\s*지정석/.test(line)) {
      const seats = line.replace(/ㄴ\s*지정석[:\s]*/i, '').trim();
      if (seats) result.고정석.push(seats);
      mode = null;
      continue;
    }
    // 매장 헤더 바로 다음 (숫자만 있는 괄호) - 고정석일 가능성
    if (/^\(\d[\d\s,]+\)$/.test(line) && result.고정석.length === 0 && result.온도.length === 0) {
      result.고정석.push(line.replace(/[()]/g, '').trim());
      mode = null;
      continue;
    }

    // --- 특이사항 (▶, ★, ☆, *, 고장, 안꺼짐, 오류, 교체, 금지 등) ---
    if (/^[▶★☆*]/.test(line)) {
      result.특이사항.push(line.replace(/^[▶★☆*]\s*/, ''));
      mode = null;
      continue;
    }
    if (/고장|안꺼짐|안켜짐|오류|교체\s*필요|초기화\s*금지|떨어진|더러움|악취|청소\s*完/.test(line) && !isTemperature(line)) {
      result.특이사항.push(line.replace(/^[ㄴ]\s*/, ''));
      mode = null;
      continue;
    }

    // --- 빈자리/빈좌석 섹션 ---
    if (/^[ㄴ]?\s*빈\s?(자리|좌석)/i.test(line)) {
      mode = 'empty';
      continue;
    }
    if (mode === 'empty') {
      result.빈자리.push(line);
      mode = null;
      continue;
    }

    // --- 주문/이전 주문 섹션 ---
    if (/^이전\s*주문$|^주문$/i.test(line)) {
      mode = 'order';
      continue;
    }
    if (mode === 'order') {
      if (isSectionHeader(line)) {
        mode = null;
        // fall through to process this line
      } else {
        result.주문.push(line);
        continue;
      }
    }

    // --- 도착 섹션 ---
    if (/^도착$/i.test(line)) {
      mode = 'arrive';
      continue;
    }
    if (mode === 'arrive') {
      if (isSectionHeader(line)) {
        mode = null;
        // fall through
      } else {
        result.도착.push(line);
        continue;
      }
    }

    // --- 온도 구역 헤더 ---
    if (/^스터디/i.test(line)) {
      tempZone = '스터디';
      mode = 'temp';
      continue;
    }
    if (/^카페(존|테리아)?$|^카페$/i.test(line) || /^\s*카페존/.test(line)) {
      tempZone = '카페존';
      mode = 'temp';
      continue;
    }

    // --- 온도 데이터 ---
    if (isTemperature(line)) {
      const prefix = tempZone ? `[${tempZone}] ` : '';
      result.온도.push(prefix + line.replace(/^[ㄴ]\s*/, ''));
      mode = 'temp';
      continue;
    }

    // --- 냉난방기 등 설비 확인 (온도 섹션 내) ---
    if (mode === 'temp' && /냉난방|가동/.test(line)) {
      result.온도.push(line.replace(/[\[\]]/g, ''));
      continue;
    }

    // --- 나머지 → 전달사항 ---
    if (line.length > 0) {
      // 물풀 관련 부가정보
      if (/^\[물풀|^\[공용/.test(line)) {
        result.전달.push(line.replace(/[\[\]]/g, ''));
      } else {
        result.전달.push(line);
      }
      mode = null;
    }
  }

  // 섹션 배열을 결과로 변환
  const sections = [];
  if (result.고정석.length > 0) {
    sections.push({ label: '고정석', content: result.고정석.join('\n'), checked: false });
  }
  if (result.특이사항.length > 0) {
    sections.push({ label: '특이사항', content: result.특이사항.join('\n'), checked: false });
  }
  if (result.온도.length > 0) {
    sections.push({ label: '온도체크', content: result.온도.join('\n'), checked: false });
  }
  if (result.빈자리.length > 0) {
    sections.push({ label: '빈자리', content: result.빈자리.join('\n'), checked: false });
  }
  if (result.주문.length > 0) {
    const content = result.주문.join('\n');
    sections.push({ label: '주문/발주', content, checked: false });
  }
  if (result.도착.length > 0) {
    sections.push({ label: '도착', content: result.도착.join('\n'), checked: false });
  }
  if (result.전달.length > 0) {
    sections.push({ label: '전달사항', content: result.전달.join('\n'), checked: false });
  }

  return sections;
}

// 온도 데이터인지 판별
function isTemperature(line) {
  const cleaned = line.replace(/^[ㄴ]\s*/, '').trim();
  // "28 : 24.9" / "05 : 23.1" 패턴
  if (/^\d+\s*:\s*\d+/.test(cleaned)) return true;
  // "(11번) 22.7" / "(35번): 24.8 / 32%" 패턴
  if (/^\(?\d+번\)?\s*[:)]\s*\d+/.test(cleaned)) return true;
  // "78자리 25.2" / "08자리 25" 패턴
  if (/\d+\s*자리\s+\d+/.test(cleaned)) return true;
  // "44: 25" / "55: 24.5" 패턴
  if (/^\d+\s*:\s*\d+/.test(cleaned)) return true;
  // "카페테리아 23.4" / "담요위 24.2" / "휴게실 23.0" 등 장소 + 온도
  if (/(?:카페테리아|담요|휴게실|냉장고|스터디룸|창가|신발장|자리|번\s).*\d{2,}/.test(cleaned)) return true;
  // "24번 23.8 / 71%" 패턴
  if (/^\d+번\s+\d{2}/.test(cleaned)) return true;
  // "(21번) 25" 패턴
  if (/^\(\d+번\)\s*\d+/.test(cleaned)) return true;
  return false;
}

// 다른 섹션 헤더인지 확인
function isSectionHeader(line) {
  return /^[ㄴ]?\s*빈\s?(자리|좌석)|^도착$|^주문$|^이전\s*주문$|^스터디|^카페/i.test(line);
}

function formatTime(ts) {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

const LABEL_ICONS = {
  '고정석': '💺',
  '특이사항': '⚠️',
  '온도체크': '🌡️',
  '빈자리': '🪑',
  '주문/발주': '📦',
  '도착': '🚚',
  '전달사항': '📝',
};

export default function Handoff() {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const store = getStoreById(storeId);
  const { handoffs, loading, addHandoff, updateHandoff, removeHandoff } =
    useHandoffs(storeId);
  const { notices, updateNotice } = useNotices(storeId);
  const { items: inventoryItems, addItem: addInventoryItem, updateItem: updateInventoryItem } = useInventory(storeId);

  const [showForm, setShowForm] = useState(false);
  const [author, setAuthor] = useState('');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState(null);
  const [images, setImages] = useState([]);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [detectedStore, setDetectedStore] = useState(null);

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  const pending = handoffs.filter((h) => !h.checkedBy);
  const history = handoffs.filter((h) => h.checkedBy);

  // 이 매장에 해당하는 미확인 공지
  const uncheckedNotices = notices.filter(
    (n) => !(n.checkedStores || []).includes(storeId)
  );

  const handleNoticeCheck = async (notice) => {
    const already = notice.checkedStores || [];
    if (already.includes(storeId)) return;
    await updateNotice(notice.id, {
      checkedStores: [...already, storeId],
    });
  };

  const handleTextChange = (text) => {
    setRawText(text);
    setPreview(null);
    const found = detectStoreFromText(text);
    setDetectedStore(found);
  };

  const handleParse = () => {
    if (!rawText.trim()) return;
    setPreview(parseMessage(rawText));
  };

  const targetStore = detectedStore || store;
  const isOtherStore = detectedStore && detectedStore.id !== storeId;

  const handleSubmit = async () => {
    if (!rawText.trim()) return;
    const sections = preview || parseMessage(rawText);
    if (sections.length === 0) return;
    const targetId = isOtherStore ? detectedStore.id : undefined;
    await addHandoff({
      author: author.trim() || '미입력',
      rawText,
      sections,
      images,
      checkedBy: null,
      checkedAt: null,
    }, targetId);
    setAuthor('');
    setRawText('');
    setPreview(null);
    setImages([]);
    setDetectedStore(null);
    setShowForm(false);
    if (isOtherStore) {
      navigate(`/store/${detectedStore.id}/board/handoff`);
    }
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 800;
          let w = img.width;
          let h = img.height;
          if (w > maxW) { h = (h * maxW) / w; w = maxW; }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          setImages((prev) => [...prev, canvas.toDataURL('image/jpeg', 0.7)]);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (idx) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleClearHistory = async () => {
    if (!window.confirm('확인 완료된 기록을 모두 삭제하시겠습니까?')) return;
    for (const h of history) {
      await removeHandoff(h.id);
    }
  };

  const handleToggleCheck = async (handoff, sectionIdx) => {
    const newSections = handoff.sections.map((sec, i) =>
      i === sectionIdx ? { ...sec, checked: !sec.checked } : sec
    );
    await updateHandoff(handoff.id, { sections: newSections });
  };

  const handleOrderLineCheck = async (handoff, sectionIdx, lineIdx) => {
    const sec = handoff.sections[sectionIdx];
    const lines = sec.content.split('\n').filter((l) => l.trim());
    const orderChecks = sec.orderChecks ? [...sec.orderChecks] : lines.map(() => false);
    const wasChecked = orderChecks[lineIdx];
    orderChecks[lineIdx] = !wasChecked;

    const allChecked = orderChecks.every(Boolean);
    const newSections = handoff.sections.map((s, i) =>
      i === sectionIdx ? { ...s, orderChecks, checked: allChecked } : s
    );
    await updateHandoff(handoff.id, { sections: newSections });

    // 체크 시 재고에 추가
    if (!wasChecked) {
      const lineName = lines[lineIdx].trim();
      // 품명 추출 (숫자/수량 제거)
      const itemName = lineName
        .replace(/\d+\s*(박스|팩|개|봉|묶음|세트|병|캔|롤|ea|EA|장)/g, '')
        .replace(/[xX×]\s*\d+/g, '')
        .replace(/\s+/g, ' ')
        .trim() || lineName;

      const existing = inventoryItems.find(
        (item) => item.name === itemName || item.name === lineName
      );
      if (existing) {
        await updateInventoryItem(existing.id, { stock: (existing.stock ?? 0) + 1 });
      } else {
        await addInventoryItem({ name: itemName, stock: 1, opened: 0 });
      }
    }
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

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('복사되었습니다');
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('복사되었습니다');
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
        const urgent = /#긴급|#급/.test(sec.content);
        const icon = LABEL_ICONS[sec.label] || '📋';
        const isOrder = sec.label === '주문/발주';
        const orderLines = isOrder ? sec.content.split('\n').filter((l) => l.trim()) : [];
        const orderChecks = sec.orderChecks || orderLines.map(() => false);

        return (
          <div
            key={i}
            className={`handoff-section${urgent ? ' urgent' : ''}${sec.checked ? ' checked' : ''}`}
          >
            <div className="section-header">
              {editable && !isOrder ? (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={sec.checked}
                    onChange={() => handleToggleCheck(handoff, i)}
                  />
                  <span className="section-label">{icon} {sec.label}</span>
                  {urgent && <span className="urgent-tag">#긴급</span>}
                </label>
              ) : (
                <span className="section-label">
                  {!isOrder && sec.checked ? '✓ ' : ''}{icon} {sec.label}
                  {urgent && <span className="urgent-tag">#긴급</span>}
                  {isOrder && editable && (
                    <span className="order-check-hint"> — 체크 시 재고에 추가됩니다</span>
                  )}
                </span>
              )}
            </div>
            {isOrder ? (
              <div className="order-lines">
                {orderLines.map((line, li) => {
                  const checked = !!orderChecks[li];
                  return (
                    <label
                      key={li}
                      className={`order-line${checked ? ' checked' : ''}`}
                    >
                      {editable ? (
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleOrderLineCheck(handoff, i, li)}
                        />
                      ) : (
                        <span className="order-line-icon">{checked ? '✓' : '○'}</span>
                      )}
                      <span className={checked ? 'line-through' : ''}>{line.trim()}</span>
                      {checked && <span className="order-added-tag">재고 추가됨</span>}
                    </label>
                  );
                })}
              </div>
            ) : (
              <pre className="section-content">{sec.content}</pre>
            )}
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

      {/* 미확인 공지 알림 */}
      {uncheckedNotices.length > 0 && (
        <div className="notice-alert">
          <div className="notice-alert-title">📢 공지사항 ({uncheckedNotices.length}건)</div>
          {uncheckedNotices.map((n) => (
            <div key={n.id} className="notice-alert-item">
              <div className="notice-alert-content">
                <strong>{n.title || '공지사항'}</strong>
                <pre className="section-content">{n.content}</pre>
                {n.images?.length > 0 && (
                  <div className="notice-images">
                    {n.images.map((src, i) => (
                      <img key={i} src={src} alt="" className="notice-image" />
                    ))}
                  </div>
                )}
                <span className="notice-alert-meta">{n.author} · {formatTime(n.createdAt)}</span>
              </div>
              <button className="btn-sm btn-check" onClick={() => handleNoticeCheck(n)}>
                확인
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="handoff-form">
          <label>
            작성자
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="이름 (선택)"
            />
          </label>
          <label>
            메시지 붙여넣기
            <textarea
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="카톡/문자 내용을 그대로 붙여넣으세요"
              rows={10}
            />
          </label>
          {detectedStore && (
            <div className={`detected-store-badge${isOtherStore ? ' other' : ''}`}>
              📍 감지된 지점: <strong>{detectedStore.name}</strong>
              {isOtherStore && <span> (현재: {store.name} → {detectedStore.name}에 등록됩니다)</span>}
            </div>
          )}
          <label>
            사진 첨부
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="file-input"
            />
          </label>
          {images.length > 0 && (
            <div className="image-preview-list">
              {images.map((src, i) => (
                <div key={i} className="image-preview-item">
                  <img src={src} alt="" />
                  <button type="button" className="image-remove" onClick={() => removeImage(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
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
              <div className="preview-title">분류 결과 ({preview.length}개 항목)</div>
              {preview.map((sec, i) => {
                const icon = LABEL_ICONS[sec.label] || '📋';
                return (
                  <div key={i} className={`handoff-section${sec.content.includes('#긴급') || sec.content.includes('#급') ? ' urgent' : ''}`}>
                    <div className="section-label">{icon} {sec.label}</div>
                    <pre className="section-content">{sec.content}</pre>
                  </div>
                );
              })}
              <button type="button" className="btn-primary" onClick={handleSubmit}>
                이대로 등록
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
              {h.rawText && (
                <div className="raw-text-box">
                  <div className="raw-text-header">
                    <span className="raw-text-label">원본 메시지</span>
                    <button className="btn-sm btn-copy" onClick={() => handleCopy(h.rawText)}>복사</button>
                  </div>
                  <pre className="raw-text-content">{h.rawText}</pre>
                </div>
              )}
              {renderSections(h, true)}
              {h.images?.length > 0 && (
                <div className="notice-images">
                  {h.images.map((src, i) => (
                    <img key={i} src={src} alt="" className="notice-image" />
                  ))}
                </div>
              )}
              <div className="check-progress">
                {h.sections.filter((s) => s.checked).length} / {h.sections.length} 확인됨
              </div>
            </div>
          ))}

          {history.length > 0 && (
            <div className="handoff-history">
              <div className="history-header">
                <h3>이전 기록</h3>
                <button className="btn-sm btn-danger" onClick={handleClearHistory}>
                  전체 삭제
                </button>
              </div>
              {history.map((h) => (
                <div key={h.id} className="handoff-card history-card">
                  <div className="handoff-card-header clickable" onClick={() => toggleExpanded(h.id)}>
                    <div>
                      <span className="handoff-status done">확인 완료</span>
                      <strong>{h.author}</strong>
                      <span className="handoff-time">{formatTime(h.createdAt)}</span>
                      <span className="handoff-checker">→ {h.checkedBy}</span>
                    </div>
                    <div className="history-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn-sm btn-danger" onClick={() => handleDelete(h)}>삭제</button>
                      <span className="expand-icon" onClick={() => toggleExpanded(h.id)}>{expandedIds.has(h.id) ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {expandedIds.has(h.id) && (
                    <>
                      {h.rawText && (
                        <div className="raw-text-box">
                          <div className="raw-text-header">
                            <span className="raw-text-label">원본 메시지</span>
                            <button className="btn-sm btn-copy" onClick={(e) => { e.stopPropagation(); handleCopy(h.rawText); }}>복사</button>
                          </div>
                          <pre className="raw-text-content">{h.rawText}</pre>
                        </div>
                      )}
                      {renderSections(h, false)}
                      {h.images?.length > 0 && (
                        <div className="notice-images">
                          {h.images.map((src, i) => (
                            <img key={i} src={src} alt="" className="notice-image" />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
