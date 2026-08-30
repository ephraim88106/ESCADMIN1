// 구양식 → v3 변환 초안
//
// 현장은 아직 대부분 구양식으로 보낸다. 표기가 매장마다 제각각이라
// "받는 쪽에서 v3 틀로 옮겨 담고 빈 칸만 채운다"가 현실적인 경로다.
//
// 재고는 주문 줄 안에 괄호로 쓴다 (`코코아 (재고1, 개봉0.4)`).
// 섹션을 따로 두지 않으므로 담당자가 같은 품목을 두 번 적을 일이 없다.
//
// 변환된 v3 텍스트는 그대로 복사해 매장에 돌려줄 수 있다.
// 다음날부터 그 텍스트를 고쳐 쓰면 양식이 저절로 정착한다.

import { parseLegacy } from './parseLegacy';
import { splitSeats } from './parseV3';
import { detectStoreFromText } from '../data/stores';

export const V3_FIELDS = [
  { key: '고정석', required: true, hint: '34, 47, 59' },
  { key: '고장', required: true, hint: '없으면 없음' },
  { key: '상시안내', hint: '청소요일·비밀번호·전용좌석 등' },
  { key: '점검', hint: '항목명 O 또는 X' },
  { key: '해야할일', hint: '' },
  { key: '온습도', required: true, hint: 'ㅁ구역명 / 53번 26.0' },
  { key: '빈자리', required: true, hint: '없으면 없음' },
  {
    key: '주문',
    hint: '롤휴지 4 (재고 2) #긴급 · 미도착은 (이전요청)',
    spotlight: true,
  },
  { key: '입고', hint: '' },
  { key: '메모', hint: '' },
];

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function todayLabel(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/**
 * 온도 표기를 v3 형태로 맞춘다.
 *   `53 : 26.0`      → `53번 26.0`
 *   `(34번) 25.3`    → `34번 25.3`
 *   `78자리 25.2`    → `78번 25.2`
 *   `24번 23.8 / 71%`→ `24번 23.8/71`
 *   `카페테리아 24.0`→ 그대로
 */
export function normalizeTempLine(line) {
  let s = String(line).replace(/^\[[^\]]*\]\s*/, '').trim();
  s = s.replace(/^\((\d+)번?\)/, '$1번');
  s = s.replace(/^(\d+)\s*자리/, '$1번');
  s = s.replace(/^(\d+)\s*:\s*/, '$1번 ');
  s = s.replace(/^(\d+)번\s*:\s*/, '$1번 ');
  s = s.replace(/\s*\/\s*(\d+)\s*%?/, '/$1');
  return s.replace(/\s+/g, ' ').trim();
}

/** 온도 줄 앞의 `[스터디]` 같은 구역 표시를 v3 구역명으로 */
function zoneOf(line) {
  const m = String(line).match(/^\[([^\]]+)\]/);
  if (!m) return '';
  const z = m[1].trim();
  if (z === '스터디') return '스터디존';
  return z;
}

// 특이사항 한 덩어리에 고장·상시안내·해야할일이 섞여 온다. 키워드로 나눈다.
// '교체 필요'는 할 일이 아니라 고장이다 (2026-07-29 주인님 지적).
// 고쳐야 할 물건이 있다는 뜻이므로 미해결 나이 추적 대상이어야 한다.
const FAULT_HINT = /고장|교체|수리|안\s?됨|안\s?켜|안\s?꺼|안\s?나|안\s?들어|오류|누수|새는|막힘|파손|깨|불량|작동|멈춤|끊김|터짐|나감|소음|악취|더러/;
const STANDING_HINT = /제공|전용|비밀번호|비번|청소|금지|안내|닫은|닫힌|어댑터|없는\s?자리|사용/;
const TODO_HINT = /붙이|설치|정리|확인\s?필요|해야|요청|주문\s?필요|신청|비치/;
// 주문 목록에 섞여 들어오는 점검 항목 (화곡 `제습기 물 비움` 등)
const CHECK_HINT = /물\s?비움|물통\s?비우|창문\s?(확인|닫)|소등|잠금|선풍기\s?확인|냉난방기|쓰레기통\s?(비움|화목)/;
// 위치·보관 안내는 상시안내로 (`도구함 오른쪽 제일 위칸에 나무꼬치 있음`)
const PLACE_HINT = /있음|둠|보관|도구함|서랍|사물함|위칸|아래칸/;

