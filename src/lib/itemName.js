// 품목명 정규화 · 별칭
//
// 같은 물건인데 매장마다 다르게 적는다: 롤휴지 / 점보롤 / 점보롤휴지, 8온스컵 / 8온즈컵.
// 그대로 두면 매장별 재고는 맞아도 17개 합산이 안 된다.
//
// 방식: 문자에 나온 이름을 그대로 수집해두고, 화면에서 "이건 같은 물건"으로 묶는다.
// 품목 마스터를 미리 확정하지 않아도 오늘부터 쓸 수 있다.

/** 비교용 키. 공백·괄호·중점 제거 + 소문자 */
export function itemKey(name) {
  return String(name || '')
    .replace(/#\S+/g, '')
    .replace(/[\s()[\]·・.,_-]/g, '')
    .toLowerCase();
}

/**
 * items 문서 배열 → 조회용 맵
 * @param {Array<{canonical:string, aliases?:string[], threshold?:number}>} items
 */
export function buildAliasMap(items) {
  const map = new Map();
  for (const item of items || []) {
    const names = [item.canonical, ...(item.aliases || [])];
    for (const n of names) {
      if (n) map.set(itemKey(n), item);
    }
  }
  return map;
}

/**
 * 원본 품목명 → 대표 품목명.
 * 등록된 별칭이 없으면 원본을 그대로 대표명으로 쓴다(수집 우선).
 */
export function canonicalName(raw, aliasMap) {
  const hit = aliasMap?.get(itemKey(raw));
  return hit?.canonical ?? String(raw || '').trim();
}

export function itemThreshold(raw, aliasMap, fallback = 2) {
  const hit = aliasMap?.get(itemKey(raw));
  return hit?.threshold ?? fallback;
}

/** 길이가 같은 두 문자열이 한 글자만 다른가 (8온스컵 vs 8온즈컵) */
function oneCharApart(a, b) {
  if (a.length !== b.length || a.length < 3) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      diff += 1;
      if (diff > 1) return false;
    }
  }
  return diff === 1;
}

/**
 * 아직 안 묶인 이름들 중 서로 같은 물건일 가능성이 높은 쌍을 찾는다.
 * - 한쪽 키가 다른 쪽 키를 포함  (롤휴지 ⊂ 점보롤휴지)
 * - 길이가 같고 한 글자만 다름   (8온스컵 vs 8온즈컵)
 * 자동 병합은 하지 않는다 — 사람이 확인해야 한다.
 */
export function suggestMerges(names) {
  const entries = [...new Set(names)].map((n) => ({ name: n, key: itemKey(n) }));
  const out = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (!a.key || !b.key || a.key === b.key) continue;
      const shorter = a.key.length <= b.key.length ? a : b;
      const longer = a.key.length <= b.key.length ? b : a;
      if (shorter.key.length >= 2 && longer.key.includes(shorter.key)) {
        out.push({ a: shorter.name, b: longer.name, reason: '이름 포함' });
      } else if (oneCharApart(a.key, b.key)) {
        out.push({ a: a.name, b: b.name, reason: '한 글자 차이' });
      }
    }
  }
  return out;
}
