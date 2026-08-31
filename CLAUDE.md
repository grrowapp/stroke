# CLAUDE.md

## Agent skills

### Issue tracker

作業は `openspec/changes/<change-id>/` 配下の OpenSpec change として管理する。詳細は `docs/agents/issue-tracker.md`。

**起票時の ticket**（1対1・ファイル名・後書き禁止の正は `docs/feature/overview.md`「対応の定義」。frontmatter と採用日・archive の運用は `docs/agents/issue-tracker.md` が正）:

- change-id は動詞始まりの `<動詞>-<対象>`（`create` / `add` / `update` / `fix` / `remove` の5つから選ぶ）
- change の起票時には ticket を併せて作る: `openspec/tickets/<change-id>.md`（2026-08-28 以降に起票する change に掛かる。それ以前の ticket 無し change に遡って作らない）
- ファイル名は change-id ＋ `.md`。feature 名の `/` ↔ `__` 置換ルールは**適用しない**
- 中身は frontmatter（`status`。`tags` は任意）＋起票時点の概要。**本文は以後一切追記しない**

**⚠ 参照の方向**（**規定の正は `docs/agents/issue-tracker.md` の「参照の方向」**。ここは注意喚起で、迷ったら必ずそちらを開く）:

- 序列は **docs（`docs/adr/` を除く `docs/`）> ADR（`docs/adr/`）> specs（`openspec/specs/`）**。ticket・steering（`.spec-workflow/steering/` の工程横断の指針文書）・change の artifact（proposal / specs / ui / design / tasks）はこの序列で引く（`docs/specs/` は docs 層であり、この「specs」ではない）
- ADR が**序列内で**引けるのは docs と specs のみ（序列の外の CLAUDE.md・CONTEXT.md はどの層からも引ける）
- **docs** は序列内の他層を参照しない（唯一の例外が specs への参照で、specs が docs へ追従する制約を示すためのもの）。ツールの設定・スキーマ・コードは序列の外の実体で、どの層からも事実として参照してよい
- 拠り所: **docs に記述があれば docs**。docs に無く ADR にあれば方向性の拠り所になるが、エージェントの解釈が混ざりうるため**盲信厳禁**（都度ユーザー確認）
- specs は docs・ADR に付随する「その時点の決めの物差し」で、**確定には入らない**
- 同層内は docs ↔ docs・ticket ↔ ticket のみ可。**ADR ↔ ADR・specs ↔ specs は禁止**（未確定が未確定を土台に枝葉を伸ばす連鎖を断つ）
- **逆流はない**: docs・ADR・specs が ticket・change・steering を根拠に参照することはない。change の作業が ticket を入力・規範として参照することもない（一覧の起点として ticket から artifact へ辿るのは可）
- CLAUDE.md は guidance と reference（序列の外。すべてを参照でき、どの層からも引ける）。CONTEXT.md は用語集で、ルール・決めは持たず、他を参照せず、どの文書からも用語の定義としてのみ引ける

**⚠ 更新対応**（**規定の正は `docs/agents/issue-tracker.md` の「更新対応」**）:

- specs へ delta を入れるとき、規定する上位資料（docs・ADR）があるなら**上位資料への整合反映までが change の責務範囲**。整合反映は design.md で提案し、ユーザー承認を持って許可される。承認前に上位資料を書き換えない
- specs が docs と食い違っていたら、**見つけた者が責任を持って** docs > ADR の規定に沿った specs へ直す
- ADR の内容が docs に確定したら、その ADR は**状態行を `archive` に書き換える**（ファイルは動かさない）。引き継ぎ先を docs の節まで、相対 markdown リンクで状態行に明示する。取りこぼす規約が残るなら archive にしない

### Triage labels

取りうる値は `docs/agents/triage-labels.md` の5つ。5つ以外の値を見つけたら5つのいずれかに直す（規定の正は `docs/agents/issue-tracker.md`「change を起票したら ticket も作る」）。

### Domain docs

単一コンテキスト — リポジトリ直下の `CONTEXT.md` 1本と `docs/adr/`。詳細は `docs/agents/domain.md`。

### Subagents

コンテキストを持ち込ませないことが目的なら、`fork` ではなく新規エージェントを使う。詳細は `docs/agents/subagents.md`。

## Dev サーバー

