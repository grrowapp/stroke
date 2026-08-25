# connect-portal-and-strokes

## Why

統合の狙いは、**プロジェクトを起こす側と、起きたプロジェクトを見張る側を1つにする**ことである。ところが流れの両端が切れている。

- **入口**: `/projects` の **作成** ボタンは非活性で、ストロークへ入る道が無い。`project-directory` の「実処理は接続先の別プロジェクトが担う」という統合前の前提によるもので、統合でその「別プロジェクト」は同一アプリ内の `/strokes` として実在するようになり、非活性の理由は成立しなくなった
- **出口**: 承認は proposal.md を生成して終わり、工程が途切れる。生成されたプロジェクトは `.spec-workflow/` を持たないため一覧に現れず、承認の瞬間に行方不明になる

入口と出口は一続きの流れ（作成→モーダル→承認→一覧に戻り steering が裏で走る）であり、片方だけでは動く姿にならないため、1つの change で実装する。

## What Changes

設計は資料2枚が持つ（spec-workflow の approval で確定）。この change はそれを仕様と実装に落とす。

**入口** — [`docs/specs/plan/portal-stroke-entrance.md`](../../../docs/specs/plan/portal-stroke-entrance.md)（ADR-0009/0010）:

- 作成ボタンは**ただのボタン**にする。サーバーの可否判定の仕組みから作成を外し（理由コード `target-undecided` と `DirectoryActions.create` を削除）、仕組みは登録専用に残す
- 押すと **@nuxt/ui `UModal`**（fullscreen・閉じ操作なし）でストローク3画面（概要入力→AI と往復→proposal 確認）を**最後まで**行う。器は自作しない。開き方（パスルーティング / components 起動）は実装の最後に決める

**出口** — [`docs/specs/plan/portal-stroke-exit.md`](../../../docs/specs/plan/portal-stroke-exit.md)（ADR-0011）:

- セッションとプロジェクトの置き場を **`SPEC_WORKFLOW_SHARED_ROOT`** に統一する
- **proposal.md はサーバーのコードが作らない。** claude 自身がセッション時点から `docs/` 配下に書く
- **承認＝セッションディレクトリをプロジェクト名へ rename** して昇格させるだけ（生成もファイル移動も無し）。画面はモーダルを閉じて一覧へ戻る
- **`invokeAi` を引数化**する。呼び出し側が直前に設定 JSON を引き、起動定義・prompt・cwd を渡す1系統。承認処理は `--mcp-config`（生成先パスから導出した JSON 文字列）と steering 用 prompt・cwd＝生成先で、完了を待たずに呼ぶ
- **実行の記録**: 起動時にメモリへ session-id ＝ running を登録し、timeout で false に変える。文書を提出し終えた claude が API 経由で提出を告知し、その API が記録を消す（＝完了）。**サーバーの巡回**が false の session-id を API で拾ってリトライをかける
- 設定に足すのは **steering 用の定型 prompt 1キー**（mcp-config は設定に持たず導出）

## Capabilities

### New Capabilities

- `steering-stage`: 承認後の次工程。開始のきっかけ（承認の成功）、起動する claude の形（別セッション・`--mcp-config` で本家 MCP・作業場所は生成されたプロジェクト）、実行の記録と巡回リトライを規定する

### Modified Capabilities

- `project-directory`: 「登録と作成は非活性の入口として持つ」— 非活性は登録だけになる。「作成は接続先が無ければ行えず、その状態を画面に出す」— 廃止相当
- `project-generation`: プロジェクトの作り方が「新規生成」から「セッションディレクトリの rename 昇格」に変わる。proposal.md はセッション時点から docs/ 配下に claude が書く
- `ai-invocation`: 呼び出しの引数化（起動定義・prompt・cwd を呼び出し側が渡す）と、承認処理からの `--mcp-config` 付き呼び出しの追加
- `agent-api`: 提出告知の口・retry 対象一覧の口の追加。A7 の受理でサーバーが proposal.md を書く挙動の廃止

`stroke-session` は変えない。概要入力画面そのものは不変で、そこへ至る入口が増えるだけである。

## Impact

- サーバー: `server/utils/control/actions.ts`・`shared/types.ts`（作成の可否判定の撤去）／`approve.post.ts`・`project.ts`・`session-store.ts`（rename 昇格・proposal 保存の廃止）／`ai.ts`・`claude.ts`・`invoke-agent.get.ts`（引数化・実行の記録）／提出告知・retry 対象の API 2口と巡回の新設
- 画面: `app/pages/projects/index.vue`（ただのボタン化・モーダル起動）／`app/pages/strokes/**` 3画面（UModal の中身へ）／proposal 確認画面（承認成功でモーダルを閉じて一覧へ）
- 設定: `nuxt.config.ts`・`docs/specs/core/settings-reference.md` — 置き場の `SPEC_WORKFLOW_SHARED_ROOT` 統一と steering 用 prompt の追加。設定の正の改定には change とユーザー承認が要る（ADR-0004）
- specs 文書の追随（現実装の記述が変わる）: `docs/specs/api/api-contract.md`（A7「サーバが書く」・承認 409 の生成前提）／`docs/specs/architecture/question-flow.md`（proposal.md を書く Note）／`docs/specs/architecture/session-workflow.md`（セッション置き場のパス）
- `docs/adr/0009` / `0010` / `0011` — この change の起点となった決定

**前提**: 設計資料2枚（portal-stroke-entrance / portal-stroke-exit）の spec-workflow 承認が実装着手の前提。

**吸収した change**: `surface-generated-projects`（生成プロジェクトの可視化。ADR-0011 で出口側へ引き継ぎ）、`start-steering-after-approval`（出口側。ADR-0011 起点。2026-08-25 に再統合——入口と出口は一続きの流れで、分けると動く姿にならないため）。
