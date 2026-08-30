/**
 * 서비스워커 — 앱이 꺼져 있어도 알림을 띄우는 부분.
 *
 * 앱(탭)이 살아 있어야만 뜨는 화면 안 알림과 달리, 여기는 브라우저가 대신 깨워준다.
 * 그래서 카톡처럼 앱을 완전히 껐어도 알림이 온다.
 *
 * 번들에 들어가지 않고 그대로 배포되는 파일이라 최신 문법을 아껴 쓴다.
 */

self.addEventListener('install', () => {
  // 새 서비스워커를 곧바로 쓴다 — 알림 문구를 고쳤는데 며칠씩 옛날 게 뜨면 안 된다
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || '새 인수인계';
  // 하위 경로에 배포돼도 맞도록 등록 범위를 기준으로 만든다
  const base = self.registration.scope;
  const url = data.storeId ? `${base}#/store/${data.storeId}/board/handoff` : base;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: './icon-192.png',
      badge: './icon-192.png',
      lang: 'ko',
      // 같은 글이 두 번 와도 알림은 하나만 남는다
      tag: data.handoffId || 'handoff',
      // 긴급 건은 직접 닫기 전까지 남겨둔다
      requireInteraction: Boolean(data.urgent),
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // 이미 열려 있는 창이 있으면 그 창을 쓴다 — 탭이 계속 늘어나면 안 된다
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              // 창이 다른 출처로 넘어간 경우 등 — 포커스만 해도 목적은 이룬다
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
