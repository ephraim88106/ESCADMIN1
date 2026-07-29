// '오늘의 순회' 위험도 엔진
//
// 정렬 원칙 (주인님 확정):
//   1순위 — 오늘 문자가 안 온 매장. 무조건 맨 위. (근무자 편차의 최상위 신호)
//   2순위 — 미해결 항목이 며칠째 안 닫혔는가 (나이)
//   그 아래 — 미해결 건수 / 발주 미도착 일수 / 온도 이탈
//
// 미해결 나이는 v3 양식의 "매번 전체 나열, 고친 줄만 삭제" 규칙에서 자동으로 나온다.
// 어제 있던 줄이 오늘 보고에 없으면 = 해결됨. 별도 완료 보고가 필요 없다.

import { toDateKey } from './parseV3';

export const THRESHOLDS = {
  tempHigh: 28,
  tempLow: 18,
  humidityHigh: 70,
  staleDays: 3, // 이 일수 이상 안 닫히면 '방치'로 본다
};

export function daysBetween(fromKey, toKeyStr) {
  if (!fromKey || !toKeyStr) return 0;
  const a = new Date(`${fromKey}T00:00:00`);
  const b = new Date(`${toKeyStr}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

export function todayKey() {
  return toDateKey(new Date());
}

function normText(t) {
  return String(t).replace(/\s+/g, '').toLowerCase();
}

/**
 * 하루 한 건으로 접는다. 같은 날 두 번 등록되면 나중 것이 이긴다(덮어쓰기 정책).
 */
export function foldByDate(handoffs) {
  const byDate = new Map();
  for (const h of handoffs) {
    const key = h.parsed?.dateKey || toDateKey(h.createdAt ?? Date.now());
    const prev = byDate.get(key);
    if (!prev || (h.createdAt ?? 0) > (prev.createdAt ?? 0)) byDate.set(key, h);
  }
  return [...byDate.entries()]
    .map(([dateKey, h]) => ({ dateKey, handoff: h }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * 오래된 보고부터 훑으며 열린 항목을 추적한다.
 * - 이번 보고에 없는 항목 → 해결된 것으로 보고 제거
 * - 처음 등장한 항목 → firstDate 기록
 * v3로 파싱된 보고만 사용한다. 구양식 보고를 섞으면 전량 '해결'로 오판된다.
 */
export function trackOpenItems(reports, pick) {
  const open = new Map();
  for (const { dateKey, handoff } of reports) {
    if (handoff.parsed?.formatVersion !== 'v3') continue;
    const items = pick(handoff.parsed) || [];
    const present = new Set(items.map(normText));

    for (const key of [...open.keys()]) {
      if (!present.has(key)) open.delete(key);
    }
    for (const text of items) {
      const key = normText(text);
      if (!open.has(key)) open.set(key, { text, firstDate: dateKey });
    }
  }
  return [...open.values()];
}

function tempFlags(parsed) {
  if (!parsed?.temps) return [];
  const flags = [];
  for (const t of parsed.temps) {
    if (t.temp != null && t.temp >= THRESHOLDS.tempHigh) {
      flags.push(`${t.point} ${t.temp}° 높음`);
    } else if (t.temp != null && t.temp <= THRESHOLDS.tempLow) {
      flags.push(`${t.point} ${t.temp}° 낮음`);
    }
    if (t.humidity != null && t.humidity >= THRESHOLDS.humidityHigh) {
      flags.push(`${t.point} 습도 ${t.humidity}%`);
    }
  }
  return flags;
}

/**
 * 한 매장의 상태를 계산한다.
 * @param {object} store  STORES 항목
 * @param {Array}  handoffs 이 매장의 보고 전체
 * @param {string} today  YYYY-MM-DD
 */
export function buildStoreStatus(store, handoffs, today) {
  const reports = foldByDate(handoffs || []);
  const last = reports[reports.length - 1] || null;
  const lastDateKey = last?.dateKey ?? null;
  const parsed = last?.handoff?.parsed ?? null;

  const daysSinceReport = lastDateKey ? daysBetween(lastDateKey, today) : null;
  const submittedToday = daysSinceReport === 0;

  const openFaults = trackOpenItems(reports, (p) => p.faults);
  const openTodos = trackOpenItems(reports, (p) => p.todos);
  // 발주는 문자에 쓰인 대로 나눈다.
  //   (이전요청) 없음 → 발주 필요, (이전요청) 있음 → 미도착 발주
  // 며칠째인지는 '언제 처음 ■주문에 나왔나'로 센다.
  const orderFirstSeen = new Map();
  for (const o of trackOpenItems(reports, (p) => (p.orders || []).map((x) => x.name))) {
    orderFirstSeen.set(normText(o.text), o.firstDate);
  }
  const latestOrders = parsed?.orders || [];
  const asOrder = (o) => {
    const from = orderFirstSeen.get(normText(o.name)) || null;
    return {
      text: o.name,
      firstDate: from,
      // 기간을 모르면 null. (이전요청) 인데 이전 보고가 없는 경우.
      age: from ? daysBetween(from, today) : o.previous ? null : 0,
    };
  };
  const newOrders = latestOrders.filter((o) => !o.previous).map(asOrder);
  const openOrders = latestOrders.filter((o) => o.previous).map(asOrder);

  const withAge = (items) =>
    items
      .map((i) => ({ ...i, age: daysBetween(i.firstDate, today) }))
      .sort((a, b) => b.age - a.age);

  const faults = withAge(openFaults);
  const todos = withAge(openTodos);
  const orders = openOrders.slice().sort((a, b) => (b.age ?? 0) - (a.age ?? 0));

  const openItems = [...faults, ...todos];
  const maxAge = openItems.length ? openItems[0].age : 0;
  const staleCount = openItems.filter((i) => i.age >= THRESHOLDS.staleDays).length;
  const orderOverdue = orders;
  const temps = tempFlags(parsed);

  // 미제출은 별도 티어. 점수로 섞지 않아야 "왜 1위인지"가 직관적이다.
  //
  // 단, '한 번도 보고가 없는 매장'은 미제출 일수를 무한대로 치지 않는다.
  // 도입 초기에는 모든 매장이 기록 없음 상태라, 그렇게 하면 실제 신호인
  // "어제까지 오다가 오늘 끊긴 매장"이 그 아래로 묻혀버린다.
  const tier = submittedToday ? 1 : 0;
  const score = submittedToday
    ? maxAge * 10 + openItems.length * 3 + orderOverdue.length * 4 + temps.length * 5
    : 10000 + (daysSinceReport ?? 0) * 100;

  const reasons = [];
  if (!submittedToday) {
    reasons.push(
      lastDateKey
        ? { kind: 'missing', text: `문자 미제출 ${daysSinceReport}일째` }
        : { kind: 'missing', text: '보고 기록 없음 (첫 등록 전)' }
    );
  }
  if (maxAge >= THRESHOLDS.staleDays) {
    reasons.push({ kind: 'stale', text: `${maxAge}일째 미해결 ${staleCount}건` });
  } else if (openItems.length > 0) {
    reasons.push({ kind: 'open', text: `미해결 ${openItems.length}건` });
  }
  if (orderOverdue.length > 0) {
    reasons.push({
      kind: 'order',
      text:
        orderOverdue[0].age != null
          ? `미도착 발주 ${orderOverdue.length}건 (최장 ${orderOverdue[0].age}일)`
          : `미도착 발주 ${orderOverdue.length}건`,
    });
  }
  if (newOrders.length > 0) {
    reasons.push({ kind: 'order', text: `발주 필요 ${newOrders.length}건` });
  }
  if (temps.length > 0) {
    reasons.push({ kind: 'temp', text: `온습도 이탈 ${temps.length}곳` });
  }

  return {
    store,
    lastDateKey,
    daysSinceReport,
    submittedToday,
    parsed,
    faults,
    todos,
    orders,
    newOrders,
    orderOverdue,
    openCount: openItems.length,
    maxAge,
    staleCount,
    tempFlags: temps,
    tier,
    score,
    reasons,
    isClear:
      submittedToday &&
      openItems.length === 0 &&
      temps.length === 0 &&
      orderOverdue.length === 0 &&
      newOrders.length === 0,
  };
}

/** 전 매장을 위험순으로 정렬 */
export function buildPatrolList(stores, handoffsByStore, today = todayKey()) {
  return stores
    .map((s) => buildStoreStatus(s, handoffsByStore[s.id] || [], today))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (b.score !== a.score) return b.score - a.score;
      return a.store.name.localeCompare(b.store.name);
    });
}

/** 상단 요약 카드용 집계 */
export function summarize(list) {
  return {
    total: list.length,
    submitted: list.filter((s) => s.submittedToday).length,
    missing: list.filter((s) => !s.submittedToday).length,
    openTotal: list.reduce((a, s) => a + s.openCount, 0),
    staleTotal: list.reduce((a, s) => a + s.staleCount, 0),
    needOrder: list.reduce((a, s) => a + s.newOrders.length, 0),
    orderOverdue: list.reduce((a, s) => a + s.orderOverdue.length, 0),
    tempFlags: list.reduce((a, s) => a + s.tempFlags.length, 0),
  };
}