- 起動・ビルドなどの実行は **package.json の scripts 経由**（`yarn dev` / `yarn build` / `yarn test` …）で行う。`node .output/server/index.mjs` のような直接起動をしない
- ポートの既定は **3399**（8本中7本の worktree がこの値）。**固定ではなく、並走させる worktree はずらす**（pre5 は 3599）。同じ値が2箇所にある — ストロークの `claude.apiBaseUrl`（正は `docs/specs/core/settings-reference.md`）と `nuxt.config.ts` の `devServer.port`（起動時のビルド設定でストローク側設定ではないため settings-reference の対象外。`nuxt.config.ts` が実体）。**変えるときは必ず両方を揃えて変える**——片方だけ変えると、起動した claude は開いていないポートへ MCP 接続を試みる
- 3000 はこのマシンで別のプロセスが使用中。使わない。5000 は本家 spec-workflow の dashboard
- E2E の PORT_SLOT（`playwright.config.ts`）は worktree のディレクトリ名から slot を引き、STUB_PORT と APP_PORT を決める。slot 3 は欠番（APP_PORT が既定の dev ポート 3399 と被るため）。例: worktree `base3` は slot 6 → STUB 5699 / APP 3699
  - **欠番表は 3399 しか避けていない。** dev をずらした worktree では、そのポートが別 slot の APP_PORT と衝突しうる（pre5 の 3599 は slot 5 の APP_PORT と同じ）。dev と E2E を同時に走らせるときは確かめること

## Worktree 運用

worktree = `git worktree` で切った作業ディレクトリ。それぞれが**もとになった親ブランチ**を1つ持つ。

- 合流点はこの親ブランチ。main を直接の合流点にしない
- 成果のマージ先・追随の取り込み元・ユーザー指示で扱う対象は、いずれもこの親ブランチ
- 親ブランチが判定できないときは、推測せずユーザーに確認する
- 各 worktree は親ブランチを**取り込めるタイミングで自主的に** merge して追随する。親から worktree へ配ることはしない（作業途中の土台を動かさないため）
- 取り込みを先延ばしするほどコンフリクトが育つ。小さく頻繁に取り込むこと
- **main へのマージ**は、ユーザー指示を受けてから確認→承認を一回踏んで行う

## Docs

`docs/` 配下の目録。`docs/specs/` は**定義としての specs** の置き場で、`core`（構造・入れ物・設定）/ `api`（契約）/ `architecture`（流れ）/ `reference`（調べた事実）/ `plan`（未確定の検討）で区分する。以下、`docs/specs/*` の5区分 → `docs/feature/` → `docs/agents/` の順に並べる。`docs/adr/` は決めの記録で、一覧は置かない。

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
- `feature-workflow.md` — feature ワークフローの構造の記述（規定は `docs/feature/overview.md` が正）
- `question-flow.md` — 問いの往復（誰がいつ何を送り、状態がどう動くか）を図で示す
- `spec-screen-flow.md` — ポータル側: 仕様書画面の流れ
- `data-fetching.md` — 画面のデータ取得と SSR の設計

### `docs/specs/reference/`

- `stroke-modules.md` — stroke のモジュール（`useAgentQuestion` / `AgentQuestionModal`）の使い方
- `upstream-observations.md` — 本家 spec-workflow-mcp をソースから調べた事実（WS メッセージ9種・接続の制約・反映までの遅延）。方針は ADR-0006、基準バージョンは ADR-0008

### `docs/specs/plan/`

- `artifact-extension-plan.md` — 拡張 artifact の検討資料（未決定）
- `portal-stroke-entrance.md` — 入口の接合の対応方法（作成ボタン→ストローク概要入力。ADR-0009/0010 の確定先）
- `portal-stroke-exit.md` — 出口の接合の対応方法（承認→steering 工程の自動開始。ADR-0011 の確定先）
- `composables-library-replacement.md` — composables のライブラリ置換と集約の可否（置換3・集約2→1・据置5。spec-workflow 承認済み）
- `components-library-replacement.md` — components のライブラリ置換・再編・markdown 統一の可否（置換5・部分置換3・再編2→1・削除1・据置8 + MDC 統一。spec-workflow 承認済み）
- `next-agent-run.md` — エージェント実行の3区分への汎用化案（未着手）
- `mainline-merge.md` — 旧 stroke-board-frontier 統合の道筋（change 一覧・依存・区分の基準・終了条件）
- `structure-migration.md` — 構造の規範に対する現状の差分（移行課題）

### `docs/feature/`

- `overview.md` — feature のワークフロー定義（`__` 命名・器・工程・締め）。feature と仕様書の2レーンのうち **feature レーンの正**。`docs/specs/architecture/feature-workflow.md` と内容が重なるが、食い違ったら `overview.md` が勝つ（あちらも正を名乗っている。統合は change `adr0018-sub-update-feature-workflow` で行う）

### `docs/agents/`

- `issue-tracker.md` — OpenSpec 運用（change-id 命名・ticket 起票・参照の方向・artifact・更新対応・ブランチ）。**規定の正**
- `triage-labels.md` — triage の5ラベル
- `domain.md` — CONTEXT.md と ADR の運用
- `subagents.md` — subagent の使い分け
