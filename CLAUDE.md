# CLAUDE.md

## Agent skills

### Issue tracker

- `docs/agents/issue-tracker.md` の「更新対応）`
  - specs へ delta を入れるとき、規定する上位資料（docs・ADR）があるなら**上位資料への整合反映までが change の責務範囲**。整合反映は design.md で提案し、ユーザー承認を持って許可される。承認前に上位資料を書き換えない
  - specs が docs と食い違っていたら、**見つけた者が責任を持って** docs > ADR の規定に沿った specs へ直す
  - ADR の内容が docs に確定したら、その ADR は**状態行を `archive` に書き換える**（ファイルは動かさない）。引き継ぎ先を docs の節まで、相対 markdown リンクで状態行に明示する。取りこぼす規約が残るなら archive にしない

## Dev サーバー

- 起動・ビルドなどの実行は **package.json の scripts 経由**（`yarn dev` / `yarn build` / `yarn test` …）で行う。`node .output/server/index.mjs` のような直接起動をしない
- ポートの既定は **3399**。**固定ではなく、並走させる worktree はずらす**（2026-08-31 時点で 3399 以外は pre5 の 3599 だけ）。同じ値が2箇所にある — ストロークの `claude.apiBaseUrl`（正は `docs/specs/core/settings-reference.md`）と `nuxt.config.ts` の `devServer.port`（起動時のビルド設定でストローク側設定ではないため settings-reference の対象外。`nuxt.config.ts` が実体）。**変えるときは必ず両方を揃えて変える**——片方だけ変えると、起動した claude は開いていないポートへ MCP 接続を試みる
- 3000 はこのマシンで別のプロセスが使用中。使わない。5000 は本家 spec-workflow の dashboard
- E2E の STUB_PORT / APP_PORT（`playwright.config.ts`）は**実行のたびに 50000 から上へ空きを探して取る**（上限 60000）。固定値ではないので、worktree を並べて同時に `yarn test:e2e` を回してよい。どのポートを使ったかは Playwright の起動ログに出る
  - dev サーバーのポートとは要件が違う。人がブラウザで繋ぎに行く dev は既定を決めて worktree ごとにずらすが、E2E は立てて捨てるだけなので空きを取る

## Worktree 運用

worktree = `git worktree` で切った作業ディレクトリ。それぞれが**もとになった親ブランチ**を1つ持つ。

- 合流点はこの親ブランチ。main を直接の合流点にしない
- 成果のマージ先・追随の取り込み元・ユーザー指示で扱う対象は、いずれもこの worktree のブランチ
- 親ブランチが判定できないときは、推測せずユーザーに確認する
- 各 worktree は親ブランチに更新が入っていたら、**取り込めるタイミングで自主的に** `git rebase develop` して追随する
- 取り込みを先延ばしするほどコンフリクトが育つ。**小さく頻繁に**取り込むこと
- **main・develop へのマージ**は、ユーザー指示を受けてから確認→承認を一回踏んで行う
- **change の実装（apply）は、この worktree のブランチへ直接コミットする**

## Docs

`docs/` 配下の目録。`docs/specs/` は**定義としての specs** の置き場で、`core`（構造・入れ物・設定）/ `api`（契約）/ `architecture`（流れ）/ `reference`（調べた事実）/ `plan`（未確定の検討）で区分する。以下、`docs/specs/*` の5区分 → `docs/agents/` の順に並べる。`docs/adr/` は決めの記録で、一覧は置かない。

機能的 specs（Requirement + Scenario）は `openspec/specs/` にある（確定には入らない。扱いは `docs/agents/issue-tracker.md`「参照の方向」）。

### `docs/specs/core/`

- `system-structure.md` — 構造の定義。統合後のあるべき配置の規範（ディレクトリ構造・画面とサーバーの区切り・共有型）
- `schema.md` — 入れ物の形と検証の規定（長さ・件数の上限）
- `settings-reference.md` — ストローク側設定の**正**。ここに無いものは設定ではない（規定は同ファイル冒頭）。ポータル側の環境変数3件（`NUXT_UPSTREAM_BASE_URL` / `NUXT_SPEC_WORKFLOW_HOME` / `NUXT_SYNC_INTERVAL_MS`）は未統合（README「設定（ポータル側）」）
- `file-component.md` — コンポーネント個別のリファレンス（props と参照元）10件。うち3件（`SbIcon` / `UpstreamIcon` / `MarkdownNodes`）は削除済みで未追従
- `file-components.md` — `app/components/` 全19本の棚卸しと規範への対応。`file-component.md` と対象が重なるので、件数が食い違ったらこちらを正とする
- `file-composables.md` — `app/composables/` 全9本の棚卸しと規範（関心単位の平置き）への対応
- `server-structure.md` — server/utils の棚卸しと規範への対応

### `docs/specs/api/`

- `contract.md` — サーバ API の契約。画面・エージェントとサーバの境界
- `mcp-tools.md` — MCP ツールの契約。claude プロセスとサーバの境界（ツール8本・結果の形・`errorCode`・工程ごとの公開・接続 token）

### `docs/specs/architecture/`

- `session-workflow.md` — セッションのワークフロー定義（store・スキル・配線・実測で確定した制約）
- `question-flow.md` — 問いの往復（誰がいつ何を送り、状態がどう動くか）を図で示す
- `spec-screen-flow.md` — ポータル側: 仕様書画面の流れ
- `data-fetching.md` — 画面のデータ取得と SSR の設計

### `docs/specs/reference/`

- `stroke-modules.md` — stroke のモジュール（`useAgentQuestion` / `AgentQuestionModal`）の使い方
- `upstream-observations.md` — 本家 spec-workflow-mcp をソースから調べた事実（WS メッセージ9種・接続の制約・反映までの遅延）。方針は ADR-0006、基準バージョンは ADR-0008
- `mdc-observations.md` — `@nuxtjs/mdc` を実測で調べた事実（実装の途中で崩れた前提7件・パーサを変異させて測った検知力）。件ごとに、踏んだときに落ちるテストを併記する
- `claude-p-observations.md` — `claude -p` を実機で叩いて調べた事実（失敗した往復も履歴に残る・`--add-dir` の CLAUDE.md・可変長フラグと `--`・保存先の権限）。規定は ADR-0001 と `openspec/specs/agent/invocation/`、ここはその根拠

### `docs/specs/plan/`

- `feature/overview.md` — feature のワークフロー定義（`__` 命名・器・工程・締め。2レーンのうち feature レーンの正）
- `feature/feature-workflow.md` — 上の旧版。こちらも正を名乗っているが、食い違ったら `feature/overview.md` が勝つ。統合は change `adr0018-sub-update-feature-workflow` で行う
- `artifact-extension-plan.md` — 拡張 artifact の検討資料（未決定）
- `portal-stroke-entrance.md` — 入口の接合の対応方法（作成ボタン→ストローク概要入力。ADR-0009/0010 の確定先）
- `portal-stroke-exit.md` — 出口の接合の対応方法（承認→steering 工程の自動開始。ADR-0011 の確定先）
- `composables-library-replacement.md` — composables のライブラリ置換と集約の可否（置換3・集約2→1・据置5。spec-workflow 承認済み）
- `components-library-replacement.md` — components のライブラリ置換・再編・markdown 統一の可否（置換5・部分置換3・再編2→1・削除1・据置8 + MDC 統一。spec-workflow 承認済み）
- `next-agent-run.md` — エージェント実行の3区分への汎用化案（未着手）
- `mainline-merge.md` — 旧 stroke-board-frontier 統合の道筋（change 一覧・依存・区分の基準・終了条件）
- `structure-migration.md` — 構造の規範に対する現状の差分（移行課題）

### `docs/agents/`

- `issue-tracker.md` — OpenSpec 運用（change-id 命名・ticket 起票・参照の方向・artifact・更新対応・ブランチ）。**規定の正**
- `triage-labels.md` — triage の5ラベル
- `domain.md` — CONTEXT.md と ADR の運用
- `subagents.md` — subagent の使い分け
