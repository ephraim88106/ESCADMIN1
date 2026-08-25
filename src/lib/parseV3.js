// 일일보고 통일양식 v3 전용 파서
//
// 양식 (11개 섹션, 머리표는 ■ 하나로 통일):
//   [검암점] 7/29(수)
//   ■고정석 / ■고장 / ■상시안내 / ■점검 / ■해야할일
//   ■온습도 (구역은 ㅁ스터디존, ㅁ카페존)
//   ■빈자리 / ■재고 / ■주문 / ■입고 / ■메모
//
// 설계 근거: v3는 "고장·해야할일을 매번 전체 나열하고 고친 줄만 삭제"한다.
// 따라서 어제 있던 줄이 오늘 없으면 = 해결된 것으로 자동 판정할 수 있다.
// 이 성질이 patrol.js의 미해결 나이 계산의 전제가 된다.

import { detectStoreFromText } from '../data/stores';

export const V3_SECTIONS = [
  { key: 'fixedSeats', title: '고정석', required: true },
  { key: 'faults', title: '고장', required: true },
  { key: 'standing', title: '상시안내' },
  { key: 'checks', title: '점검' },
  { key: 'todos', title: '해야할일' },
  { key: 'temps', title: '온습도', required: true },
  { key: 'emptySeats', title: '빈자리', required: true },
  { key: 'inventory', title: '재고' },
  { key: 'orders', title: '주문' },
  { key: 'arrivals', title: '입고' },
  { key: 'memo', title: '메모' },
];

const TITLE_TO_KEY = Object.fromEntries(
  V3_SECTIONS.map((s) => [s.title, s.key])
);

// 섹션 머리 별칭 — 담당자가 옛 용어로 적어도 받아준다
const HEAD_ALIASES = {
  지정석: '고정석',
  빈좌석: '빈자리',
  '이전주문': '주문',
  '이전 주문': '주문',
  도착: '입고',
  온도: '온습도',
  '온습도체크': '온습도',
  전달사항: '메모',
};

const EMPTY_TOKENS = ['없음', '없슴', '-', '해당없음', 'x', 'X'];

// ■이전주문 아래에 적은 줄은 (이전요청) 을 안 써도 미도착 발주로 쳐준다.
const PREVIOUS_ORDER_HEADS = ['이전주문', '이전 주문'];

function markPrevious(line) {
  return /\(\s*이전\s*요청\s*\)/.test(line) ? line : `${line} (이전요청)`;
}

/**
 * v3 양식인지 판정.
 *
 * ■ 하나만 보고 판정하면 안 된다. 구양식 중에 `■강서방화점` 처럼
 * ■ 를 매장명 앞에 쓰는 곳이 있어서, 그런 문자가 v3 파서로 넘어가면
 * 아는 섹션이 하나도 없어 통째로 버려진다.
 * 그래서 '■ + 아는 섹션명'이 2개 이상일 때만 v3로 본다.
 */
export function isV3Format(text) {
  const heads = String(text || '').match(/^\s*■\s*[^\s]+/gm) || [];
  const known = heads.filter((h) => normalizeHead(h.trim()) !== null);
  return known.length >= 2;
}

function normalizeHead(raw) {
  const head = raw.replace(/^■\s*/, '').replace(/[:：]\s*$/, '').trim();
  const mapped = HEAD_ALIASES[head] || head;
  return TITLE_TO_KEY[mapped] ? mapped : null;
}

function isEmptyToken(line) {
  return EMPTY_TOKENS.includes(line.trim());
}

/** `[검암점] 7/29(수)` → { storeText, month, day, weekday } */
function parseHeader(line) {
  const bracket = line.match(/\[([^\]]+)\]/);
  const dateMatch = line.match(/(\d{1,2})\s*[/.\-월]\s*(\d{1,2})/);
  const weekday = line.match(/\(([월화수목금토일])\)/);
  return {
    storeText: bracket ? bracket[1].trim() : line.replace(/\d.*$/, '').trim(),
    month: dateMatch ? parseInt(dateMatch[1], 10) : null,
    day: dateMatch ? parseInt(dateMatch[2], 10) : null,
    weekday: weekday ? weekday[1] : null,
  };
}

