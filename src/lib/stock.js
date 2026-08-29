// 전사 재고 집계
//
// 목적: 통일양식으로 들어온 ■재고 / ■주문 / ■입고를 17개 매장 기준으로 합산해
//       "어느 매장에 뭐가 떨어졌는지"를 한 화면에서 본다.
//
// 주문과 재고는 한 줄이다 (2026-07-29 확정).
//   ■주문  롤휴지 4 (재고 2) #긴급 (이전요청)
//   ■입고  실제 도착
// 구버전 ■재고 섹션도 계속 읽는다(하위호환). 두 곳에 다 있으면 주문 줄이 이긴다.
//
// 발주 분류는 '문자에 쓰인 대로' 따른다 (2026-07-29 확정).
//   ■주문 중 (이전요청) 없는 줄 → 발주 필요   = 담당자가 오늘 새로 요청한 것
//   ■주문 중 (이전요청) 붙은 줄 → 미도착 발주 = 전에 요청했는데 아직 안 온 것
//
// 임계치는 발주 판정에 쓰지 않고, 매트릭스에서 '재고가 적다'를 색으로 보여주는 데만 쓴다.
// 재고가 바닥인데 담당자가 ■주문에 안 적었다면 목록에 뜨지 않는다 — 문자가 기준이다.

import {
  foldByDate,
  trackOpenItems,
  daysBetween,
  todayKey,
  buildArrivalMap,
  applyOrderResolutions,
} from './patrol';
import { canonicalName, itemThreshold } from './itemName';

export const DEFAULT_THRESHOLD = 2;

/**
 * 한 매장의 재고 스냅샷 + 대기 중인 발주.
 * 재고는 '가장 최근 v3 보고'의 ■재고를 쓴다. 재고는 누적이 아니라 매번 센 값이므로.
 */
export function buildStoreStock(handoffs, aliasMap, today) {
  const reports = foldByDate(handoffs || []);
  const v3 = reports.filter((r) => r.handoff?.parsed?.formatVersion === 'v3');
  const last = v3[v3.length - 1] || null;

  const stock = new Map(); // canonical -> { qty, unit, raw }
  if (last) {
    // 1) 구버전 ■재고 섹션
    for (const item of last.handoff.parsed.inventory || []) {
      if (item.qty == null) continue;
      const name = canonicalName(item.name, aliasMap);
      stock.set(name, { qty: item.qty, unit: item.unit || '', raw: item.name });
    }
    // 2) 주문 줄의 (재고 N) — 새 양식. 같은 품목이면 이쪽이 이긴다.
    for (const o of last.handoff.parsed.orders || []) {
      if (o.stock == null) continue;
      const name = canonicalName(o.name, aliasMap);
      stock.set(name, { qty: o.stock, unit: '', raw: o.name });
    }
  }

  // 며칠째인지는 '언제 처음 ■주문에 나왔나'로 계산한다.
  // (이전요청) 표시가 붙기 전부터 세야 실제 대기 일수가 나온다.
  const track = new Map();
  for (const o of trackOpenItems(v3, (p) => (p.orders || []).map((x) => x.name))) {
    track.set(canonicalName(o.text, aliasMap), o);
  }

  const latest = last ? last.handoff.parsed.orders || [] : [];
  const toEntry = (o) => {
    const name = canonicalName(o.name, aliasMap);
    const t = track.get(name) || null;
    const from = t?.firstDate || null;
    // 이전 보고에서 못 찾았는데 (이전요청) 이라고 쓰여 있으면 기간을 알 수 없다.
    // 0일로 두면 '오늘 요청'처럼 보여 담당자가 쓴 '이전'과 어긋난다.
    const age = from ? daysBetween(from, today) : o.previous ? null : 0;
    return {
      name,
      // 발주완료 처리 매칭용. 대표 품목명을 키로 쓴다 — 담당자가 표현을 조금씩 바꿔도 같은 건으로 묶인다.
      text: name,
      raw: o.name,
      qty: o.qty,
      unit: o.unit || '',
      urgent: !!o.urgent,
      firstDate: from,
      count: t?.count ?? 1,
      changed: !!t?.changed,
      variants: t?.variants ?? [o.name],
      lastAt: t?.lastAt ?? null,
      age,
    };
  };

  const newOrders = latest.filter((o) => !o.previous).map(toEntry);
  const prevOrders = latest.filter((o) => o.previous).map(toEntry);

  return {
    lastDateKey: last?.dateKey ?? null,
    reported: !!last,
    stock,
    // 품목별 마지막 ■입고 시각. 발주완료한 건을 닫을 때 쓴다.
    arrivals: buildArrivalMap(reports, aliasMap),
    newOrders,
    prevOrders,
    pendingOrders: [...newOrders, ...prevOrders],
  };
}

