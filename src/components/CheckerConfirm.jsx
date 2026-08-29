import { useState } from 'react';

/**
 * 처리 전에 담당자 이름을 받는 확인창.
 * window.confirm 은 눌렀다는 사실만 남기고 누가 눌렀는지는 못 남긴다 — 그래서 직접 만든다.
 *
 * request: { title, target, detail, run(name) }
 * 여는 쪽에서 request.key 를 key 로 넘겨 창이 바뀔 때 입력값이 초기화되게 한다.
 */
export default function CheckerConfirm({ request, defaultName, onCancel, onConfirm }) {
  const [name, setName] = useState(defaultName || '');
  const [busy, setBusy] = useState(false);
  // 저장이 막혔는데 버튼만 다시 살아나면 "눌렀는데 안 되네"가 된다
  const [error, setError] = useState(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmed);
    } catch (e) {
      setError(e?.message || '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay checker-confirm-overlay" onClick={onCancel}>
      <div className="modal checker-confirm" onClick={(e) => e.stopPropagation()}>
        <h3>{request.title}</h3>
        <p className="checker-confirm-target">{request.target}</p>
        <p className="checker-confirm-detail">{request.detail}</p>
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
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? '처리 중...' : '담당자 확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