/**
 * 문자의 날짜(월/일)와 등록 시각을 합쳐 YYYY-MM-DD 를 만든다.
 * 12월 문자를 1월에 붙여넣는 연말 경계도 처리한다.
 */
export function resolveDateKey(month, day, baseTime = Date.now()) {
  const base = new Date(baseTime);
  if (!month || !day) {
    return toDateKey(base);
  }
  let year = base.getFullYear();
  const baseMonth = base.getMonth() + 1;
  if (baseMonth === 1 && month === 12) year -= 1;
  if (baseMonth === 12 && month === 1) year += 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** `좌식(하층) 선풍기 확인 O` → { name: '좌식(하층) 선풍기 확인', ok: true } */
function parseCheck(line) {
  const m = line.match(/^(.*?)[\s:]*([OoXx○×])\s*$/);
  if (!m) return { name: line, ok: null };
  return { name: m[1].trim(), ok: /[Oo○]/.test(m[2]) };
}

/** `53번 26.0` / `24번 23.8/64` / `카페테리아 24.0` */
function parseTemp(line, zone) {
  const m = line.match(/^(.*?)\s+(-?\d{1,2}(?:\.\d+)?)\s*(?:[/／]\s*(\d{1,3})\s*%?)?\s*$/);
  if (!m) return { zone, point: line, temp: null, humidity: null, raw: line };
  return {
    zone,
    point: m[1].trim(),
    temp: parseFloat(m[2]),
    humidity: m[3] != null ? parseInt(m[3], 10) : null,
    raw: line,
  };
}

/**
 * 주문 한 줄에 네 가지가 들어간다 (2026-07-29 확정 — 재고 섹션을 따로 두지 않는다).
 *
 *   롤휴지 4 (재고 2) #긴급 (이전요청)
 *   └품목 └주문수량  └현재고  └긴급   └미도착
 *
 * 주문수량은 생략 가능하고, 재고는 `(재고1, 개봉0.4)` 처럼 나눠 써도 된다.
 * 매장마다 쓰는 습관이 달라 둘 다 읽는다.
 */
function parseItem(line) {
  const raw = String(line);
  const previous = /\(\s*이전\s*요청\s*\)/.test(raw);
  const urgent = /#긴급|#급|[☆★]{2,}/.test(raw);

  const stockMatch = raw.match(
    /\(\s*(?:재고|현재고|현재|남은|잔량)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:[,·]\s*개봉\s*[:：]?\s*(\d+(?:\.\d+)?)\s*)?\)/
  );
  const stock = stockMatch
    ? Number((parseFloat(stockMatch[1]) + (stockMatch[2] ? parseFloat(stockMatch[2]) : 0)).toFixed(2))
    : null;

  const body = raw
    .replace(/\(\s*이전\s*요청\s*\)/g, '')
    .replace(/\(\s*(?:재고|현재고|현재|남은|잔량)[^)]*\)/g, '')
    .replace(/#\S+/g, '')
    .replace(/[☆★]{2,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const m = body.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*(\S*)$/);
  if (!m) return { name: body, qty: null, unit: '', stock, previous, urgent, raw };
  return {
    name: m[1].trim(),
    qty: parseFloat(m[2]),
    unit: (m[3] || '').trim(),
    stock,
    previous,
    urgent,
    raw,
  };
}

/**
 * v3 문자를 구조화한다.
 * 반환값의 raw.* 는 섹션별 원본 줄 배열, 나머지는 타입별 파싱 결과.
 */
export function parseV3(text, baseTime = Date.now()) {
  const lines = (text || '').split('\n');
  const raw = Object.fromEntries(V3_SECTIONS.map((s) => [s.key, []]));

  let headerLine = '';
  let current = null;
  let currentIsPreviousOrder = false;
  let zone = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('■')) {
      const title = normalizeHead(line);
      current = title ? TITLE_TO_KEY[title] : null;
      const headText = line.replace(/^■\s*/, '').replace(/[:：]\s*$/, '').trim();
      currentIsPreviousOrder = current === 'orders' && PREVIOUS_ORDER_HEADS.includes(headText);
      zone = '';
      // "■고장 없음" 처럼 같은 줄에 값이 붙은 경우
      const inline = line.replace(/^■\s*[^\s]*/, '').trim();
      if (current && inline && !isEmptyToken(inline)) {
        raw[current].push(currentIsPreviousOrder ? markPrevious(inline) : inline);
      }
      continue;
    }

    if (!current) {
      if (!headerLine) headerLine = line;
      continue;
    }

    if (isEmptyToken(line)) continue;

    if (current === 'temps' && line.startsWith('ㅁ')) {
      zone = line.replace(/^ㅁ\s*/, '').trim();
      continue;
    }

    if (current === 'temps') {
      raw[current].push({ zone, text: line });
    } else {
      raw[current].push(currentIsPreviousOrder ? markPrevious(line) : line);
    }
  }

  const header = parseHeader(headerLine);
  const store = detectStoreFromText(text);
  const dateKey = resolveDateKey(header.month, header.day, baseTime);

  const temps = raw.temps.map((t) => parseTemp(t.text, t.zone));

  return {
    formatVersion: 'v3',
    storeId: store?.id ?? null,
    storeName: store?.name ?? header.storeText ?? null,
    dateKey,
    dateLabel:
      header.month && header.day
        ? `${header.month}/${header.day}${header.weekday ? `(${header.weekday})` : ''}`
        : '',
    fixedSeats: splitSeats(raw.fixedSeats),
    faults: raw.faults,
    standing: raw.standing,
    checks: raw.checks.map(parseCheck),
    todos: raw.todos,
    temps,
    emptySeats: splitSeats(raw.emptySeats),
    inventory: raw.inventory.map(parseItem),
    orders: raw.orders.map(parseItem),
    arrivals: raw.arrivals.map(parseItem),
    memo: raw.memo.join('\n'),
    raw,
  };
}

