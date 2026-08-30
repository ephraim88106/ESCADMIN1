import { useNavigate } from 'react-router-dom';

function formatTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 새 인수인계가 올라오면 화면 구석에 뜨는 알림.
 * 누르면 그 지점 인수인계 화면으로 바로 간다 — 어느 지점인지 찾아 들어갈 필요가 없게.
 */
export default function HandoffToasts({ toasts, onDismiss }) {
  const navigate = useNavigate();

  if (toasts.length === 0) return null;

  return (
    <div className="handoff-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`handoff-toast${t.urgent ? ' urgent' : ''}`}>
          <button
            type="button"
            className="handoff-toast-body"
            onClick={() => {
              navigate(`/store/${t.storeId}/board/handoff`);
              onDismiss(t.id);
            }}
          >
            <span className="handoff-toast-title">
              📝 {t.storeName} 새 인수인계
              {t.urgent && <span className="urgent-tag">#긴급</span>}
            </span>
            <span className="handoff-toast-meta">
              {t.author} · {formatTime(t.at)}
            </span>
            <span className="handoff-toast-summary">{t.summary}</span>
          </button>
          <button
            type="button"
            className="handoff-toast-close"
            aria-label="닫기"
            onClick={() => onDismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
