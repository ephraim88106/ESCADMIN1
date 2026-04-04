import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { STORES, getStoreById } from '../data/stores';
import { useNotices } from '../hooks/useFirestore';

// 텍스트에서 매장명 자동 감지
function detectStores(text) {
  const found = [];
  for (const store of STORES) {
    // "방화", "방화점", "박촌", "박촌점" 등 매칭
    const shortName = store.name.replace('점', '');
    if (text.includes(shortName) || text.includes(store.name)) {
      found.push(store.id);
    }
  }
  return found;
}

function formatTime(ts) {
  const d = new Date(ts);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

export default function Notices() {
  const { storeId } = useParams();
  const store = getStoreById(storeId);
  const { notices, loading, addNotice, updateNotice, removeNotice } = useNotices(storeId);

  const [showForm, setShowForm] = useState(false);
  const [author, setAuthor] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [pinned, setPinned] = useState(false);
  const [detectedStores, setDetectedStores] = useState([]);

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  const handleTargetChange = (value) => {
    setTargetInput(value);
    setDetectedStores(detectStores(value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    // 대상 매장: 입력한 텍스트에서 감지 또는 전체
    let targets = detectStores(targetInput);
    if (targets.length === 0) {
      targets = STORES.map((s) => s.id); // 매장 지정 안 하면 전체
    }

    await addNotice({
      author: author.trim() || '관리자',
      title: title.trim() || '공지사항',
      content: content.trim(),
      targetStores: targets,
      checkedStores: [], // 확인한 매장 목록
      pinned,
    });
    setAuthor('');
    setTitle('');
    setContent('');
    setTargetInput('');
    setDetectedStores([]);
    setPinned(false);
    setShowForm(false);
  };

  const handleCheck = async (notice) => {
    const already = notice.checkedStores || [];
    if (already.includes(storeId)) return;
    await updateNotice(notice.id, {
      checkedStores: [...already, storeId],
    });
  };

  const handleUncheck = async (notice) => {
    const already = notice.checkedStores || [];
    await updateNotice(notice.id, {
      checkedStores: already.filter((id) => id !== storeId),
    });
  };

  const handleDelete = async (notice) => {
    if (window.confirm('이 공지를 삭제하시겠습니까?')) {
      await removeNotice(notice.id);
    }
  };

  const isChecked = (notice) => (notice.checkedStores || []).includes(storeId);

  // 고정 → 미확인 → 확인 순 정렬
  const sorted = [...notices].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const aChecked = isChecked(a);
    const bChecked = isChecked(b);
    if (!aChecked && bChecked) return -1;
    if (aChecked && !bChecked) return 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="notices-page">
      <div className="page-header">
        <h2>공지사항</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '취소' : '+ 공지 등록'}
        </button>
      </div>

      {showForm && (
        <form className="notice-form" onSubmit={handleSubmit}>
          <label>
            작성자
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="이름 (미입력시 '관리자')"
            />
          </label>
          <label>
            대상 매장
            <input
              type="text"
              value={targetInput}
              onChange={(e) => handleTargetChange(e.target.value)}
              placeholder="예: 방화, 박촌 (미입력시 전체)"
            />
            {detectedStores.length > 0 && (
              <div className="detected-stores">
                {detectedStores.map((id) => (
                  <span key={id} className="store-chip">
                    {getStoreById(id)?.name}
                  </span>
                ))}
              </div>
            )}
            {targetInput && detectedStores.length === 0 && (
              <div className="detected-stores">
                <span className="store-chip all">전체 매장</span>
              </div>
            )}
          </label>
          <label>
            제목
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목 (선택)"
            />
          </label>
          <label>
            내용
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="공지 내용을 입력하세요"
              rows={4}
              required
            />
          </label>
          <label className="pin-label">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            상단 고정
          </label>
          <button type="submit" className="btn-primary">공지 등록</button>
        </form>
      )}

      {loading ? (
        <p className="loading">불러오는 중...</p>
      ) : sorted.length === 0 && !showForm ? (
        <p className="empty-state">등록된 공지가 없습니다.</p>
      ) : (
        <div className="notice-list">
          {sorted.map((n) => {
            const checked = isChecked(n);
            const targetNames = (n.targetStores || [])
              .map((id) => getStoreById(id)?.name)
              .filter(Boolean);
            const checkedCount = (n.checkedStores || []).length;
            const totalCount = (n.targetStores || []).length;

            return (
              <div key={n.id} className={`notice-card${n.pinned ? ' pinned' : ''}${checked ? ' notice-checked' : ''}`}>
                <div className="notice-header">
                  <div className="notice-title-row">
                    {n.pinned && <span className="pin-badge">고정</span>}
                    {!checked && <span className="new-badge">NEW</span>}
                    <strong className="notice-title">{n.title || '공지사항'}</strong>
                  </div>
                  <div className="notice-actions">
                    {checked ? (
                      <button className="btn-sm btn-checked" onClick={() => handleUncheck(n)}>
                        ✓ 확인됨
                      </button>
                    ) : (
                      <button className="btn-sm btn-check" onClick={() => handleCheck(n)}>
                        확인
                      </button>
                    )}
                    <button className="btn-sm btn-danger" onClick={() => handleDelete(n)}>
                      삭제
                    </button>
                  </div>
                </div>
                <pre className="notice-content">{n.content}</pre>
                <div className="notice-meta">
                  <span>{n.author} · {formatTime(n.createdAt)}</span>
                  <span className="notice-targets">
                    {totalCount === STORES.length
                      ? '전체 매장'
                      : targetNames.join(', ')}
                    {' · '}{checkedCount}/{totalCount} 확인
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
