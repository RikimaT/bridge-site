# bridge-site — 公開サイト配信リポジトリ

**総合学習教室ブリッジ**の公開Webサイト（rikima81.com）と公開アプリの配信専用リポジトリ。

## なぜ存在するか

本体リポジトリ `bridge-app` には経営文書・売上データが含まれるため**非公開化**する。
しかし GitHub Pages（無料プラン）は公開リポジトリでしか使えないため、
**Pagesで配信するファイルだけ**をこのリポジトリに分離した（2026-07-07 本人決定）。

## 配信しているもの

| パス | 中身 | ソースの正 |
|---|---|---|
| `/` | rikima81.com（プロフィールサイト） | `bridge-app/public-site/` |
| `/douga/` | プロンプトビデオメーカー | `bridge-app/ai-video-maker/` |
| `/kanri/` | 生徒管理アプリ（noindex） | `bridge-app/index.html`・`app.js`・`style.css`・`data/` |
| `/pr-video-maker/` | 金曜PR動画メーカー（PWA） | `bridge-app/pr-video-maker/` |
| `/pixi-ai/` | Pixi AI PC版（PWA） | `bridge-app/pixi-ai/` |

## 運用ルール（重要）

- **ソースの正は bridge-app**。このリポジトリを直接編集しない。
- bridge-app 側で上記ファイルを変更したら、同じ変更をここへコピーしてプッシュする
  （Claude Code のセッションは両リポジトリにアクセスできるので「bridge-siteにも同期して」と言えばよい。
  毎週月曜の週次レビューRoutineが同期漏れを検知する）。
- **機密情報（口座・APIキー・生徒情報・経営文書）は絶対に置かない**。ここは全世界に公開されている。

## 切替の状態

- [x] フェーズ1: コンテンツ移植・ステージング配信（`rikimat.github.io/bridge-site/`）
- [ ] フェーズ2: rikima81.com のCNAMEを bridge-app→bridge-site へ切替（本人在席時に実施）
- [ ] フェーズ3: bridge-app を非公開化（本人がSettings→Danger Zoneで操作）

デプロイは 23時〜7時(JST) のカーフューで停止し、翌朝7:15に自動再開する（bridge-appと同じルール）。
