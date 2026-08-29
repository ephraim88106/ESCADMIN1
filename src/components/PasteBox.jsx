import { useEffect, useMemo, useState } from 'react';
import { detectStoreFromText } from '../data/stores';
import { parseHandoffText, LABEL_ICONS } from '../lib/parseHandoff';
import ConvertForm from './ConvertForm';
import NoticePopup from './NoticePopup';

// 대시보드 문자 붙여넣기 임시저장. 등록 전에 페이지를 벗어나도 붙여넣은 문자가 지워지지 않게 한다.
const DRAFT_KEY = 'pastebox_draft';

function loadDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY) || '';
  } catch {
    return '';
  }
}

function saveDraft(text) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 임시저장은 편의 기능이라 실패해도 무시한다
  }
}

/**
 * 카톡 문자 붙여넣기 → 미리보기 → 등록.
 * 휴대폰에서 쓰는 게 기본이라 한 화면에서 끝나도록 구성했다.
 *
 * v3 문자면 바로 등록, 구양식이면 v3 변환 폼으로 넘긴다.
 * 현장이 아직 대부분 구양식이라 변환 경로가 사실상 주 입력 경로다.
 */
export default function PasteBox({ upsertHandoff, findSameDay, onDone }) {
  const [text, setText] = useState(loadDraft);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [draftSavedMsg, setDraftSavedMsg] = useState(false);
  // 등록 직후 공지를 띄울 지점. null 이면 안 떠 있다.
  const [noticeFor, setNoticeFor] = useState(null);

  useEffect(() => {
    saveDraft(text);
  }, [text]);

  const handleManualSaveDraft = () => {
    saveDraft(text);
    setDraftSavedMsg(true);
    setTimeout(() => setDraftSavedMsg(false), 2000);
  };

  const analysis = useMemo(() => {
    if (!text.trim()) return null;
    const store = detectStoreFromText(text);
    const { parsed, sections, formatVersion } = parseHandoffText(text);
    const sameDay =
      store && parsed?.dateKey ? findSameDay?.(store.id, parsed.dateKey) : null;
    return { store, parsed, sections, formatVersion, sameDay };
  }, [text, findSameDay]);

  const isLegacy = analysis?.formatVersion === 'legacy';
  const canSubmit =
    !!analysis?.store && !isLegacy && analysis.sections.length > 0 && !saving;

  const finish = (info) => {
    setResult(info);
    setText('');
    // 근무자가 앱에 확실히 들어오는 순간이 여기다. 미확인 공지는 이때 띄운다.
    if (info?.storeId) setNoticeFor(info);
    onDone?.();
  };

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
      finish({
        storeId: analysis.store.id,
        storeName: analysis.store.name,
        dateText: analysis.parsed?.dateLabel || '',
        mode,
      });
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
        placeholder={'카톡 보고 문자를 그대로 붙여넣으세요.\n통일양식이 아니어도 됩니다 — v3 틀로 옮겨 담아 보여드립니다.'}
        rows={6}
      />

      <div className="paste-draft-row">
        <button
          type="button"
          className="btn-secondary"
          disabled={!text.trim()}
          onClick={handleManualSaveDraft}
        >
          임시저장
        </button>
        {draftSavedMsg && <span className="draft-saved-msg">💾 임시저장했습니다</span>}
      </div>

      {result && (
        <div className="paste-result">
          ✅ {result.storeName} {result.dateText}{' '}
          {result.mode === 'updated' ? '덮어썼습니다' : '등록했습니다'}
        </div>
      )}

      {analysis && (
        <div className="paste-analysis">
          <div className="paste-meta">
            {analysis.store ? (
              <span className="paste-chip ok">📍 {analysis.store.name}</span>
            ) : (
              <span className="paste-chip warn">매장을 못 찾았습니다 — 아래에서 골라주세요</span>
            )}
            {analysis.parsed?.dateLabel && (
              <span className="paste-chip">
                🗓 {analysis.parsed.dateLabel}
                {analysis.parsed.autoDated && ' (오늘 자동 지정)'}
              </span>
            )}
            <span className={`paste-chip${isLegacy ? ' legacy' : ' ok'}`}>
              {isLegacy ? '구양식 → 변환 필요' : 'v3 양식'}
            </span>
            {analysis.sameDay && (
              <span className="paste-chip warn">같은 날 보고 있음 — 덮어쓰기</span>
            )}
          </div>

          {isLegacy ? (
            <ConvertForm
              rawText={text}
              upsertHandoff={upsertHandoff}
              findSameDay={findSameDay}
              onDone={finish}
            />
          ) : (
            <>
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

              <button
                className="btn-primary paste-submit"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {saving ? '등록 중...' : analysis.sameDay ? '덮어쓰기' : '등록'}
              </button>
            </>
          )}
        </div>
      )}

      {noticeFor && (
        <NoticePopup
          storeId={noticeFor.storeId}
          storeName={noticeFor.storeName}
          headline={`✅ ${noticeFor.dateText} 보고를 ${
            noticeFor.mode === 'updated' ? '덮어썼습니다' : '등록했습니다'
          }`}
          onClose={() => setNoticeFor(null)}
        />
      )}
    </div>
  );
}
