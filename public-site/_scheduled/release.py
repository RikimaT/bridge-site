#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""予約記事の自動公開（bridge-site の pages.yml が毎朝のビルドで実行する。標準ライブラリのみ）

  python3 _site/_scheduled/release.py --site _site [--today YYYY-MM-DD] [--urls-out released.txt]

_site/_scheduled/manifest.json の記事のうち、公開日（日本時間）が今日までのものだけを _site/gas/<slug>/ に置き、
一覧（gas/index.html）・全記事のシリーズ目次と件数・sitemap.xml・gas/feed.xml を更新してから
_site/_scheduled を丸ごと消す（公開日前の記事を配信しないため）。
何度実行しても同じ結果になる（すでに載っている記事は二重に足さない）。
ソースの正は bridge-app の public-site/_scheduled/（原稿と生成器は bridge-app の tools/sitegen/）。
"""
import argparse
import datetime
import html
import json
import os
import re
import shutil
import sys

JST = datetime.timezone(datetime.timedelta(hours=9))
SERIES_BLOCK = re.compile(r'<div class="series">.*?</div>', re.S)
SERIES_ITEM = re.compile(r'<li><a href="\.\./([a-z0-9-]+)/">(.*?)</a></li>')
CARD = re.compile(r'<a class="card" href="([a-z0-9-]+)/">.*?</a>\n', re.S)


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def esc(s):
    return html.escape(s, quote=False)


def rfc822(date_str, hhmm='07:40'):
    d = datetime.datetime.strptime(date_str + ' ' + hhmm, '%Y-%m-%d %H:%M').replace(tzinfo=JST)
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return '%s, %02d %s %d %s +0900' % (days[d.weekday()], d.day, months[d.month - 1], d.year, d.strftime('%H:%M:%S'))


def release(site, today, urls_out=None):
    site = os.path.abspath(site)
    sched = os.path.join(site, '_scheduled')
    if not os.path.isdir(sched):
        print('予約記事はありません（_scheduled なし）')
        return []
    manifest_path = os.path.join(sched, 'manifest.json')
    if not os.path.isfile(manifest_path):
        # 予約の一覧が無い＝予約記事なし。予約フォルダだけは配信物から外す
        shutil.rmtree(sched)
        if urls_out:
            write(urls_out, '')
        print('予約記事はありません（manifest.json なし）')
        return []
    manifest = json.loads(read(manifest_path))
    base = manifest['base_url']
    gas = os.path.join(site, 'gas')
    posts = sorted(manifest.get('posts', []), key=lambda p: (p['date'], p['slug']))
    due = [p for p in posts if p['date'] <= today]

    # 1) 公開日が来た記事ページを置く
    for p in due:
        dst = os.path.join(gas, p['slug'])
        os.makedirs(dst, exist_ok=True)
        shutil.copyfile(os.path.join(sched, p['slug'], 'index.html'), os.path.join(dst, 'index.html'))

    # 2) 一覧ページにカードを足す（すでにあるカードは足さない）
    idx_path = os.path.join(gas, 'index.html')
    idx = read(idx_path)
    cards = CARD.findall(idx)
    new_cards = []
    for p in due:
        if p['slug'] in cards:
            continue
        cards.append(p['slug'])
        new_cards.append('  <a class="card" href="%s/"><span class="n">%02d</span><h2>%s</h2><p>%s</p></a>\n'
                         % (p['slug'], len(cards), esc(p['title']), esc(p['card'])))
    if new_cards:
        last = list(CARD.finditer(idx))[-1]
        idx = idx[:last.end()] + ''.join(new_cards) + idx[last.end():]
    total = len(cards)
    idx = re.sub(r'（全\d+本）', '（全%d本）' % total, idx)
    write(idx_path, idx)

    # 3) 全記事のシリーズ目次を作り直す（並びの基準は既存記事の目次。そこへ公開日順に足す）
    base_items = []
    for d in sorted(os.listdir(gas)):
        f = os.path.join(gas, d, 'index.html')
        if os.path.isfile(f):
            m = SERIES_BLOCK.search(read(f))
            if m and SERIES_ITEM.search(m.group(0)):
                base_items = SERIES_ITEM.findall(m.group(0))
                break
    items = list(base_items)
    have = {s for s, _ in items}
    for p in due:
        if p['slug'] not in have:
            items.append((p['slug'], esc(p['series_title'])))
            have.add(p['slug'])
    if len(items) != total:
        print('注意: 目次の本数(%d)と一覧のカード数(%d)が一致しません' % (len(items), total), file=sys.stderr)
    block = ('<div class="series">\n  <strong>実録シリーズ（全%d本）</strong>\n  <ol>\n%s\n  </ol>\n</div>'
             % (len(items), '\n'.join('    <li><a href="../%s/">%s</a></li>' % (s, t) for s, t in items)))
    for d in os.listdir(gas):
        f = os.path.join(gas, d, 'index.html')
        if os.path.isfile(f) and d != 'index.html':
            s = read(f)
            if SERIES_BLOCK.search(s):
                write(f, SERIES_BLOCK.sub(lambda m: block, s, count=1))

    latest = max([p['date'] for p in due], default=None)

    # 4) sitemap.xml
    sm_path = os.path.join(site, 'sitemap.xml')
    if os.path.isfile(sm_path):
        sm = read(sm_path)
        for p in due:
            loc = '%sgas/%s/' % (base, p['slug'])
            if '<loc>%s</loc>' % loc in sm:
                continue
            sm = sm.replace('</urlset>',
                            '  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>monthly</changefreq>\n'
                            '    <priority>0.8</priority>\n  </url>\n</urlset>' % (loc, p['date']))
        if latest:
            sm = re.sub(r'(<loc>%sgas/</loc>\s*<lastmod>)([0-9-]+)(</lastmod>)' % re.escape(base),
                        lambda m: m.group(1) + max(m.group(2), latest) + m.group(3), sm)
        write(sm_path, sm)

    # 5) RSS（新しい順に先頭へ）
    feed_path = os.path.join(gas, 'feed.xml')
    if os.path.isfile(feed_path):
        feed = read(feed_path)
        add = ''
        for p in sorted(due, key=lambda p: (p['date'], p['slug']), reverse=True):
            link = '%sgas/%s/' % (base, p['slug'])
            if '<link>%s</link>' % link in feed:
                continue
            add += ('  <item>\n    <title>%s</title>\n    <link>%s</link>\n    <guid isPermaLink="true">%s</guid>\n'
                    '    <description>%s</description>\n    <pubDate>%s</pubDate>\n  </item>\n'
                    % (esc(p['title']), link, link, esc(p['description']), rfc822(p['date'])))
        if add:
            feed = re.sub(r'(<lastBuildDate>.*?</lastBuildDate>\n)', lambda m: m.group(1) + '\n' + add, feed, count=1)
        if latest:
            feed = re.sub(r'<lastBuildDate>.*?</lastBuildDate>', '<lastBuildDate>%s</lastBuildDate>' % rfc822(latest),
                          feed, count=1)
        write(feed_path, feed)

    # 6) 公開日前の記事を配信物から外す
    shutil.rmtree(sched)

    # 7) 検索エンジンへの通知用に、公開日が直近2日以内の記事URLを書き出す（毎朝のビルドで重複通知しないため）
    if urls_out:
        t = datetime.date.fromisoformat(today)
        recent = ['%sgas/%s/' % (base, p['slug']) for p in due
                  if (t - datetime.date.fromisoformat(p['date'])).days <= 2]
        if recent:
            recent.append(base + 'gas/')
        write(urls_out, ''.join(u + '\n' for u in recent))

    print('%s 時点: 予約 %d 本のうち %d 本を公開（一覧 %d 本）' % (today, len(posts), len(due), total))
    for p in due:
        print('  %s  %s' % (p['date'], p['slug']))
    return due


def main(argv=None):
    ap = argparse.ArgumentParser(description='予約記事の自動公開')
    ap.add_argument('--site', required=True, help='組み立て中のサイトのディレクトリ（_site）')
    ap.add_argument('--today', help='YYYY-MM-DD。省略時は日本時間の今日')
    ap.add_argument('--urls-out', help='新しく公開した記事のURLを書き出すファイル（IndexNow用）')
    a = ap.parse_args(argv)
    today = a.today or datetime.datetime.now(JST).date().isoformat()
    release(a.site, today, a.urls_out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