/**
 * 17개 매장 전체 재고 뷰.
 * @returns {{ items, reorder, rawNames, storeInfo }}
 *   items      매장×품목 매트릭스용 (품목 하나 = 한 행)
 *   reorder    문자의 ■주문을 품목별로 묶은 발주 목록 (발주 필요 / 미도착 구분)
 *   rawNames   문자에 실제로 등장한 원본 품목명 (별칭 정리 화면용)
 */
export function buildStockView(stores, handoffsByStore, items, aliasMap, today = todayKey()) {
  const storeInfo = {};
  const rawNames = new Set();

  for (const store of stores) {
    storeInfo[store.id] = buildStoreStock(handoffsByStore[store.id] || [], aliasMap, today);
    for (const [, v] of storeInfo[store.id].stock) rawNames.add(v.raw);
    for (const o of storeInfo[store.id].pendingOrders) rawNames.add(o.raw);
  }

  // 등장한 모든 대표 품목명 수집
  const names = new Set();
  for (const store of stores) {
    for (const key of storeInfo[store.id].stock.keys()) names.add(key);
    for (const o of storeInfo[store.id].pendingOrders) names.add(o.name);
  }

  const rows = [...names].map((name) => {
    const threshold = itemThreshold(name, aliasMap, DEFAULT_THRESHOLD);
    const cells = {};
    let usedBy = 0;
    let lowCount = 0;

    for (const store of stores) {
      const info = storeInfo[store.id];
      const entry = info.stock.get(name) || null;
      const order = info.pendingOrders.find((o) => o.name === name) || null;

      if (entry || order) usedBy += 1;

      const low = entry ? entry.qty < threshold : false;
      if (low && !order) lowCount += 1;

      cells[store.id] = {
        qty: entry ? entry.qty : null,
        unit: entry?.unit || '',
        // 이 매장이 보고는 했는데 이 품목을 안 적었다 = 누락 가능성
        missing: info.reported && !entry,
        notReported: !info.reported,
        order,
        low,
      };
    }

    return { name, threshold, cells, usedBy, lowCount };
  });

  // 부족한 매장이 많은 품목이 위로, 그 다음 많이 쓰는 품목순
  rows.sort((a, b) => b.lowCount - a.lowCount || b.usedBy - a.usedBy || a.name.localeCompare(b.name));

  // 발주 목록은 문자에 쓰인 ■주문 그대로 묶는다. 임계치로 만들어내지 않는다.
  const grouped = new Map();
  const add = (store, o, kind) => {
    if (!grouped.has(o.name)) grouped.set(o.name, { name: o.name, stores: [] });
    grouped.get(o.name).stores.push({
      store,
      kind, // 'new' = 발주 필요, 'pending' = 미도착
      qty: o.qty,
      unit: o.unit,
      age: o.age,
      urgent: o.urgent,
      stock: storeInfo[store.id].stock.get(o.name)?.qty ?? null,
    });
  };
  for (const store of stores) {
    const info = storeInfo[store.id];
    for (const o of info.newOrders) add(store, o, 'new');
    for (const o of info.prevOrders) add(store, o, 'pending');
  }

  const reorder = [...grouped.values()].sort((a, b) => {
    const pend = (r) => r.stores.filter((x) => x.kind === 'pending').length;
    const oldest = (r) => Math.max(0, ...r.stores.map((x) => x.age || 0));
    return oldest(b) - oldest(a) || pend(b) - pend(a) || b.stores.length - a.stores.length;
  });

  return { items: rows, reorder, rawNames: [...rawNames], storeInfo };
}

