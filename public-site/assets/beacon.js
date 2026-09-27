/*
 * 公開サイトの計測（bridge-app の webapp/SiteBeacon.gs が受け取る）
 * ページの表示と、外部へのリンクのクリックを「回数」として記録するだけ。
 * Cookie・端末ID・IPアドレス・検索語は扱わない。流入元はドメイン名だけ送る。
 * Do Not Track / Global Privacy Control が有効な人、ボット、ローカル確認では何も送らない。
 */
(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzeKwDS0BohvVL03aSQbEDhPNh5E4aD-uP5k5ZdngJIkf6nCHwDnDhacDFLoFI386OD/exec';
  try {
    var nav = window.navigator || {};
    if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.globalPrivacyControl === true) return;
    if (nav.webdriver) return;
    if (/bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(nav.userAgent || '')) return;
    if (location.hostname !== 'rikimat.github.io') return;
  } catch (e) { return; }

  function send(params) {
    var qs = ['app=hit'];
    for (var k in params) {
      if (Object.prototype.hasOwnProperty.call(params, k) && params[k]) {
        qs.push(k + '=' + encodeURIComponent(String(params[k]).slice(0, 150)));
      }
    }
    var url = ENDPOINT + '?' + qs.join('&');
    try {
      if (window.fetch) {
        window.fetch(url, { mode: 'no-cors', keepalive: true, credentials: 'omit', cache: 'no-store' })
          .catch(function () {});
        return;
      }
    } catch (e) { /* 古いブラウザは画像で送る */ }
    try { (new Image()).src = url; } catch (e2) {}
  }

  function referrerHost() {
    try {
      if (!document.referrer) return '';
      var h = new URL(document.referrer).hostname;
      return h === location.hostname ? '' : h;
    } catch (e) { return ''; }
  }

  function landingRef() {
    try {
      var sp = new URLSearchParams(location.search);
      return sp.get('ref') || sp.get('utm_source') || '';
    } catch (e) { return ''; }
  }

  send({ t: 'view', p: location.pathname, s: referrerHost(), r: landingRef() });

  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || !a.hostname || a.hostname === location.hostname) return;
    send({ t: 'click', p: location.pathname, to: a.hostname + a.pathname });
  }, true);
})();
