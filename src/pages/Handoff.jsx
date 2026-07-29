import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStoreById, detectStoreFromText } from '../data/stores';
import { useHandoffs, useNotices, useInventory, useOrders } from '../hooks/useFirestore';
import { parseHandoffText, LABEL_ICONS } from '../lib/parseHandoff';

// 중복 텍스트 감지: 일치하는 기존 인수인계 반환 (없으면 null)
function findDuplicate(newText, existingHandoffs) {
  if (!newText.trim() || existingHandoffs.length === 0) return null;
  const normalize = (t) => t.trim().replace(/\s+/g, ' ').toLowerCase();
  const newNorm = normalize(newText);
  if (newNorm.length < 10) return null;

  for (const h of existingHandoffs) {
    if (!h.rawText) continue;
    const existNorm = normalize(h.rawText);

    // 완전 일치
    if (newNorm === existNorm) return h;

    // 한쪽이 다른 쪽을 포함
    const shorter = newNorm.length <= existNorm.length ? newNorm : existNorm;
    const longer = newNorm.length <= existNorm.length ? existNorm : newNorm;
    if (shorter.length > 15 && longer.includes(shorter)) return h;

    // 단어 겹침 비율 (85% 이상이면 중복)
    const newWords = newNorm.split(/\s+/).filter((w) => w.length > 1);
    const existWords = new Set(existNorm.split(/\s+/).filter((w) => w.length > 1));
    if (newWords.length < 5) continue;
    const overlap = newWords.filter((w) => existWords.has(w)).length;
    if (overlap / newWords.length >= 0.85) return h;
  }
  return null;
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}


export default function Handoff() {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const store = getStoreById(storeId);
  const { handoffs, loading, addHandoff, updateHandoff, removeHandoff } =
    useHandoffs(storeId);
  const { notices, updateNotice } = useNotices(storeId);
  const { items: inventoryItems, addItem: addInventoryItem, updateItem: updateInventoryItem } = useInventory(storeId);
  const { addOrder } = useOrders(storeId);

  const [showForm, setShowForm] = useState(false);
  const [author, setAuthor] = useState('');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState(null);
  const [images, setImages] = useState([]);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [detectedStore, setDetectedStore] = useState(null);
  const [duplicateOf, setDuplicateOf] = useState(null);

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
    setDuplicateOf(findDuplicate(text, handoffs));
  };

  const handleParse = () => {
    if (!rawText.trim()) return;
    setPreview(parseHandoffText(rawText).sections);
  };

  const isOtherStore = detectedStore && detectedStore.id !== storeId;

  const handleSubmit = async () => {
    if (!rawText.trim()) return;
    const { parsed, sections, formatVersion } = parseHandoffText(rawText);
    if (sections.length === 0) return;
    const targetId = isOtherStore ? detectedStore.id : undefined;
    await addHandoff({
      author: author.trim() || '미입력',
      rawText,
      sections,
      parsed,
      formatVersion,
      images,
      checkedBy: null,
      checkedAt: null,
      duplicateOfDate: findDuplicate(rawText, handoffs)?.createdAt ?? null,
    }, targetId);

    // 주문 섹션이 있으면 주문내역에 자동 등록
    const orderSections = sections.filter((s) => s.label === '주문/발주' || s.label === '주문');
    for (const sec of orderSections) {
      const lines = sec.content.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        await addOrder({
          item: line.trim(),
          author: author.trim() || '미입력',
          status: 'pending',
        }, targetId);
      }
    }

    setAuthor('');
    setRawText('');
    setPreview(null);
    setImages([]);
    setDetectedStore(null);
    setDuplicateOf(null);
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

  // `롤휴지 4 (이전요청)` → { name: '롤휴지', qty: 4 }
  const splitItemLine = (line) => {
    const body = line.replace(/\(\s*이전\s*요청\s*\)/, '').trim();
    const m = body.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*\S*$/);
    if (!m) return { name: body, qty: 1 };
    return { name: m[1].trim() || body, qty: parseFloat(m[2]) };
  };

  /**
   * ■주문 체크 = '발주함' 표시일 뿐 재고는 변하지 않는다.
   * 재고가 늘어나는 시점은 물건이 실제로 도착한 ■입고 뿐이다.
   * (이전에는 주문 체크가 재고를 +1 해서 안 온 물건이 재고로 잡혔다)
   */
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

    const isArrival = sec.label === '입고' || sec.label === '도착';
    if (!isArrival) return;

    const { name, qty } = splitItemLine(lines[lineIdx]);
    const delta = wasChecked ? -qty : qty;
    const existing = inventoryItems.find((item) => item.name === name);
    if (existing) {
      await updateInventoryItem(existing.id, {
        stock: Math.max(0, (existing.stock ?? 0) + delta),
      });
    } else if (delta > 0) {
      await addInventoryItem({ name, stock: delta, opened: 0 });
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
        const ITEM_LABELS = ['주문/발주', '주문', '도착', '입고'];
        const isItemSection = ITEM_LABELS.includes(sec.label);
        const isArrivalSection = sec.label === '도착' || sec.label === '입고';
        const orderLines = isItemSection ? sec.content.split('\n').filter((l) => l.trim()) : [];
        const orderChecks = sec.orderChecks || orderLines.map(() => false);

        return (
          <div
            key={i}
            className={`handoff-section${urgent ? ' urgent' : ''}${sec.checked ? ' checked' : ''}`}
          >
            <div className="section-header">
              {editable && !isItemSection ? (
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
                  {!isItemSection && sec.checked ? '✓ ' : ''}{icon} {sec.label}
                  {urgent && <span className="urgent-tag">#긴급</span>}
                  {isItemSection && editable && (
                    <span className="order-check-hint">
                      {isArrivalSection ? ' — 체크 시 재고에 반영됩니다' : ' — 체크 = 발주함 (재고는 변하지 않습니다)'}
                    </span>
                  )}
                </span>
              )}
            </div>
            {isItemSection ? (
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
                      {checked && (
                        <span className="order-added-tag">
                          {isArrivalSection ? '재고 반영됨' : '발주함'}
                        </span>
                      )}
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
            <div key={h.id} className={`handoff-card pending-card${h.duplicateOfDate ? ' duplicate-card' : ''}`}>
              <div className="handoff-card-header">
                <div>
                  <span className="handoff-status pending">확인 대기</span>
                  <strong>{h.author}</strong>
                  <span className="handoff-time">
                    {formatTime(h.createdAt)}
                    {h.duplicateOfDate && (
                      <span className="duplicate-inline">({formatDate(h.duplicateOfDate)}, 중복)</span>
                    )}
                  </span>
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
                <div key={h.id} className={`handoff-card history-card${h.duplicateOfDate ? ' duplicate-card' : ''}`}>
                  <div className="handoff-card-header clickable" onClick={() => toggleExpanded(h.id)}>
                    <div>
                      <span className="handoff-status done">확인 완료</span>
                      <strong>{h.author}</strong>
                      <span className="handoff-time">
                        {formatTime(h.createdAt)}
                        {h.duplicateOfDate && (
                          <span className="duplicate-inline">({formatDate(h.duplicateOfDate)}, 중복)</span>
                        )}
                      </span>
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
