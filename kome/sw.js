// お米の在庫帳の Service Worker：画面一式を端末に置いて、電波がなくても開けるようにする。
// データ（名簿・記録）はページ側の localStorage にあり、ここでは扱わない。
const CACHE = 'kome-2026-09-30';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('kome-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 手元にあればすぐ返し、裏で新しいものを取りに行って次回に備える
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const cached = await c.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return cached || (await fresh) || new Response('オフラインのため開けませんでした。電波のあるところで一度開いてください。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
