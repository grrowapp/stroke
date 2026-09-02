# add-activated-phase 仕様

## 概要

stroke-board は、承認されたセッションをプロジェクトへ昇格させ、steering の claude を起こしてステアリング文書と承認依頼を作らせる。現在、昇格後の完成を記録する状態が無く、一覧の行は `.spec-workflow/` の有無、決着の配信は claude プロセスの終了（`invocation === 'idle'`）で「完了」を判定している。そのため、成果物ゼロで claude が正常終了しても完了扱いになり、承認依頼が無いのに「レビューする」が押せる。また `.spec-workflow/` は本家 MCP が接続した瞬間にできるため、最初の文書が書かれるまでの間（実測 37 分）、生成中のプロジェクトが完成として一覧に出て入場できる。

この変更は、`Phase` に `activated` を足して完成を記録し、一覧の行と決着の配信の両方を phase から判定するようにする。

## 用語

- **生成中**: `phase === 'approved'`。昇格したが、steering がまだ初回の承認依頼を出していない
- **完成**: `phase === 'activated'`。steering が初回の承認依頼を出した。レビューできる状態
- **承認依頼**: 本家 spec-workflow-mcp の `request-approval` が `<project>/.spec-workflow/approvals/` 配下に書く JSON ファイル
- **決着**: 生成中が終わったという合図（`done` または `failed`）。行の状態そのものではない

## 状態モデル

`Phase` は `stroking → proposed → approved → activated` の順で一方向に進む。`activated` は `approved` の後にだけ来る。

`state.json` の `activated` は `approved` と同じ項目を持つ（`projectName` 必須、`invocation`、`retries`、`runId`）。

phase の値の集合は `shared/stroke.ts` に1つだけ置く。判定は述語で表し、各所にイコール比較を足さない。

## 完成の記録（U15）

`POST /api/sessions/:id/activate` を新設する。`:id` は昇格後のプロジェクト名。本文は取らない。

- 対象の `phase` が `approved` で、プロジェクトの `.spec-workflow/approvals/` 配下に承認依頼のファイルが1件以上在れば、`phase` を `activated` に書き、上層へ `done` を配信して 204 を返す
- 承認依頼が無ければ 409 phase（まだ完成していない）。`phase` は `approved` のまま
- 対象が `stroking` / `proposed` なら 409 phase（まだ昇格していない）
- 対象が `activated` なら 409 phase（既に完成している）。完成は一度だけ記録する
- 存在しない id は 404
- AI を起動しない。改名しない。`invocation` を書かない。本家 REST を呼ばない（本家が動いていなくても判定できる）
- 判定材料は承認依頼のファイルの有無だけ。`invocation` も steering 文書の提出の有無も使わない。承認依頼の状態（保留・承認済み・却下済み）は問わない

引数を取らず対象の実体だけで受理・不受理を決めるので、ADR-0014「API は暗黙の状態分岐を持たない」が対象外とする「責務の不成立」の分岐にあたる。

## U15 を呼ぶ側

`invokeAi`（`server/utils/stroke/ai.ts`）が claude のプロセスを終了まで握っている。プロセスが正常終了し `didWork()` が真のとき、`invocation` を `idle` にする前に U15 を叩く。

- U15 が 204 → `invocation` を `idle`（`retries` 0）にする
- U15 が 409（承認依頼なし）、到達不能、500 → `invocation` を `failed` にする。巡回（`01.retry-failed.ts`）が起こし直す
- このフックは生成中（`approved`）の steering の実行にだけ渡す。ストロークの実行と、完成済み（`activated`）の steering の起こし直しには渡さない

`ai.ts` は kind を知らないので、フックは `AiRun` に渡す値として `invoke.ts` の steering 分岐だけが設定する（`didWork` / `remember` / `prepare` と同じ形）。

## 一覧の行の判定

- `creation` は phase から引く。`approved` → `in-progress`、`activated` → `done`
- 走査（`.spec-workflow/` の有無）はプロジェクトの母集合を作るためだけに使う。行の状態の判定には使わない
- 生成中の行は接続の判定の対象から外し、`connection` は `disconnected` 固定にする。入場ガード（`connection !== 'active'` で弾く）は今のまま
- `state.json` を持たない走査結果（昇格の記録が無い既存プロジェクト）は今までどおり `done`

