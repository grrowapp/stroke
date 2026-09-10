## 1. 着手

- [x] 1.1 `openspec/tickets/update-project-api-handler.md` の `status` を `Doing` にする
- [x] 1.2 同ファイルの `tags` に `update-project-api-handler/92d3ea72-e0cf-4412-a969-d5e6aaab99d7` を追記する（既に同じ物があれば追記しない。既存の項目は消さない）

## 2. handler を作る（design D2）

- [x] 2.1 `server/handler/project-directory.ts` を作り、`listProjectDirectory`（一覧の合成。設定は引数で受ける）・`resolveProjectName`（`projectId` から保存先の名前を引く走査）・`readProjectInfo`・`registerProject` を置く
- [x] 2.2 `server/handler/project-approval.ts` を作り、`listPendingApprovals`・`getApprovalContent`・`respondToApproval`（既定文の当てはめと本家へ送る引数の組み立てを含む）を置く
- [x] 2.3 `server/handler/project-document.ts` を作り、仕様書 4 本（`listSpecs`・`getSpecDocuments`・`getTaskProgress`・`saveSpecDocument`）とステアリング 2 本（`getSteeringDocument`・`saveSteeringDocument`）を置く

## 3. api を薄くする（design D1・D3・D4・D5）

- [x] 3.1 `server/api/projects/index.get.ts` を `listProjectDirectory` の呼び出しにする
- [x] 3.2 `server/api/projects/index.post.ts`（P2）の本家 REST の呼び出しを `registerProject` にする。パスの検証と 404 → 503 の読み替えは api に残す
- [x] 3.3 `server/api/projects/[projectId]/index.delete.ts`（P1）から `resolveName` と `toHttp` を消し、`resolveProjectName` と `deleteErrorToHttp` を呼ぶ。`DELETABLE` と 409 の文言は api に残す
- [x] 3.4 `server/api/projects/[projectId]/info/index.get.ts` を `readProjectInfo` の呼び出しにする
- [x] 3.5 承認の 3 本（`approvals/index.get.ts`・`approvals/[approvalId]/content/index.get.ts`・`approvals/[approvalId]/[action]/index.post.ts`）を `project-approval.ts` の呼び出しにする。400 の検証はすべて api に残す
- [x] 3.6 仕様書の 4 本とステアリングの 2 本を `project-document.ts` の呼び出しにする。文書名の検証は api に残す
- [x] 3.7 `server/utils/stroke/conflict.ts` の `deleteErrorToHttp` の docblock を事実に合わせる（呼び手がセッションの削除とプロジェクトの削除の 2 つになった）。実装と export は動かさない

## 4. テスト（design D6）

- [x] 4.1 `test/server/handler/project-directory.test.ts` を足す（`resolveProjectName` の走査、`listProjectDirectory` の合成と `upstreamBaseUrl` が未設定のときの振る舞い）
- [x] 4.2 `test/server/handler/project-approval.test.ts` を足す（既定文の当てはめ、注釈の渡し方）
- [x] 4.3 既存の api のテスト 2 本が手を入れずに通ることを確かめる

## 5. 検証

- [x] 5.1 `yarn typecheck` が通る
- [x] 5.2 `yarn test` が通る（87 files / 1092 tests すべて pass）
- [x] 5.3 `yarn test:e2e` が通る（`approval-annotation.spec.ts` の 11 件は base の時点で落ちる既知の状態。落ちたら base と同じかを確かめて切り分ける）
  - base（`pre3` = `af9dae4c`）の同条件の run: 12 failed（approval-annotation 11 件 + `stroke-exit.spec.ts:140`）/ 225 passed
  - この branch の run: 14 failed（approval-annotation 12 件 + `stroke-exit.spec.ts:140` + `workspace.spec.ts:116`）/ 223 passed
  - 差分の 2 件は flaky と判定した。`workspace.spec.ts` は run のたびに落ちるテストが変わり（`:68` / `:188` / `:116`）、`workspace` + `stroke-exit` を単独で回すと 57 件すべて pass する。approval-annotation の 12 件目（`:490`）も同ファイルの既知の失敗の揺れである
  - `stroke-exit.spec.ts:140` は base でも落ちる。単独では pass するので、長い run での test 間の残留（stub の `registrations`）による順序依存であり、この change 由来ではない
  - **`yarn test:e2e` は build を含まない**（`playwright.config.ts` の webServer が `node .output/server/index.mjs` を起動する）。先に `yarn build` を回してから計測すること
- [x] 5.4 `server/api/projects/**` に `upstreamClient` / `UpstreamRestClient` が現れないことを走査で確かめ、`toHttp` が 1 つになったことを確かめる（issue #19 の完了条件）
- [x] 5.5 `openspec validate --all --store stroke` が通る（`change/update-project-api-handler` は pass。他に落ちる 8 件はこの change の範囲外で、以前から落ちているもの）

## 6. レビュー

- [x] 6.1 `/santa-method` で 2 レビュアーによるレビューを実行し、両方がパスするまで直す（`typescript-reviewer` エージェントはこの環境に無いので既定のレビュアー構成で代替する。指摘は critical だけ・1 件 3 行以内・合計 400 字以内で報告させる）
  - Reviewer B: PASS / Reviewer C: PASS。critical な指摘なし（1 巡目で収束）

## 7. 締め

- [x] 7.1 change の成果物を commit する（`21e4a9e7`。`origin/pre3` の取り込みが `3be0bd9c`。push 済み。PR: http://192.168.1.202/gitea/grrowapp/stroke/pulls/29 ）
- [x] 7.2 ユーザーから完了承認を得て、`openspec/tickets/update-project-api-handler.md` の `status` を `Wait-for-archive` にする（この change では親が PR のマージで代行するため、担当は 7.1 まで進めて親へ報告する）
