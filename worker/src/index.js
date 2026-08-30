import {
  createClient,
  deleteSubscription,
  fetchNewHandoffs,
  fetchSubscriptions,
  readCursor,
  writeCursor,
} from './firestore.js';
import { sendPush } from './webpush.js';
import { STORE_NAMES } from './stores.js';

/**
 * 새 인수인계가 올라오면 구독한 기기로 푸시를 보낸다.
 *
 * 1분마다 Firestore 를 확인하는 방식이다. 앱이 Worker 를 직접 부르게 하면 즉시 보낼 수
 * 있지만, 저장소가 공개라 Worker 주소가 그대로 드러나고 아무나 가짜 알림을 쏠 수 있다.
 * 이쪽은 밖으로 열리는 게 없고 대신 최대 1분 늦는다.
 *
 * 앱 쪽 화면 안 알림(useHandoffAlerts)과 겹치지 않는다 — 그건 앱이 켜져 있을 때,
 * 이건 앱이 꺼져 있을 때를 맡는다.
 */

const ALL_STORES = '*';

function summarize(handoff) {
  const sections = Array.isArray(handoff.sections) ? handoff.sections : [];
  const first = sections.find((section) => section && String(section.content || '').trim());
  const text = first ? `${first.label} ${first.content}` : handoff.rawText || '';
  const oneLine = String(text).replace(/\s+/g, ' ').trim();
  if (!oneLine) return '내용 없음';
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}

function buildPayload(handoff) {
  const urgent = /#긴급|#급/.test(handoff.rawText || '');
  const storeName = STORE_NAMES[handoff.storeId] || handoff.storeId || '지점';
  return {
    title: `${urgent ? '🚨 ' : '📝 '}${storeName} 인수인계`,
    body: `${handoff.author || '미입력'} · ${summarize(handoff)}`,
    storeId: handoff.storeId,
    handoffId: handoff.id,
    urgent,
  };
}

function wants(subscription, storeId) {
  const stores = Array.isArray(subscription.stores) ? subscription.stores : [];
  return stores.includes(ALL_STORES) || stores.includes(storeId);
}

function isUsable(subscription) {
  return Boolean(subscription.endpoint && subscription.p256dh && subscription.auth);
}

export async function run(env) {
  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  };
  if (!vapid.publicKey || !vapid.privateKey) {
    console.log('VAPID 키가 없다. wrangler secret put 으로 넣어야 한다.');
    return { sent: 0, reason: 'no-vapid' };
  }

  const client = createClient(env.FIREBASE_PROJECT_ID, env.FIREBASE_API_KEY);

  const cursor = await readCursor(client);
  if (cursor === null) {
    // 첫 실행. 여기서 과거 글을 다 보내면 폰이 폭발한다 — 기준선만 잡고 끝낸다.
    await writeCursor(client, Date.now());
    console.log('첫 실행 — 기준 시각만 기록했다.');
    return { sent: 0, reason: 'primed' };
  }

  const handoffs = await fetchNewHandoffs(client, cursor);
  if (handoffs.length === 0) return { sent: 0, reason: 'no-new' };

  const subscriptions = (await fetchSubscriptions(client)).filter(isUsable);
  const stale = new Set();
  let sent = 0;

  for (const handoff of handoffs) {
    const payload = buildPayload(handoff);
    const targets = subscriptions.filter(
      (subscription) =>
        wants(subscription, handoff.storeId) &&
        // 내가 올린 글이 내 폰으로 되돌아오지 않게 한다
        !(handoff.deviceId && subscription.deviceId === handoff.deviceId)
    );

    const results = await Promise.allSettled(
      targets.map((subscription) => sendPush(subscription, payload, vapid, { urgent: payload.urgent }))
    );

    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') {
        console.log('발송 실패:', result.reason?.message || result.reason);
        return;
      }
      if (result.value.gone) {
        stale.add(targets[index].id);
        return;
      }
      if (result.value.ok) sent += 1;
      else console.log('푸시 서버 거절:', result.value.status, targets[index].id);
    });
  }

  // 죽은 구독은 지운다. 안 지우면 매번 헛발송하고 로그만 쌓인다.
  for (const id of stale) {
    await deleteSubscription(client, id).catch((error) => console.log('구독 삭제 실패:', error.message));
  }

  const newest = handoffs.reduce((max, h) => Math.max(max, h.createdAt || 0), cursor);
  await writeCursor(client, newest);

  console.log(`새 인수인계 ${handoffs.length}건 → 발송 ${sent}건, 만료 구독 ${stale.size}건 정리`);
  return { sent, handoffs: handoffs.length, removed: stale.size };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      run(env).catch((error) => {
        console.log('실행 실패:', error.message);
      })
    );
  },

  // 설정이 제대로 됐는지 눈으로 확인하는 용도. 비밀값은 내보내지 않는다.
  async fetch(request, env) {
    const url = new URL(request.url);

    // 설치할 때 한 번 쓰는 열쇠 만들기.
    // 부를 때마다 새로 만들어 보여줄 뿐 어디에도 저장하지 않는다 —
    // 그래서 실제로 쓰고 있는 열쇠와는 아무 상관이 없다.
    if (url.pathname === '/genkey') {
      const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
      let binary = '';
      for (let i = 0; i < raw.length; i += 1) binary += String.fromCharCode(raw[i]);
      const publicKey = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const { d: privateKey } = await crypto.subtle.exportKey('jwk', pair.privateKey);
      return new Response(
        [
          '=== 새 열쇠 한 쌍 ===',
          '',
          '① 비밀 열쇠 — Cloudflare 설정의 VAPID_PRIVATE_KEY 에 넣으세요.',
          '   (남에게 보여주면 안 됩니다)',
          `   ${privateKey}`,
          '',
          '② 공개 열쇠 — 이건 공개돼도 안전합니다. 그대로 알려주시면 앱에 넣습니다.',
          `   ${publicKey}`,
          '',
          '넣고 나면 이 주소는 다시 안 쓰셔도 됩니다.',
        ].join('\n'),
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    if (url.pathname !== '/health') {
      return new Response('ESC Admin 인수인계 푸시 발송기 — 1분마다 자동 실행됩니다.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    try {
      const client = createClient(env.FIREBASE_PROJECT_ID, env.FIREBASE_API_KEY);
      const [cursor, subscriptions] = await Promise.all([
        readCursor(client),
        fetchSubscriptions(client),
      ]);
      return Response.json({
        vapid: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
        cursor: cursor === null ? '아직 없음 (첫 실행 전)' : new Date(cursor).toISOString(),
        subscriptions: subscriptions.length,
      });
    } catch (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  },
};
