// Bridge 生徒管理 Service Worker
// 方針: ネットワーク優先＋キャッシュフォールバック。
// 「古い画面が出続ける」事故を防ぐため、成功したレスポンスで常にキャッシュを更新し、
// オフライン・障害時だけキャッシュを返す。GAS通信（POST）は介入しない。
var CACHE = 'bridge-kanri-v1';
var SHELL = ['./', 'index.html', 'app.js', 'style.css', 'manifest.webmanifest', 'data/sales-history.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;                       // GAS へのPOSTは素通し
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;                    // CDN・GAS等の外部は素通し
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
