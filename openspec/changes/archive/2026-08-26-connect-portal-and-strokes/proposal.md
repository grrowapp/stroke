# connect-portal-and-strokes

## Why

統合の狙いは、プロジェクトを起こす側と見張る側を1つにすることだが、流れの両端が切れている。**入口**: `/projects` の作成ボタンは非活性で、ストロークへ入る道が無い。非活性の根拠だった「接続先の別プロジェクト」は統合で同一アプリ内の `/strokes` になり、理由が消滅した（ADR-0009/0010）。**出口**: 承認は proposal.md を生成して終わり、生成されたプロジェクトは `.spec-workflow/` を持たないため一覧に現れず、承認の瞬間に行方不明になる（ADR-0011）。入口と出口は一続きの流れなので、1つの change で繋ぐ。

設計は spec-workflow 承認済みの requirements（2026-08-25、`connect-portal-and-strokes`）が正。

## What Changes

- 作成ボタンは常に押せるただのボタンになり、押すとオーバーレイ上のモーダル（閉じる操作なし・リロードで復帰）でストローク3画面を最後まで行う。可否判定は仕組みごと廃止する（**BREAKING**: `DirectoryActions` と理由コードの削除。登録の可否も返さない）
- セッションの保存先とプロジェクトの生成先を `SPEC_WORKFLOW_SHARED_ROOT` の1設定に統一し、**承認＝セッションディレクトリの rename 昇格**にする。proposal.md は claude がセッション時点から `docs/proposal.md` に書き、サーバーは書かない（**BREAKING**: A7 受理時の保存挙動の廃止）
- 承認の成功後、承認処理が steering の claude を裏で起こす（U13 を cwd＝生成先で叩く）。実行の記録は `state.json` の `invocation` に終端値 `error` を加えた4値で持ち、完了は invokeAi が output stream で検知、タイムアウトで `failed`、リトライ上限到達で `error`。`failed` は巡回が拾って起こし直す
- API を使い手で分ける: U 系・W 配信の path を `/api/sessions` 系へ変える（**BREAKING**）。A 系は不変のまま **A8**（`invocation` の操作口。叩くのは invokeAi だけ）を追加。U13 は cwd を引数で受け取り、U12 は各件に path を載せ、U11 は `DELETE` にする
- capability を6つに畳み直す（ストローク側5つ＋`portal/batch` 新設）

**確定事項（decisions.md）との差分**: ①「承認時に `/opt/projects/<name>/` を作る」→ 作らず rename 昇格にする ②「proposal はセッション直下 `proposal.md`」→ セッション時点から `docs/proposal.md` ③ 保存先2箇所 → 共有1箇所。いずれも ADR-0011 と承認済み requirements による更新。

## Capabilities

### New Capabilities

- `stroke/frontier`: stroke-session ＋ proposal-review を畳む。作成の入口→モーダルの3画面→承認＝rename 昇格→一覧へ戻るまでのフロー一式
- `project/generation`: project-generation を移す。proposal の書き手は claude、承認は改名だけ、`.spec-workflow/` の内部構造は作らない
- `agent/invocation`: ai-invocation を移す。起動定義・定型・cwd の引数化、`invocation` 4値の管理（output stream での完了検知・タイムアウト・リトライ上限）
- `portal/batch`: 新設。U12 の `invocation` が `failed` のものだけを拾い、U13 を叩く巡回
- `api/stroke`: agent-api を移す。エージェントの口（A 系、path 不変）。A8 の追加と A7 保存挙動の廃止

### Modified Capabilities

- `api/session`: セッションの存廃だけの口から、画面・管理の口（U 系9本＋W 配信2本）へ広げる。path を `/api/sessions` 系へ、U11 は `DELETE`、U12 に path、U13 に cwd 引数
- `project-directory`: 作成にまつわる2要件と可否判定の仕組み（登録の分も）を削除。走査・4列・並び・入場・永続化しないは不変
- `stroke-session` / `proposal-review` / `project-generation` / `ai-invocation` / `agent-api` / `api/overview` / `api/answer` / `api/send-back` / `api/invoke-agent`: 畳み先（上記の新 capability）へ全要件を移して廃止する

## Impact

- サーバー: `settings.ts`・`paths.ts`（保存先統一）／`actions.ts`・`shared/types.ts`（可否判定の撤去）／`session-store.ts`・`project.ts`・`approve.post.ts`（rename 昇格・保存廃止・steering 起動）／`ai.ts`・`claude.ts`・`invoke-agent.get.ts`（引数化・invocation 4値・上限）／`server/api/strokes/**` の U 系ルート移設と A8 新設／`server/plugins/`（巡回・startup-checks）
- 画面: `app/pages/projects/index.vue`・`app/pages/strokes/**` 3画面・API 参照 path の追随
- スキル資産: `assets/.claude/skills/`（guidance に `docs/proposal.md` を書く責務を明記、U3 参照 path の変更）
- 設定: `nuxt.config.ts`・`docs/specs/core/settings-reference.md` — 保存先統一・steering の定型・リトライ上限（ADR-0004: change とユーザー承認が要る）
- 文書: `docs/specs/api/api-contract.md`・`question-flow.md`・`session-workflow.md` の追随、`openspec/specs/` の畳み込み再編
- 起点の決定: ADR-0009 / 0010 / 0011、spec-workflow 承認済み requirements（2026-08-25）