/**
 * 한 매장에서 '지금 시켜야 할 것'을 추린다.
 *
 * 미도착 발주(이미 시켰는데 안 온 것)와는 다르다.
 * 여기 나오는 건 재고가 임계치 미만인데 아직 주문 줄에 없는 품목이다.
 */
export function buildStoreReorder(handoffs, aliasMap, today = todayKey(), resolutions = []) {
  const info = buildStoreStock(handoffs, aliasMap, today);
  // 문자의 ■주문 그대로. 남은 재고는 양쪽 모두에 붙인다 —
  // 안 온 발주도 재고가 0이면 더 급하다.
  const withStock = (o) => ({ ...o, stock: info.stock.get(o.name)?.qty ?? null });
  // 발주완료한 품목은 '도착 대기'로 내리고 알림에서 뺀다.
  // 매장이 ■주문에 계속 올려도 되살리지 않는다 — 안 시켰다는 뜻이 아니라 아직 안 왔다는 뜻이므로.
  const orderOpts = { arrivals: info.arrivals, today };
  const needOrderSplit = applyOrderResolutions(info.newOrders.map(withStock), resolutions, orderOpts);
  const prevOrdersSplit = applyOrderResolutions(info.prevOrders.map(withStock), resolutions, orderOpts);
  return {
    ...info,
    needOrder: needOrderSplit.open,
    prevOrders: prevOrdersSplit.open,
    waitingOrders: [...needOrderSplit.waiting, ...prevOrdersSplit.waiting],
    arrivedOrders: [...needOrderSplit.arrived, ...prevOrdersSplit.arrived],
  };
}

/** 한 매장 발주 목록을 카톡·메모로 옮길 수 있는 텍스트로 */
export function storeReorderToText(storeName, needOrder, pending) {
  const head = `[${storeName}] 발주 요청`;
  if (needOrder.length === 0 && pending.length === 0) return `${head}\n발주할 항목이 없습니다.`;
  const lines = [head];
  const qtyText = (o) => (o.qty != null ? ` ${o.qty}${o.unit}` : '');
  if (needOrder.length) {
    lines.push('', '■발주 필요');
    for (const n of needOrder) {
      const stock = n.stock != null ? ` (현재고 ${n.stock})` : '';
      lines.push(`${n.name}${qtyText(n)}${stock}${n.urgent ? ' #긴급' : ''}`);
    }
  }
  if (pending.length) {
    lines.push('', '■미도착 발주');
    for (const p of pending) {
      const stock = p.stock != null ? ` (현재고 ${p.stock})` : '';
      lines.push(`${p.name}${qtyText(p)}${stock} — ${waitLabel(p.age)}`);
    }
  }
  return lines.join('\n');
}

/**
 * 미도착 발주 라벨.
 *
 * '발주함' 이라고 쓰면 관리자가 훑을 때 '처리됨'으로 읽힌다.
 * 실제로는 아직 안 온 것 = 조치가 필요한 것이므로 '미도착'을 앞세운다.
 *
 * age 가 null 이면 며칠째인지 모른다는 뜻이다.
 * (이전요청) 이라고 쓰여 있는데 그 매장의 이전 보고가 없으면 이 경우가 된다.
 * 이때 '오늘'이라고 표시하면 담당자가 쓴 '이전'을 시스템이 뒤집는 셈이 된다.
 */
export function waitLabel(age) {
  return age == null || age <= 0 ? '미도착' : `${age}일째 미도착`;
}

export function reorderToText(reorder) {
  if (!reorder.length) return '■주문에 올라온 항목이 없습니다.';
  return reorder
    .map((r) => {
      const parts = r.stores.map((s) => {
        const qty = s.qty != null ? ` ${s.qty}${s.unit || ''}` : '';
        const stock = s.stock != null ? ` (현재고 ${s.stock})` : '';
        const tail = s.kind === 'pending' ? ` — ${waitLabel(s.age)}` : '';
        return `${s.store.name}${qty}${stock}${tail}${s.urgent ? ' #긴급' : ''}`;
      });
      return `${r.name}\n  ${parts.join('\n  ')}`;
    })
    .join('\n\n');
}
