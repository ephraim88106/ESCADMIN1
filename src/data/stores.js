// 17개 매장 마스터.
// aliases: 카톡 문자에 실제로 쓰이는 표기를 모두 등록한다.
// (예: "영종점" / "영종하늘도시점" 둘 다 같은 매장으로 인식되어야 함)
export const STORES = [
  { id: 'geomam', name: '검암점', aliases: ['검암'] },
  { id: 'sangdong', name: '상동점', aliases: ['상동'] },
  { id: 'dohwa', name: '도화점', aliases: ['도화'] },
  { id: 'songdo', name: '송도점', aliases: ['송도'] },
  { id: 'banghwa', name: '강서방화점', aliases: ['강서방화', '방화'] },
  { id: 'yeongjong', name: '영종하늘도시점', aliases: ['영종하늘도시', '하늘도시', '영종'] },
  { id: 'hwagok', name: '화곡점', aliases: ['화곡'] },
  { id: 'juan', name: '주안점', aliases: ['주안'] },
  { id: 'nonhyeon', name: '논현점', aliases: ['논현'] },
  { id: 'wondang', name: '원당점', aliases: ['원당'] },
  { id: 'sinjungdong', name: '신중동점', aliases: ['신중동'] },
  { id: 'bakchon', name: '박촌점', aliases: ['박촌'] },
  { id: 'seogucheong', name: '서구청점', aliases: ['서구청'] },
  { id: 'gwangyo', name: '관교점', aliases: ['관교'] },
  { id: 'dongchun', name: '동춘점', aliases: ['동춘'] },
  { id: 'gyeyang', name: '계양점', aliases: ['계양'] },
  { id: 'ganseok', name: '간석점', aliases: ['간석'] },
];

export function getStoreById(id) {
  return STORES.find((store) => store.id === id);
}

export function getStoreName(id) {
  return getStoreById(id)?.name ?? id;
}

// 별칭 → 매장 색인. 긴 별칭이 먼저 검사되도록 정렬해 부분일치 오인식을 막는다.
// (예: "강서방화"가 "방화"보다 먼저 검사되어야 한다)
const ALIAS_INDEX = STORES.flatMap((store) => {
  const names = new Set([store.name, ...(store.aliases || [])]);
  // "검암"이 등록되어 있으면 "검암점"도 자동 등록
  for (const n of [...names]) {
    if (!n.endsWith('점')) names.add(n + '점');
  }
  return [...names].map((alias) => ({ alias, store }));
}).sort((a, b) => b.alias.length - a.alias.length);

function matchAlias(text) {
  if (!text) return null;
  for (const { alias, store } of ALIAS_INDEX) {
    if (text.includes(alias)) return store;
  }
  return null;
}

/**
 * 문자에서 매장을 감지한다.
 * 1순위: 첫 줄의 대괄호 안 (`[검암점] 7/29(수)`)
 * 2순위: 첫 줄 전체
 * 3순위: 본문 전체
 */
export function detectStoreFromText(text) {
  if (!text) return null;
  const firstLine =
    text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || '';

  const bracket = firstLine.match(/\[([^\]]+)\]/);
  if (bracket) {
    const found = matchAlias(bracket[1]);
    if (found) return found;
  }

  return matchAlias(firstLine) || matchAlias(text);
}
