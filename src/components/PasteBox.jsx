import { useMemo, useState } from 'react';
import { detectStoreFromText } from '../data/stores';
import { parseHandoffText, LABEL_ICONS } from '../lib/parseHandoff';

/**
 * 카톡 문자 붙여넣기 → 미리보기 → 등록.
 * 휴대폰에서 쓰는 게 기본이라 한 화면에서 끝나도록 구성했다.
 */
export default function PasteBox({ upsertHandoff, findSameDay, onDone }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const analysis = useMemo(() => {
    if (!text.trim()) return null;
    const store = detectStoreFromText(text);
    const { parsed, sections, formatVersion } = parseHandoffText(text);
    const sameDay =
      store && parsed?.dateKey ? findSameDay?.(store.id, parsed.dateKey) : null;
    return { store, parsed, sections, formatVersion, sameDay };
  }, [text, findSameDay]);

  const canSubmit = !!analysis?.store && analysis.sections.length > 0 && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (analysis.sameDay) {
      const label = analysis.parsed?.dateLabel || analysis.parsed?.dateKey;
      if (!window.confirm(`${analysis.store.name} ${label} 보고가 이미 있습니다.\n덮어쓸까요?`)) {
        return;
      }
    }
    setSaving(true);
    try {
      const mode = await upsertHandoff(analysis.store.id, {
        author: '미입력',
        rawText: text,
        sections: analysis.sections,
        parsed: analysis.parsed,
        formatVersion: analysis.formatVersion,
        images: [],
        checkedBy: null,
        checkedAt: null,
      });
      setResult({
        storeName: analysis.store.name,
        dateLabel: analysis.parsed?.dateLabel || '',
        mode,
      });
      setText('');
      onDone?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="paste-box">
      <textarea
        className="paste-textarea"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
        placeholder={'카톡 보고 문자를 그대로 붙여넣으세요\n\n[검암점] 7/29(수)\n■고정석\n34, 47, 59\n■고장\n...'}
        rows={6}
      />

      {result && (
        <div className="paste-result">
          ✅ {result.storeName} {result.dateLabel}{' '}
          {result.mode === 'updated' ? '덮어썼습니다' : '등록했습니다'}
        </div>
      )}

      {analysis && (
        <div className="paste-analysis">
          <div className="paste-meta">
            {analysis.store ? (
              <span className="paste-chip ok">📍 {analysis.store.name}</span>
            ) : (
              <span className="paste-chip warn">매장을 못 찾았습니다 — 첫 줄에 매장명을 넣어주세요</span>
            )}
            {analysis.parsed?.dateLabel && (
              <span className="paste-chip">🗓 {analysis.parsed.dateLabel}</span>
            )}
            <span className={`paste-chip${analysis.formatVersion === 'v3' ? ' ok' : ' legacy'}`}>
              {analysis.formatVersion === 'v3' ? 'v3 양식' : '구양식 (폴백)'}
            </span>
            {analysis.sameDay && (
              <span className="paste-chip warn">같은 날 보고 있음 — 덮어쓰기</span>
            )}
          </div>

          <div className="paste-preview">
            {analysis.sections.map((sec, i) => (
              <div key={i} className="paste-preview-item">
                <div className="paste-preview-label">
                  {LABEL_ICONS[sec.label] || '📋'} {sec.label}
                </div>
                <pre className="paste-preview-content">{sec.content}</pre>
              </div>
            ))}
            {analysis.sections.length === 0 && (
              <p className="empty-state">인식된 내용이 없습니다.</p>
            )}
          </div>

          <button className="btn-primary paste-submit" disabled={!canSubmit} onClick={handleSubmit}>
            {saving ? '등록 중...' : analysis.sameDay ? '덮어쓰기' : '등록'}
          </button>
        </div>
      )}
    </div>
  );
}
