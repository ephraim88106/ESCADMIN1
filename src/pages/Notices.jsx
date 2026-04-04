import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreById } from '../data/stores';
import { useNotices } from '../hooks/useFirestore';

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
  const { notices, loading, addNotice, removeNotice } = useNotices(storeId);

  const [showForm, setShowForm] = useState(false);
  const [author, setAuthor] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);

  if (!store) return <p>지점을 찾을 수 없습니다.</p>;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    await addNotice({
      author: author.trim() || '관리자',
      title: title.trim(),
      content: content.trim(),
      pinned,
    });
    setAuthor('');
    setTitle('');
    setContent('');
    setPinned(false);
    setShowForm(false);
  };

  const handleDelete = async (notice) => {
    if (window.confirm('이 공지를 삭제하시겠습니까?')) {
      await removeNotice(notice.id);
    }
  };

  // 고정 공지를 위로
  const sorted = [...notices].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
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
            제목
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목"
              required
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
          {sorted.map((n) => (
            <div key={n.id} className={`notice-card${n.pinned ? ' pinned' : ''}`}>
              <div className="notice-header">
                <div className="notice-title-row">
                  {n.pinned && <span className="pin-badge">고정</span>}
                  <strong className="notice-title">{n.title}</strong>
                </div>
                <button className="btn-sm btn-danger" onClick={() => handleDelete(n)}>
                  삭제
                </button>
              </div>
              <pre className="notice-content">{n.content}</pre>
              <div className="notice-meta">
                {n.author} · {formatTime(n.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
