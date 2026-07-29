// 전사 재고 집계
//
// 목적: 통일양식으로 들어온 ■재고 / ■주문 / ■입고를 17개 매장 기준으로 합산해
//       "어느 매장에 뭐가 떨어졌는지"를 한 화면에서 본다.
//
// 재고 생명주기 (버그 수정 후 확정):
//   ■재고  = 그날 센 현재고 (스냅샷)
//   ■주문  = 요청함. (이전요청) 이면 아직 안 옴 → 재고는 변하지 않는다
//   ■입고  = 실제 도착 → 이때만 재고가 늘어난다
//
// 발주 판정:
//   현재고 < 임계치 & 대기 중인 발주 없음 → '발주 필요'
//   현재고 < 임계치 & 대기 중인 발주 있음 → '발주함 (n일 대기)'

import { foldByDate, trackOpenItems, daysBetween, todayKey } from './patrol';
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
    for (const item of last.handoff.parsed.inventory || []) {
      if (item.qty == null) continue;
      const name = canonicalName(item.name, aliasMap);
      stock.set(name, { qty: item.qty, unit: item.unit || '', raw: item.name });
    }
  }

  // 대기 중인 발주: ■주문에 계속 남아 있는 줄 = 아직 안 닫힌 요청
  const pendingOrders = trackOpenItems(v3, (p) =>
    (p.orders || []).map((o) => o.name)
  ).map((o) => ({
    name: canonicalName(o.text, aliasMap),
    raw: o.text,
    firstDate: o.firstDate,
    age: daysBetween(o.firstDate, today),
  }));

  return {
    lastDateKey: last?.dateKey ?? null,
    reported: !!last,
    stock,
    pendingOrders,
  };
}

/**
 * 17개 매장 전체 재고 뷰.
 * @returns {{ items, reorder, rawNames, storeInfo }}
 *   items      매장×품목 매트릭스용 (품목 하나 = 한 행)
 *   reorder    임계치 미만인 것만 추린 발주 목록
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

  const reorder = rows
    .map((row) => ({
      name: row.name,
      threshold: row.threshold,
      stores: stores
        .map((store) => ({ store, ...row.cells[store.id] }))
        .filter((c) => c.low || (c.order && c.qty === null)),
    }))
    .filter((r) => r.stores.length > 0)
    .sort((a, b) => b.stores.length - a.stores.length);

  return { items: rows, reorder, rawNames: [...rawNames], storeInfo };
}

/** 발주 목록을 카톡/메모로 옮길 수 있는 텍스트로 */
export function waitLabel(age) {
  return age <= 0 ? '발주함 (오늘)' : `발주함 ${age}일째`;
}

export function reorderToText(reorder) {
  if (!reorder.length) return '발주 필요 항목이 없습니다.';
  return reorder
    .map((r) => {
      const parts = r.stores.map((s) => {
        const qty = s.qty === null ? '미기재' : `${s.qty}`;
        const wait = s.order ? ` · ${waitLabel(s.order.age)}` : '';
        return `${s.store.name} ${qty}${wait}`;
      });
      return `${r.name} (임계 ${r.threshold})\n  ${parts.join('\n  ')}`;
    })
    .join('\n\n');
}
