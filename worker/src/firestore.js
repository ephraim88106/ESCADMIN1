/**
 * Firestore REST 클라이언트 (읽기 + 커서 쓰기).
 *
 * 앱에 로그인이 없어 규칙이 공개 상태이므로 API 키만으로 읽고 쓴다.
 * 서비스 계정을 쓰지 않는 이유이기도 하다 — 앱이 하는 것과 같은 권한만 쓴다.
 */

export function createClient(projectId, apiKey) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  const request = async (path, options = {}) => {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${base}${path}${separator}key=${apiKey}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Firestore ${options.method || 'GET'} ${path} → ${response.status} ${await response.text()}`);
    }
    return response;
  };

  return { base, request };
}

function fromValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
  if ('mapValue' in value) return fromFields(value.mapValue.fields);
  return null;
}

export function fromFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = fromValue(value);
  return out;
}

function docId(name) {
  return name.split('/').pop();
}

/** 지난번 확인 시각 이후에 올라온 인수인계만 가져온다. */
export async function fetchNewHandoffs(client, since, limit = 20) {
  const response = await client.request(':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'handoffs' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'createdAt' },
            op: 'GREATER_THAN',
            value: { integerValue: String(since) },
          },
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }],
        limit,
      },
    }),
  });
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row.document)
    .map((row) => ({ id: docId(row.document.name), ...fromFields(row.document.fields) }));
}

export async function fetchSubscriptions(client) {
  const response = await client.request('/pushSubscriptions?pageSize=300');
  if (response.status === 404) return [];
  const data = await response.json();
  return (data.documents || []).map((d) => ({ id: docId(d.name), ...fromFields(d.fields) }));
}

export async function deleteSubscription(client, id) {
  await client.request(`/pushSubscriptions/${id}`, { method: 'DELETE' });
}

const CURSOR_PATH = '/meta/pushCursor';

/** 마지막으로 확인한 시각. 없으면 null — 첫 실행이라는 뜻이다. */
export async function readCursor(client) {
  const response = await client.request(CURSOR_PATH);
  if (response.status === 404) return null;
  const data = await response.json();
  const value = fromFields(data.fields).lastCreatedAt;
  return typeof value === 'number' ? value : null;
}

export async function writeCursor(client, value) {
  await client.request(`${CURSOR_PATH}?updateMask.fieldPaths=lastCreatedAt`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { lastCreatedAt: { integerValue: String(value) } } }),
  });
}
