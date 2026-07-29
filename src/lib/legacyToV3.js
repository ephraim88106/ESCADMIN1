// 구양식 → v3 변환 초안
//
// 현장은 아직 대부분 구양식으로 보낸다. 구양식은 ■재고 개념 자체가 없어서
// 파서를 아무리 강화해도 재고 숫자를 만들어낼 수 없다.
// 그래서 "받는 쪽에서 v3 틀로 옮겨 담고 빈 칸만 채운다"가 현실적인 경로다.
//
// 변환된 v3 텍스트는 그대로 복사해 매장에 돌려줄 수 있다.
// 다음날부터 그 텍스트를 고쳐 쓰면 양식이 저절로 정착한다.

import { parseLegacy } from './parseLegacy';
import { detectStoreFromText } from '../data/stores';

export const V3_FIELDS = [
  { key: '고정석', required: true, hint: '34, 47, 59' },
  { key: '고장', required: true, hint: '없으면 없음' },
  { key: '상시안내', hint: '청소요일·비밀번호·전용좌석 등' },
  { key: '점검', hint: '항목명 O 또는 X' },
  { key: '해야할일', hint: '' },
  { key: '온습도', required: true, hint: 'ㅁ구역명 / 53번 26.0' },
  { key: '빈자리', required: true, hint: '없으면 없음' },
  { key: '재고', hint: '구양식에는 없던 항목 — 직접 채워야 합니다', spotlight: true },
  { key: '주문', hint: '미도착은 (이전요청)' },
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
const FAULT_HINT = /고장|안\s?됨|안\s?켜|안\s?꺼|안\s?나|오류|누수|막힘|파손|깨|불량|작동|멈춤|끊김|소음|악취|더러/;
const STANDING_HINT = /제공|전용|비밀번호|비번|청소|금지|안내|닫은|닫힌|어댑터|없는\s?자리|사용/;
const TODO_HINT = /붙이|정리|교체\s?필요|확인\s?필요|해야|요청|주문\s?필요|신청/;

function classifyNote(line) {
  if (TODO_HINT.test(line)) return '해야할일';
  if (FAULT_HINT.test(line)) return '고장';
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

  // 고정석 / 빈자리 — 쉼표 나열로 정리
  const seats = (raw) =>
    toLines(raw)
      .flatMap((l) => l.split(/[,，]/))
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');

  fields.고정석 = seats(get('고정석'));
  fields.빈자리 = seats(get('빈자리'));

  // 특이사항 → 고장 / 상시안내 / 해야할일
  const buckets = { 고장: [], 상시안내: [], 해야할일: [] };
  for (const line of toLines(get('특이사항'))) {
    buckets[classifyNote(line)].push(line);
  }
  fields.고장 = buckets.고장.join('\n');
  fields.상시안내 = buckets.상시안내.join('\n');
  fields.해야할일 = buckets.해야할일.join('\n');

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

  fields.주문 = toLines(get('주문/발주')).join('\n');
  fields.입고 = toLines(get('도착')).join('\n');

  // 남은 줄(전달사항)에서 건질 수 있는 것을 옮긴다.
  // 줄글로 온 문자는 대부분 여기로 떨어지므로, 놓치지 않게 훑는다.
  const rest = [];
  const movedOrders = [];
  const movedStanding = [];
  for (const line of toLines(get('전달사항'))) {
    if (/청소/.test(line)) {
      movedStanding.push(
        line.replace(/^청소\s*일정:\s*/, '').replace(/\s*청소\s*$/, '').trim()
          ? `청소요일 ${line.replace(/^청소\s*일정:\s*/, '').replace(/\s*청소\s*$/, '').trim()}`
          : line
      );
    } else if (/주문|발주|시켜|신청|부탁/.test(line) && /\d/.test(line)) {
      movedOrders.push(line);
    } else {
      rest.push(line);
    }
  }
  if (movedOrders.length) {
    fields.주문 = [fields.주문, ...movedOrders].filter(Boolean).join('\n');
    notes.push(`주문으로 보이는 ${movedOrders.length}줄을 ■주문으로 옮겼습니다. 품목과 수량을 정리해 주세요.`);
  }
  if (movedStanding.length) {
    fields.상시안내 = [fields.상시안내, ...movedStanding].filter(Boolean).join('\n');
  }
  fields.메모 = rest.join('\n');

  // 구양식에는 재고 개념이 없다. 비워두고 반드시 알린다.
  if (!fields.재고) {
    notes.push('구양식에는 ■재고가 없습니다. 현재 남은 수량을 직접 넣어야 재고 화면에 잡힙니다.');
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
