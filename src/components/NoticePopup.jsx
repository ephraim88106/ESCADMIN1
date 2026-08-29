import { useState } from 'react';
import { useNotices } from '../hooks/useFirestore';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 보고를 등록한 직후 그 지점의 미확인 공지를 띄운다.
 *
 * 근무자가 공지 탭에 직접 들어가길 기다리면 공지는 안 읽힌다.
 * 붙여넣기는 근무자가 앱에 확실히 들어오는 순간이라, 여기에 붙여야 읽힌다.
 * '나중에'로 닫으면 기록을 남기지 않으므로 다음 붙여넣기 때 또 뜬다.
 *
 * 미확인 공지가 없으면 아무것도 그리지 않는다.
 */
export default function NoticePopup({ storeId, storeName, headline, onClose }) {
  const { notices, loading, checkNotice } = useNotices(storeId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pending = notices.filter((n) => !(n.checkedStores || []).includes(storeId));
  if (loading || pending.length === 0) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const n of pending) await checkNotice(n, storeId, trimmed);
      onClose();
    } catch (e) {
      setError(e?.message || '확인 처리를 하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay checker-confirm-overlay" onClick={onClose}>
      <div className="modal notice-popup" onClick={(e) => e.stopPropagation()}>
        <h3>📢 {storeName} 공지 {pending.length}건</h3>
        {headline && <p className="notice-popup-headline">{headline}</p>}

        <div className="notice-popup-list">
          {pending.map((n) => (
            <div key={n.id} className="notice-popup-item">
              <div className="notice-popup-title">
                {n.pinned && <span className="notice-pin">📌</span>}
                {n.title}
              </div>
              <p className="notice-popup-content">{n.content}</p>
              {(n.images || []).map((src, i) => (
                <img key={i} src={src} alt="" className="notice-popup-image" />
              ))}
              <div className="notice-popup-meta">
                {n.author} · {formatTime(n.createdAt)}
              </div>
            </div>
          ))}
        </div>

        <label>
          담당자
          <input
            type="text"
            value={name}
            placeholder="이름을 적어주세요"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </label>
        {error && <p className="delete-error">⚠️ {error}</p>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            나중에
          </button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? '처리 중...' : '확인했습니다'}
          </button>
        </div>
      </div>
    </div>
  );
}