function splitSeats(lines) {
  return lines
    .flatMap((l) => l.split(/[,，]/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 기존 인수인계 UI가 쓰는 sections 배열로 변환 (표시 호환용) */
export function toSections(parsed) {
  const out = [];
  const push = (label, content) => {
    if (content && content.trim()) out.push({ label, content: content.trim(), checked: false });
  };

  push('고정석', parsed.fixedSeats.join(', '));
  push('고장', parsed.faults.join('\n'));
  push('상시안내', parsed.standing.join('\n'));
  push(
    '점검',
    parsed.checks
      .map((c) => `${c.name} ${c.ok === null ? '' : c.ok ? 'O' : 'X'}`.trim())
      .join('\n')
  );
  push('해야할일', parsed.todos.join('\n'));
  push(
    '온습도',
    parsed.temps
      .map((t) => `${t.zone ? `[${t.zone}] ` : ''}${t.raw}`)
      .join('\n')
  );
  push('빈자리', parsed.emptySeats.join(', '));
  // ■재고는 구버전 호환용. 새 양식에서는 주문 줄의 (재고 N) 으로 대체됐다.
  push('재고', parsed.inventory.map((i) => i.raw).join('\n'));
  push('주문', parsed.orders.map((i) => i.raw).join('\n'));
  push('입고', parsed.arrivals.map((i) => i.raw).join('\n'));
  push('메모', parsed.memo);

  return out;
}

export const V3_LABEL_ICONS = {
  고정석: '💺',
  고장: '🔧',
  상시안내: '📌',
  점검: '✅',
  해야할일: '🗒️',
  온습도: '🌡️',
  빈자리: '🪑',
  재고: '📊',
  주문: '📦',
  입고: '🚚',
  메모: '📝',
};
