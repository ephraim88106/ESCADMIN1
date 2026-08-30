/**
 * 웹 푸시용 키 한 쌍을 만든다.
 *
 *   node scripts/gen-vapid.mjs
 *
 * 공개키는 앱 소스(src/data/pushConfig.js)에 넣는다 — 공개돼도 안전하다.
 * 비밀키는 `wrangler secret put VAPID_PRIVATE_KEY` 로만 넣는다. 저장소에 올리면 안 된다.
 */
import { webcrypto } from 'node:crypto';

const pair = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify']
);

const publicKey = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString(
  'base64url'
);
const { d: privateKey } = await webcrypto.subtle.exportKey('jwk', pair.privateKey);

console.log('');
console.log('src/data/pushConfig.js 에 넣을 공개키:');
console.log(`  export const VAPID_PUBLIC_KEY = '${publicKey}';`);
console.log('');
console.log('아래 명령으로 넣을 비밀키 (저장소에 올리지 말 것):');
console.log('  npx wrangler secret put VAPID_PRIVATE_KEY');
console.log(`  ${privateKey}`);
console.log('');
