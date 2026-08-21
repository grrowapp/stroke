# Proposal — implement-portal-mvp

## Why

`steering-dashboard-portal` で stroke-board の何を作るかは決まったが、リポジトリには計画文書しか無く、動くものが1つも無い。「起きたことに気づき、そこから対象ドキュメントを開く」という雇う仕事が、まだ1度も成立していない。

決まった範囲のうち **中身が未決のもの（登録・作成）を外し、雇う仕事が端から端まで通る最小の一式**を実装する。

## What Changes

- **base2 を実装リポジトリにする** — `git init`、Nuxt4（SSR あり）+ Nuxt UI + Tailwind の初期化、yarn 4、`imports: { autoImport: false }` と `components.dirs: []`
- **接点層** — 親パスの走査（`.spec-workflow` を持つディレクトリ）、`activeProjects.json` の読み取り、本家 REST クライアント、本家 WebSocket クライアント
- **制御層** — 受信スナップショットと前回値の比較、通知4種の生成、ブラウザ向け WebSocket 配信
- **上層の画面** — 通知（プロジェクト / 種別 / 内容 / 最終更新 の4列）、プロジェクト一覧（アクティブが上・未接続は非活性）、タブナビゲーション、画面内トースト
- **下層の画面** — 仕様書 / ステアリング / タスク / 承認 の4画面と左サイドバー。通知行からこの4画面へ直行する
- **design token を本家 v2.2.5 に合わせる** — Nuxt UI のテーマ機構で再現できるかを実装の最初に確認する

**BREAKING** なし。stroke-board は本家とは別のアプリケーションで、本家に変更を加えない。

### 承認依頼の飛び先について（本家ソースで確認した訂正）

`ApprovalRequest` は `category: 'spec' | 'steering'` を持ち、承認依頼は仕様ドキュメントだけでなくステアリング文書にも立つ（`src/dashboard/approval-storage.ts` / `src/tools/approvals.ts`）。本家の `ApprovalsPage` は `filePath` の中身を取得して画面内に描画しており、**承認依頼の飛び先は承認画面**である。仕様書画面へ飛ばすと承認の文脈が落ちる。

ADR-0002 の「ステアリング文書の**更新**は検出できない」は成立するが、「ステアリング文書の**承認依頼**は通知になる」はそれとは別で、成立する。

🔶 確認したのは手元 checkout の v2.2.7 ソース。基準の v2.2.5 はタグが無く差分を取れていない。

### MVP から外すもの（決まっているが今回入れないもの）

- **プロジェクトの登録・作成の中身** — 何をどう作り・どう登録するかが未決（product.md の Open Questions）。**非活性の入口だけ**を置く
- **設定画面** — 本家 URL と親パスは環境変数から読むため（tech.md）、MVP の時点で設定画面に出すものが無い
- **日本語と英語の2言語対応** — MVP は日本語のみ。ui.md の States が「各状態で何を表示するかは未決」であり、文言が固まる前にキー化しても無駄が出る
- **通知音** — 本家は外部URLの mp3 を直読みしており、そこまで真似るかが未決（ui.md）

いずれも恒久的な Out of Scope ではなく、後続の change に回す。恒久的に作らないもの（Jobs / Logs / Statistics、他ソースの集約、ワークフローの状態変更、通知の永続化、ユーザー概念、本家プロセスの起動監視、OS 通知）は product.md の Out of Scope のままである。

## Capabilities

### New Capabilities

- `project-directory`: 監視対象プロジェクトの母集合を作り、アクティブ / 未接続を判定して一覧に並べ、アクティブなプロジェクトの下層へ入場させる。登録・作成は非活性の入口として持つ
- `upstream-connection`: アクティブなプロジェクトごとに本家へ接続し、購読・切断・再接続を扱い、接続状態を画面に出す
- `notification-feed`: 本家から受け取ったスナップショットを前回値と比較して通知4種を生成し、プロジェクト横断の一覧に並べる
- `notification-toast`: 通知の発生時に画面内トーストを出す。本家と同じ形（右上固定・縦積み・5秒で自動消滅・種別4色・クリック不可）
- `project-workspace`: 下層のプロジェクト単位画面（仕様書 / ステアリング / タスク / 承認）を表示し、通知の行から対象へ直行させる

### Modified Capabilities

なし（`openspec/specs/` は空で、既存の capability が無い）。

## Impact

- **新規コード** — `app/`（画面）、`server/`（Nitro: 接点層と制御層）、`shared/`（共有型）。構造は structure.md の Directory Organization に従う
- **新規の設定ファイル** — `package.json` / `nuxt.config.ts` / `tsconfig.json` / `yarn.lock` / `.gitignore`
- **依存** — nuxt `^4.5` / @nuxt/ui `^4.10` / tailwindcss / zod / vitest / @playwright/test
- **外部システム** — 本家 spec-workflow-mcp v2.2.5 の REST API、WebSocket（`ws://<host>/ws?projectId=<id>`）、`SPEC_WORKFLOW_HOME` 配下の `activeProjects.json`、各プロジェクトの `.spec-workflow/`。**すべて読み取りのみ**
- **環境変数** — 本家ダッシュボードの URL、走査する親パス
- **既存資産** — 変更なし。本家にも `.spec-workflow/` にも書き込まない
- **ドキュメント** — 上記の承認カテゴリの事実を `docs/adr/` に残す
