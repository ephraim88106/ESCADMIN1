import { useState } from 'react';
import { STORES } from '../data/stores';
import { ALL_STORES } from '../lib/webPush';

/**
 * 휴대폰 알림(웹 푸시) 설정창.
 *
 * 지점 근무자가 17개 지점 알림을 다 받으면 못 쓴다. 그래서 받을 지점을 고르게 한다.
 * 본사는 '전 지점', 근무자는 자기 지점만.
 */
export default function PushSubscribeModal({
  subscribed,
  stores,
  busy,
  error,
  onEnable,
  onDisable,
  onClose,
}) {
  const isAll = stores.includes(ALL_STORES);
  const [mode, setMode] = useState(isAll ? 'all' : 'pick');
  const [picked, setPicked] = useState(() => new Set(isAll ? [] : stores));

  const toggleStore = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selection = mode === 'all' ? [ALL_STORES] : [...picked];
  const canSubmit = !busy && selection.length > 0;

  return (
    <div className="modal-overlay checker-confirm-overlay" onClick={onClose}>
      <div className="modal push-modal" onClick={(e) => e.stopPropagation()}>
        <h3>📱 휴대폰 알림</h3>
        <p className="push-modal-lead">
          앱을 껐어도 새 인수인계가 올라오면 알림이 옵니다.
        </p>

        <div className="push-mode">
          <label className="push-mode-option">
            <input
              type="radio"
              name="push-mode"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
            />
            <span>전 지점 — 본사·관리자용</span>
          </label>
          <label className="push-mode-option">
            <input
              type="radio"
              name="push-mode"
              checked={mode === 'pick'}
              onChange={() => setMode('pick')}
            />
            <span>고른 지점만 — 근무자용</span>
          </label>
        </div>

        {mode === 'pick' && (
          <div className="push-store-grid">
            {STORES.map((store) => (
              <label key={store.id} className="push-store-item">
                <input
                  type="checkbox"
                  checked={picked.has(store.id)}
                  onChange={() => toggleStore(store.id)}
                />
                <span>{store.name}</span>
              </label>
            ))}
          </div>
        )}

        {mode === 'pick' && picked.size === 0 && (
          <p className="push-modal-hint">받을 지점을 하나 이상 골라주세요.</p>
        )}

        {error && <p className="delete-error">⚠️ {error}</p>}

        <div className="modal-actions">
          {subscribed && (
            <button className="btn-secondary btn-danger" onClick={onDisable} disabled={busy}>
              알림 끄기
            </button>
          )}
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button
            className="btn-primary"
            onClick={() => onEnable(selection)}
            disabled={!canSubmit}
          >
            {busy ? '처리 중...' : subscribed ? '이대로 저장' : '알림 받기'}
          </button>
        </div>
      </div>
    </div>
  );
}
