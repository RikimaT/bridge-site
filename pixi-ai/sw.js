/**
 * Pixi AI Service Worker
 * GitHub Pages配信時のオフライン起動対応（GAS配信時は index.html 側で登録しない）
 * 方針: ネットワーク優先（更新を即反映）→ 失敗時はキャッシュ。
 * 生成API（script.google.com）は別オリジンなのでキャッシュ対象外＝常にオンライン実行。
 */
'use strict';

const CACHE = 'pixi-ai-v1';
const ASSETS = [
  './',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // GAS APIなど外部はそのまま

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' })
          .then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Promise.reject(new Error('offline'))))
      )
  );
});
