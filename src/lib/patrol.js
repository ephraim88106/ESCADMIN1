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

/** 길이가 같고 한 글자만 다른가 (`번호등13` vs `번호등14` 는 다르지만 오탐 위험은 감수) */
function oneCharApart(a, b) {
  if (a.length !== b.length || a.length < 4) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i] && ++diff > 1) return false;
  }
  return diff === 1;
}

/** 두 문자열의 공통 앞부분 길이 */
function commonPrefix(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

/**
 * 이번 줄이 이미 열려 있는 항목과 같은 건인지 찾는다.
 *
 * 담당자가 매일 조금씩 다르게 적는다 (`번호등 13` → `번호등 13번` → `번호등 13번 고장`).
 * 글자가 정확히 같을 때만 같은 건으로 보면 칸이 매일 늘고 나이도 리셋된다.
 *
 * 판정 기준 (2026-07-29 주인님 선택 — 앞부분이 같으면 합친다):
 *   1) 한쪽이 다른 쪽을 포함
 *   2) 길이가 같고 한 글자만 다름
 *   3) 앞부분이 3자 이상 같음 (`정수기 물 안나옴` ↔ `정수기 필터 교체 필요`)
 *
 * 숫자가 달라도 합친다 (2026-07-29 주인님 선택 — 칸을 최대한 접는다).
 * 대신 합쳐진 원본 문구를 variants 에 전부 남긴다.
 * `번호등 13` 과 `번호등 15` 가 한 칸이 되더라도 13번이 화면에서 사라지지는 않는다.
 * 칸을 접는 것과 내용을 버리는 것은 다른 문제다.
 */
function findSame(key, prevKeys) {
  if (prevKeys.has(key)) return key;
  let best = null;
  let bestScore = 0;
  for (const k of prevKeys) {
    const [short, long] = k.length <= key.length ? [k, key] : [key, k];
    let score = 0;
    if (short.length >= 3 && long.includes(short)) score = 1000 + short.length;
    else if (oneCharApart(k, key)) score = 900;
    else {
      const p = commonPrefix(k, key);
      if (p >= 3) score = p;
    }
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

/**
 * 오래된 보고부터 훑으며 열린 항목을 추적한다.
 * - 이번 보고에 없는 항목 → 해결된 것으로 보고 제거
 * - 처음 등장한 항목 → firstDate 기록
 * - 다시 등장한 항목 → count 증가. 문구가 바뀌었으면 최신 문구로 갱신하고 changed 표시
 * - lastAt: 이 항목이 마지막으로 올라온 보고의 등록 시각.
 *   임원이 '해결' 처리한 뒤에도 매장이 계속 올리면 다시 살아나야 하므로,
 *   해결 시각과 비교할 기준이 필요하다.
 *
 * v3로 파싱된 보고만 사용한다. 구양식 보고를 섞으면 전량 '해결'로 오판된다.
 */
export function trackOpenItems(reports, pick) {
  const open = new Map();
  for (const { dateKey, handoff } of reports) {
    if (handoff.parsed?.formatVersion !== 'v3') continue;
    const items = pick(handoff.parsed) || [];
    const at = handoff.createdAt ?? 0;

    // 같은 보고 안의 두 줄이 서로 합쳐지지 않도록, 이전 보고까지의 키만 후보로 둔다
    const prevKeys = new Set(open.keys());
    const seen = new Set();

    for (const text of items) {
      const key = normText(text);
      const hit = findSame(key, prevKeys);
      if (hit) {
        const entry = open.get(hit);
        if (!seen.has(hit)) entry.count += 1;
        if (normText(entry.text) !== key) {
          entry.changed = true;
          entry.text = text; // 최신 문구로 보여준다
        }
        // 합쳐진 원본을 모두 남긴다. 칸은 접되 내용은 버리지 않는다.
        if (!entry.variants.some((v) => normText(v) === key)) entry.variants.push(text);
        entry.lastAt = at;
        seen.add(hit);
      } else if (!open.has(key)) {
        open.set(key, {
          text,
          firstDate: dateKey,
          count: 1,
          changed: false,
          variants: [text],
          lastAt: at,
        });
        seen.add(key);
      } else {
        open.get(key).lastAt = at;
        seen.add(key);
      }
    }

    for (const k of [...open.keys()]) {
      if (!seen.has(k)) open.delete(k);
    }
  }
  return [...open.values()];
}

/**
 * 임원이 직접 닫은 항목을 걸러낸다.
 *
 * v3 규칙만 쓰면 고장 줄은 '매장이 다음 문자에서 빼야' 사라진다.
 * 임원이 현장에서 고쳐놓고도 매장 문자를 기다려야 하는 게 실제 불편이었다.
 *
 * 되살아나는 조건: 해결 처리한 뒤에 올라온 보고에 그 항목이 또 있으면 다시 띄운다.
 * 매장이 계속 올린다는 건 아직 안 고쳐졌다는 뜻이므로, 임원의 판단보다 현장을 믿는다.
 *
 * 문구가 흔들려도(variants) 같은 건으로 보고 매칭한다.
 */
export function applyResolutions(items, resolutions, kind) {
  const mine = (resolutions || []).filter((r) => r.kind === kind);
  if (mine.length === 0) return { open: items, resolved: [] };

  const open = [];
  const resolved = [];
  for (const it of items) {
    const keys = new Set([normText(it.text), ...(it.variants || []).map(normText)]);
    const hit = mine.find(
      (r) => keys.has(normText(r.text)) && (r.resolvedAt ?? 0) >= (it.lastAt ?? 0)
    );
    if (hit) resolved.push({ ...it, resolution: hit });
    else open.push(it);
  }
  return { open, resolved };
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
 * @param {Array}  resolutions 이 매장에서 임원이 직접 닫은 항목들
 */
export function buildStoreStatus(store, handoffs, today, resolutions = []) {
  const reports = foldByDate(handoffs || []);
  const last = reports[reports.length - 1] || null;
  const lastDateKey = last?.dateKey ?? null;
  const parsed = last?.handoff?.parsed ?? null;

  const daysSinceReport = lastDateKey ? daysBetween(lastDateKey, today) : null;
  const submittedToday = daysSinceReport === 0;

  const faultSplit = applyResolutions(
    trackOpenItems(reports, (p) => p.faults),
    resolutions,
    'fault'
  );
  const todoSplit = applyResolutions(
    trackOpenItems(reports, (p) => p.todos),
    resolutions,
    'todo'
  );
  const openFaults = faultSplit.open;
  const openTodos = todoSplit.open;
  // 발주는 문자에 쓰인 대로 나눈다.
  //   (이전요청) 없음 → 발주 필요, (이전요청) 있음 → 미도착 발주
  // 며칠째인지는 '언제 처음 ■주문에 나왔나'로 센다.
  const orderTrack = new Map();
  for (const o of trackOpenItems(reports, (p) => (p.orders || []).map((x) => x.name))) {
    orderTrack.set(normText(o.text), o);
  }
  const latestOrders = parsed?.orders || [];
  const asOrder = (o) => {
    const t = orderTrack.get(normText(o.name)) || null;
    const from = t?.firstDate || null;
    return {
      text: o.name,
      firstDate: from,
      count: t?.count ?? 1,
      changed: !!t?.changed,
      variants: t?.variants ?? [o.name],
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
  // 닫은 항목도 화면에 남긴다. 잘못 눌렀을 때 되돌릴 수 있어야 한다.
  const resolvedFaults = withAge(faultSplit.resolved);
  const resolvedTodos = withAge(todoSplit.resolved);
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
    // 대시보드에서 바로 지울 수 있도록 마지막 보고의 문서 id 를 들고 나간다
    lastHandoffId: last?.handoff?.id ?? null,
    faults,
    todos,
    resolvedFaults,
    resolvedTodos,
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
export function buildPatrolList(
  stores,
  handoffsByStore,
  today = todayKey(),
  resolutionsByStore = {}
) {
  return stores
    .map((s) =>
      buildStoreStatus(s, handoffsByStore[s.id] || [], today, resolutionsByStore[s.id] || [])
    )
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
