export const STORES = [
  { id: 'gyeyang', name: '계양점' },
  { id: 'bakchon', name: '박촌점' },
  { id: 'sangdong', name: '상동점' },
  { id: 'sinjungdong', name: '신중동점' },
  { id: 'dongchun', name: '동춘점' },
  { id: 'juan', name: '주안점' },
  { id: 'nonhyeon', name: '논현점' },
  { id: 'gwangyo', name: '관교점' },
  { id: 'hwagok', name: '화곡점' },
  { id: 'yeongjong', name: '영종점' },
  { id: 'banghwa', name: '방화점' },
  { id: 'songdo', name: '송도점' },
  { id: 'wondang', name: '원당점' },
  { id: 'dohwa', name: '도화점' },
  { id: 'geomam', name: '검암점' },
  { id: 'ganseok', name: '간석점' },
  { id: 'seogucheong', name: '서구청점' },
];

export function getStoreById(id) {
  return STORES.find((store) => store.id === id);
}

export function detectStoreFromText(text) {
  for (const store of STORES) {
    const name = store.name.replace('점', '');
    if (text.includes(store.name) || text.includes(name + '점')) {
      return store;
    }
  }
  return null;
}
