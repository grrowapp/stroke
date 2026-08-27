# design — connect-portal-and-strokes

## Context

動機は proposal.md（Why）、要件は specs/ の delta、決定の経緯は ADR-0009/0010/0011 と spec-workflow 承認済み requirements（2026-08-25）が持つ。ここでは現状のコードとの対応だけを押さえる。

| 場所 | 今の形 |
|---|---|
| `server/utils/control/actions.ts`・`shared/types.ts` | `resolveDirectoryActions()` が登録・作成の可否を固定値で返す。`DirectoryActions` と理由コード |
| `app/pages/projects/index.vue` | 作成ボタンは `:disabled="!actions?.create.available"` |
| `app/pages/strokes/**` | 3画面が素の独立ページ。API 参照は `/api/strokes/:id/...` |
| `server/utils/stroke/settings.ts`・`paths.ts` | 保存先が2本（`NUXT_SESSIONS_ROOT` / `NUXT_PROJECTS_ROOT`） |
| `server/utils/stroke/ai.ts` | `invokeAi(sessionId)`。起動定義・定型・cwd を中で導出。失敗は `invocation: 'failed'` を直接書く |
| `server/utils/stroke/claude.ts` | `runClaude()` が `useRuntimeConfig()` を中で引く |
| `server/utils/stroke/project.ts` | `generateProject()` が `mkdir` + `docs/proposal.md` を書く |
| `server/api/strokes/[id]/proposal.post.ts` | A7 が `writeProposal()` でセッション直下の `proposal.md` を書く |
| `shared/stroke.ts` | `Invocation = 'running' | 'idle' | 'failed'` の3値 |

## Goals / Non-Goals

**Goals:**

- 一覧の作成 → モーダルのストローク → 承認 = rename 昇格 → 一覧へ戻り、裏で steering が走る、を1本で通す
- AI の実行管理（起動・完了検知・タイムアウト・リトライ上限）を invokeAi に集約し、`invocation` の書き込みを A8 経由に一本化する
- U 系 API を `/api/sessions` 系へ移し、capability を6つに畳む

**Non-Goals:**

- ストローク3画面の中身と流れ（不変。器がモーダルになるだけ）
- `relocate-stroke-routes`（`/projects/create/**` への移設）— 別 change のまま
- steering 完了後の承認待ち・通知（既存の仕組みに乗るだけ）
- 登録の中身（未決のまま）

## Decisions

### D1: モーダルはページ遷移で開く

作成ボタンは概要入力のページへ遷移し、ページ自身が `UModal`（fullscreen・dismissible 無効）で画面全体を占める。親子ルートにはしない。リロードの復帰は URL が担う。**代替案**（components 起動）はセッション id の保存先を別に持つことになり、URL が既に持つ情報を二重化するため採らない。

### D2: 可否判定は仕組みごと消す

`resolveDirectoryActions()`・`DirectoryActions`・理由コードを型ごと削除し、画面は可否をサーバーに聞かない。作成は常に活性、登録は非活性固定。**代替案**（登録だけ判定を残す）は、常に同じ値を返す判定を残すことになり採らない。前提の欠けは概要投稿時の 503 として現れる（既存経路、不変）。

### D3: 保存先を1本にし、承認は rename＋巻き戻しで宙吊りを作らない

`settings.ts` の保存先2本を `SPEC_WORKFLOW_SHARED_ROOT` の1本にし、`sessionDir()` と `projectDir()` が同じ親を指す。承認は「衝突確認 → phase 書き換え → rename」。rename が失敗したら phase を `proposed` へ書き戻す。**`approved` かつ未改名の宙吊りを作らない**（specs: project/generation）。衝突確認は rename の前に行う——`rename` は空ディレクトリを黙って置き換えうるため EEXIST 任せにしない。

### D4: proposal の書き手を claude に一本化する

A7 は本文を検証して受理・配信するだけでファイルを書かない。claude がセッション時点から `docs/proposal.md` を書く（スキルに明記）。`readProposal()` の読み先を `docs/proposal.md` へ移し、`writeProposal()` を削る。書かずに A7 だけ提出された場合は「proposal が見つからない」として既存の 409 経路で現れる。

### D5: U13 は cwd を引数で受け取り、invokeAi が全部を担う

