/**
 * 웹 푸시 발송 (RFC 8291 aes128gcm + RFC 8292 VAPID).
 *
 * 라이브러리를 쓰지 않고 WebCrypto 로만 짰다. Workers 런타임에는 node crypto 가 없고,
 * 이 정도는 표준 API 로 다 되기 때문이다.
 *
 * 흐름:
 *   1. 브라우저가 준 공개키(p256dh)와 우리가 즉석에서 만든 키쌍으로 공유 비밀을 만든다
 *   2. 거기서 뽑은 키로 본문을 AES-128-GCM 으로 암호화한다 — 푸시 서버는 내용을 못 본다
 *   3. VAPID 서명(JWT)을 붙여 "우리가 보낸 게 맞다"를 증명한다
 */

const encoder = new TextEncoder();

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToBase64Url(input) {
  const bytes = new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

/** VAPID 비밀키는 32바이트 스칼라(d)로 보관한다. 공개키에서 x, y 를 떼어 JWK 를 만든다. */
async function importSigningKey(privateKeyB64, publicKeyB64) {
  const publicBytes = base64UrlToBytes(publicKeyB64);
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: privateKeyB64,
      x: bytesToBase64Url(publicBytes.slice(1, 33)),
      y: bytesToBase64Url(publicBytes.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function vapidAuthorization(endpoint, vapid) {
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      })
    )
  );
  const signingInput = `${header}.${claims}`;
  const key = await importSigningKey(vapid.privateKey, vapid.publicKey);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(signingInput)
  );
  return `vapid t=${signingInput}.${bytesToBase64Url(signature)}, k=${vapid.publicKey}`;
}

/** 본문 암호화. 결과는 그대로 요청 본문이 된다. */
export async function encryptPayload(plaintext, p256dhB64, authB64) {
  const uaPublicBytes = base64UrlToBytes(p256dhB64);
  const authSecret = base64UrlToBytes(authB64);

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, ephemeral.privateKey, 256)
  );

  const keyInfo = concat(
    encoder.encode('WebPush: info'),
    new Uint8Array([0]),
    uaPublicBytes,
    asPublicBytes
  );
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    concat(encoder.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])),
    16
  );
  const nonce = await hkdf(
    salt,
    ikm,
    concat(encoder.encode('Content-Encoding: nonce'), new Uint8Array([0])),
    12
  );

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 는 "마지막 레코드"라는 표시다
  const padded = concat(encoder.encode(plaintext), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, padded)
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  const header = concat(salt, recordSize, new Uint8Array([asPublicBytes.length]), asPublicBytes);

  return concat(header, ciphertext);
}

/**
 * 한 기기로 보낸다.
 * @returns {Promise<{ok: boolean, status: number, gone: boolean}>}
 *   gone 이면 그 구독은 죽은 것이라 지워야 한다 (앱 삭제, 브라우저 데이터 삭제 등).
 */
export async function sendPush(subscription, payload, vapid, { urgent = false } = {}) {
  const body = await encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth);
  const authorization = await vapidAuthorization(subscription.endpoint, vapid);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: urgent ? 'high' : 'normal',
    },
    body,
  });

  return {
    ok: response.ok,
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  };
}
