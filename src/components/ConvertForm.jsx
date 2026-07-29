import { useEffect, useMemo, useState } from 'react';
import { STORES, getStoreById } from '../data/stores';
import { V3_FIELDS, legacyToDraft, draftToV3Text } from '../lib/legacyToV3';
import { parseV3, toSections } from '../lib/parseV3';

/**
 * 구양식을 v3 틀로 옮겨 담는 편집 폼.
 * 저장은 항상 조립된 v3 텍스트를 parseV3 로 다시 읽어서 한다 —
 * 붙여넣기든 변환이든 저장 경로가 하나여야 데이터가 갈라지지 않는다.
 */
export default function ConvertForm({ rawText, upsertHandoff, findSameDay, onDone }) {
  const draft = useMemo(() => legacyToDraft(rawText), [rawText]);
  const [storeId, setStoreId] = useState(draft.storeId || '');
  const [dateText, setDateText] = useState(draft.dateText);
  const [fields, setFields] = useState(draft.fields);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setStoreId(draft.storeId || '');
    setDateText(draft.dateText);
    setFields(draft.fields);
    setCopied(false);
  }, [draft]);

  const store = getStoreById(storeId);
  const v3Text = useMemo(
    () => (store ? draftToV3Text(store.name, dateText, fields) : ''),
    [store, dateText, fields]
  );

  const parsed = useMemo(() => (v3Text ? parseV3(v3Text) : null), [v3Text]);
  const sameDay = store && parsed ? findSameDay?.(store.id, parsed.dateKey) : null;
  // 주문 줄에 (재고 N) 이 하나도 없으면 재고 화면에 안 잡힌다
  const orderText = (fields.주문 || '').trim();
  const stockEmpty = !!orderText && !/\(\s*재고/.test(orderText);

  const setField = (key, value) => setFields((p) => ({ ...p, [key]: value }));

  const handleCopy = () => {
    navigator.clipboard?.writeText(v3Text).catch(() => {});
    setCopied(true);
  };

  const handleSubmit = async () => {
    if (!store || saving) return;
    if (sameDay && !window.confirm(`${store.name} ${dateText} 보고가 이미 있습니다.\n덮어쓸까요?`)) {
      return;
    }
    setSaving(true);
    try {
      await upsertHandoff(store.id, {
        author: '미입력',
        rawText: v3Text,
        originalText: rawText, // 변환 전 원본도 남긴다
        converted: true,
        sections: toSections(parsed),
        parsed,
        formatVersion: 'v3',
        images: [],
        checkedBy: null,
        checkedAt: null,
      });
      onDone?.({ storeName: store.name, dateText, mode: sameDay ? 'updated' : 'created' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="convert-form">
      <div className="convert-banner">
        <strong>구양식으로 보인다 → v3 틀로 옮겨 담았습니다.</strong>
        <span>확인·수정 후 등록하면 재고와 미해결 추적에 잡힙니다.</span>
      </div>

      {draft.notes.map((n, i) => (
        <div key={i} className="convert-note">{n}</div>
      ))}

      <div className="convert-head">
        <label>
          매장
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">선택...</option>
            {STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          날짜
          <input value={dateText} onChange={(e) => setDateText(e.target.value)} placeholder="7/29(수)" />
        </label>
      </div>

      {!store && <div className="convert-warn">매장을 골라야 등록할 수 있습니다.</div>}
      {sameDay && <div className="convert-warn">같은 날 보고가 이미 있습니다 — 등록하면 덮어씁니다.</div>}

      <div className="convert-fields">
        {V3_FIELDS.map((f) => {
          const empty = !(fields[f.key] || '').trim();
          const spotlight = f.spotlight && empty;
          return (
            <div key={f.key} className={`convert-field${spotlight ? ' spotlight' : ''}`}>
              <div className="convert-field-head">
                <span className="convert-field-name">■{f.key}</span>
                {f.required && <span className="convert-req">필수</span>}
                {spotlight && <span className="convert-spot">채워주세요</span>}
              </div>
              <textarea
                value={fields[f.key] || ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.hint}
                rows={Math.min(6, Math.max(1, (fields[f.key] || '').split('\n').length))}
              />
            </div>
          );
        })}
      </div>

      {stockEmpty && (
        <div className="convert-warn">
          주문 줄에 재고가 없습니다. <code>롤휴지 4 (재고 2)</code> 처럼 남은 수량을 적어야
          재고 화면에 잡힙니다.
        </div>
      )}

      <div className="convert-actions">
        <button className="btn-secondary" onClick={handleCopy} disabled={!store}>
          {copied ? '복사됨 — 매장에 보내주세요' : 'v3 문자 복사'}
        </button>
        <button className="btn-primary" onClick={handleSubmit} disabled={!store || saving}>
          {saving ? '등록 중...' : sameDay ? '덮어쓰기' : '등록'}
        </button>
      </div>

      {store && (
        <details className="convert-preview">
          <summary>변환된 v3 문자 보기</summary>
          <pre>{v3Text}</pre>
          <p className="convert-hint">
            이 문자를 매장에 그대로 돌려주면, 다음부터는 이걸 고쳐 쓰면 됩니다.
          </p>
        </details>
      )}
    </div>
  );
}