`invokeAi(id, run)` — `run = { launch, cwd, prompts, prepare? }`。起動定義・定型は U13 の実装が設定から引き、**cwd はキック側が U13 の引数として渡す**（画面・巡回は U12 の応答の path、承認処理は生成先の path）。U13 の応答は受理で即完結し、処理の実体（`running` 化・起動・完了検知・タイムアウト・上限判定）は非同期の invokeAi が担う。初回/継続の符合判定は invokeAi に残し、呼び出し側は定型の候補（初回・続き）を渡す。**代替案**（U13 が cwd を `:id` から導出）は、昇格後の対象と巡回の再キックで導出の分岐が要るため採らない。

### D6: `invocation` は4値、書き込みは A8 だけ

`Invocation` に `error` を加えて4値にし、`approved` の対象でも持つ。書き込みは A8（`POST /api/strokes/:id/submission`、値指定）経由で invokeAi だけが行う。完了は invokeAi が子プロセスの **output stream** で検知して `idle`（claude に告知させない）。タイムアウトで `failed`。リトライ回数は `state.json` 側に持ち、上限判定は invokeAi——上限到達なら起動せず `error`（終端。回復はユーザーの再実行 = 回数リセット、または削除）。**代替案**（メモリの実行記録を新設）はプロセス再起動で消えるため採らない。**代替案**（claude が A8 で完了を告知）は、並走している invokeAi が output stream を見れば足り、スキルへの依存が増えるだけなので採らない。

### D7: mcp-config は cwd から導出する

`--mcp-config` は JSON 文字列を直接受け取れる（実機確認済み）。steering の起動時に生成先パス（＝渡された cwd）から組み立てて args に足す。設定には持たず、ファイルも作らない。JSON の中身は本家 `spec-workflow-mcp` の起動方法を実機で確認して確定する。

### D8: 巡回はサーバー内 HTTP で U13 を叩く

`server/plugins/` の `setInterval`（`upstream.ts` と同じ形）。U12 の応答から `invocation === 'failed'` の件だけを取り、その path を cwd に添えて自身の U13 を HTTP で叩く。それ以外の判定・状態変更を持たない。

### D9: steering の初回は承認処理が U13 を叩く

承認処理（U10 実装）は rename 成功の直後、U13 を cwd＝生成先の path で叩き、完了を待たずに応答を返す。steering の定型は設定の1キー。ここで claude の会話が出来るため、以後の失敗は巡回の再キック（継続＝続きを促す定型）だけで作業が続く。

## Risks / Trade-offs

- **サーバー再起動で `running` が宙に浮く** → invokeAi の見張りはプロセス内にあり、実行中に再起動すると `running` のまま誰も `failed` に変えない。巡回は `failed` しか拾わないため放置される。→ 起動時（`server/plugins/`）に `running` の残骸を `failed` へ倒す処理を置き、巡回に拾わせる
- **リトライの failed ループ** → 環境起因の失敗は巡回が起こし直し続けるが、上限で `error` 終端に達し、ユーザーに引き渡される（判断済み）
- **保存先の共有で uuid と名前のディレクトリが並ぶ** → 一覧の走査条件（`.spec-workflow/` の有無）は不変のため画面には影響しない。セッション一覧（U12）は昇格後の対象も載せるが、これは巡回・再キックに必要な仕様である
- **claude が `docs/proposal.md` を書かない** → 既存の 409 経路で「proposal が見つからない」として現れる（D4）

## Migration Plan

1. 設定の改定案（保存先統一・steering の定型・リトライ上限）を `docs/specs/core/settings-reference.md` に対して出し、ユーザー承認を得る（ADR-0004）
2. 承認後に `settings.ts` / `nuxt.config.ts` を触る。以降の実装は保存先統一が前提
3. 既存セッションと `/opt/projects` の中身の引っ越しは行わない。統一後の保存先から作られるものだけがこの流れに乗る
4. U 系 path の移設は画面・スキル資産の参照と同時に切り替える（旧 path の互換は残さない）

## Open Questions

- 共有保存先の既定値・steering の定型の本文・リトライ上限の既定値——いずれも設定の値の話で、Migration 1 の承認手続きの中で決める