## 決着の配信

- `done` は U15 が `activated` を書いた直後に流す
- `writeInvocation`（`creationOutcomeOf`）は `approved` で `error`（リトライ上限）のときだけ `failed` を流す。`idle` では流さない
- `failed`（起こし直す対象）と `running` は今までどおり流さない

## phase を読む実装の一本化

`state.json` の phase を読む実装は現在6箇所ある。`readState`（zod）に一本化する。

- `server/handler/phase.ts` を削除する。生読みの `readPhase` と承認軸の述語（`isBeforeApproval` / `isAfterApproval`）をやめる。`docs/specs/api/projects/delete.md` の「どの局面のものを許すかは各 endpoint が持つ」に反しているため。`server/handler/delete.ts` は残す
- U11 `DELETE /api/sessions/:id`: `readState` で読み、`stroking` / `proposed` だけ受理。承認以降は 409 phase
- P1 `DELETE /api/projects/:projectId`: `readState` で読み、`approved` / `activated` を受理。承認前は 409 phase
- 壊れた `state.json`（JSON として parse できない、phase が集合の外、必須項目が欠ける）は、どちらの endpoint でも削除を通さない。応答の status は今と同じ（U11 は 404、P1 は 409 phase）
- `session-core.ts` の生読み `readPhase`（U12 一覧）は `readState` に寄せ、失敗と集合外を `'unknown'` に写す層を一覧側に残す
- `control/creating.ts` の `isApproved` は phase を持ち帰る形にし、`readState` を使う
- `activated` を昇格済み側に含める箇所: `reap.ts` の `targetOf`（steering）、`invoke-agent.get.ts` の `kind`（steering）と `runId`、`invoke.ts` の `conversationWriter`（`runId` を書く）、`promote.post.ts` の 409（既に昇格している）

## 既存の `state.json` の移行

起動時に一度だけ、U12 の一覧から `phase === 'approved'` の対象を拾い、それぞれ U15 を叩く。承認依頼が在るものだけ `activated` になる。無いものは生成中のまま残す。判定は U15 の1箇所に閉じ、移行側は判定を持たない。失敗は `console.error` に留め、起動を止めない。置き場と形は `server/plugins/01.reap-running.ts` に倣う。

`activated` を集合から外す巻き戻しは、削除 endpoint が受理しなくなるので行わない。

## 上位資料への反映

design.md で提案し、承認を得てから書き換える。

- `openspec/specs/project/generation`「生成中か完了かはファイルシステムの事実だけで判定する」: `.spec-workflow/` の有無を判定から外し、「完了を測るための判定・告知の口を新設してはならない」を U15 と矛盾しない形に直す
- `openspec/specs/project/directory`: 走査は母集合のためだけ、と明記する
- `docs/specs/api/overview.md` に U15 を追記。`docs/specs/api/sessions/activate.md` を新設。`sessions/invoke-agent.md` に `activated` でも steering を起こすことを追記
- `docs/specs/core/schema.md`: phase の値に `activated` を足し、`invocation` の必須の記述を zod（`approved` は既定 `idle`）に合わせる
- `CONTEXT.md`「生成中」: 「終わりは `.spec-workflow/` が出来たとき」を「終わりは初回の承認依頼が出たとき」に直す
- `docs/specs/plan/portal-stroke-exit.md`: 図の「`.spec-workflow/` ができる → done」を「承認依頼が出る → U15 → done」に直す

## 対象外

- `/write-steering-v2` を置くこと（`fix-missing-write-steering-skill`）。スキルの有無にかかわらず、steering が完了しなければ生成の失敗として現れる、が本変更の責務
- U 系 endpoint を `server/api/strokes/` から `server/api/sessions/` へ移すこと（`fix-session-api-path`）。U15 だけは最初から `server/api/sessions/[id]/activate.post.ts` に置く
- 配信の仕組みの作り直し（`replace-polling-with-push`）。本変更が触るのは合図の発生源だけ
- 承認画面の導線（`update-ui-approval-review`）

## 未決

- 「初回の」承認依頼の見分け方。本仕様では「U15 は `approved` のときだけ立て、一度立てたら記録し直さない」で代替している。それで足りるかは design で確認する