/** `[청소 - 화수목금토]`, `월 수 금 일 청소` 에서 요일만 뽑는다 */
function extractCleaningDays(line) {
  const m = String(line).match(/[월화수목금토일](?:\s*[월화수목금토일])+/);
  if (m) return m[0].replace(/\s+/g, '');
  if (/매일/.test(line)) return '매일';
  return '';
}

function classifyNote(line) {
  if (CHECK_HINT.test(line)) return '점검';
  if (FAULT_HINT.test(line)) return '고장';
  if (TODO_HINT.test(line)) return '해야할일';
  if (PLACE_HINT.test(line)) return '상시안내';
  if (STANDING_HINT.test(line)) return '상시안내';
  // 애매하면 고장으로 둔다. 미해결로 떠서 눈에 띄는 편이 놓치는 것보다 안전하다.
  return '고장';
}

const toLines = (content) =>
  String(content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * 구양식 텍스트 → v3 초안
 * @returns {{ storeId, dateText, fields, notes }}
 *   fields  섹션명 → 여러 줄 문자열
 *   notes   변환 과정에서 사람에게 알려야 할 것
 */
export function legacyToDraft(text, now = new Date()) {
  const sections = parseLegacy(text);
  const get = (label) => sections.find((s) => s.label === label)?.content || '';

  const fields = Object.fromEntries(V3_FIELDS.map((f) => [f.key, '']));
  const notes = [];

  // 고정석 / 빈자리 — 쉼표 나열로 정리 (온점 구분과 정렬은 parseV3 와 같은 규칙)
  const seats = (raw) => splitSeats(toLines(raw)).join(', ');

  fields.고정석 = seats(get('고정석'));
  fields.빈자리 = seats(get('빈자리'));

  // 특이사항 → 고장 / 상시안내 / 해야할일
  const buckets = { 고장: [], 상시안내: [], 해야할일: [], 점검: [] };
  for (const line of toLines(get('특이사항'))) {
    buckets[classifyNote(line)].push(line);
  }
  fields.고장 = buckets.고장.join('\n');
  fields.상시안내 = buckets.상시안내.join('\n');
  fields.해야할일 = buckets.해야할일.join('\n');
  fields.점검 = buckets.점검.join('\n');

  // 온도 → 구역별로 묶어 ㅁ구역명 형식으로
  const tempLines = toLines(get('온도체크'));
  const byZone = new Map();
  for (const line of tempLines) {
    const zone = zoneOf(line);
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(normalizeTempLine(line));
  }
  const tempOut = [];
  for (const [zone, lines] of byZone) {
    if (zone) tempOut.push(`ㅁ${zone}`);
    tempOut.push(...lines);
  }
  fields.온습도 = tempOut.join('\n');

  // 주문과 재고는 한 줄로 둔다. 구양식이 이미 그렇게 쓰고 있었다.
  //   `롤휴지 (재고1)☆☆☆☆☆` → `롤휴지 (재고 1) #긴급`
  //   `코코아 (재고1, 개봉0.4)` → 표기 그대로 유지 (파서가 1.4로 읽는다)
  const checkLines = [];
  const orderLines = [];
  let stockCount = 0;
  for (const line of toLines(get('주문/발주'))) {
    if (CHECK_HINT.test(line) && !/\d/.test(line.replace(/\d+\s*번/g, ''))) {
      checkLines.push(line.replace(/\(\s*이전\s*요청\s*\)/, '').trim());
      continue;
    }
    if (/\(\s*(?:재고|현재고|현재|남은|잔량)/.test(line)) stockCount += 1;
    const urgent = /[☆★]{2,}/.test(line);
    let out = line
      .replace(/[☆★]{2,}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (urgent) {
      // (이전요청) 은 항상 맨 뒤에 오도록
      const prev = /\(\s*이전\s*요청\s*\)/.test(out);
      out = `${out.replace(/\(\s*이전\s*요청\s*\)/, '').trim()} #긴급${prev ? ' (이전요청)' : ''}`;
    }
    orderLines.push(out);
  }
  fields.주문 = orderLines.join('\n');
  fields.입고 = toLines(get('도착')).join('\n');
  fields.해야할일 = [fields.해야할일, ...toLines(get('해야할일'))]
    .filter(Boolean)
    .join('\n');
  if (stockCount) {
    notes.push(`주문 ${stockCount}줄에서 (재고 N) 을 읽었습니다. 재고는 주문 줄에 그대로 둡니다.`);
  }

  // 남은 줄(전달사항)에서 건질 수 있는 것을 옮긴다.
  // 줄글로 온 문자는 대부분 여기로 떨어지므로, 놓치지 않게 훑는다.
  const rest = [];
  const movedOrders = [];
  const movedStanding = [];
  const movedFaults = [];
  for (const line of toLines(get('전달사항'))) {
    if (/청소/.test(line)) {
      const days = extractCleaningDays(line);
      movedStanding.push(days ? `청소요일 ${days}` : line);
    } else if (/주문|발주|시켜|신청|부탁/.test(line) && /\d/.test(line)) {
      movedOrders.push(line);
    } else if (CHECK_HINT.test(line)) {
      checkLines.push(line);
    } else if (FAULT_HINT.test(line)) {
      movedFaults.push(line);
    } else if (PLACE_HINT.test(line) && !FAULT_HINT.test(line)) {
      movedStanding.push(line);
    } else {
      rest.push(line);
    }
  }
  if (movedFaults.length) {
    fields.고장 = [fields.고장, ...movedFaults].filter(Boolean).join('\n');
  }
  if (checkLines.length) {
    fields.점검 = [fields.점검, ...checkLines].filter(Boolean).join('\n');
    notes.push(`점검 항목으로 보이는 ${checkLines.length}줄을 ■점검으로 옮겼습니다. 결과(O/X)를 적어주세요.`);
  }
  if (movedOrders.length) {
    fields.주문 = [fields.주문, ...movedOrders].filter(Boolean).join('\n');
    notes.push(`주문으로 보이는 ${movedOrders.length}줄을 ■주문으로 옮겼습니다. 품목과 수량을 정리해 주세요.`);
  }
  if (movedStanding.length) {
    fields.상시안내 = [fields.상시안내, ...movedStanding].filter(Boolean).join('\n');
  }
  fields.메모 = rest.join('\n');

  if (fields.주문 && !stockCount) {
    notes.push('주문 줄에 재고가 없습니다. `롤휴지 4 (재고 2)` 처럼 남은 수량을 적어주세요.');
  }
  if (buckets.고장.length > 0) {
    notes.push(`특이사항 ${toLines(get('특이사항')).length}줄을 고장·상시안내·해야할일로 나눴습니다. 확인해 주세요.`);
  }
  if (!fields.고정석) fields.고정석 = '없음';
  if (!fields.빈자리) fields.빈자리 = '없음';
  if (!fields.고장) fields.고장 = '없음';

  return {
    storeId: detectStoreFromText(text)?.id ?? null,
    dateText: todayLabel(now),
    fields,
    notes,
  };
}

/** 편집한 초안을 v3 문자로 조립. 저장 경로를 v3 하나로 통일하기 위해 반드시 이 텍스트를 거친다. */
export function draftToV3Text(storeName, dateText, fields) {
  const parts = [`[${storeName}] ${dateText}`];
  for (const f of V3_FIELDS) {
    const value = (fields[f.key] || '').trim();
    if (!value && !f.required) continue;
    parts.push(`■${f.key}\n${value || '없음'}`);
  }
  return parts.join('\n\n') + '\n';
}
