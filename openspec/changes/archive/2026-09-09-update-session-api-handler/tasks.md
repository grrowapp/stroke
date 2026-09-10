# tasks — update-session-api-handler

## 1. 着手の記録

- [x] 1.1 `openspec/tickets/update-session-api-handler.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `update-session-api-handler/92d3ea72-e0cf-4412-a969-d5e6aaab99d7` を追記する（既に同じ物があれば追記しない。`tags` は追記のみ）

## 2. 名前の決めを `paths.ts` へ

- [x] 2.1 `server/utils/stroke/paths.ts` に `SESSION_FILES` と `isSafeSegment` を移す（design D3）
- [x] 2.2 `server/handler/delete.ts` の `isSafeSegment` の写しを消し、`paths.ts` から import する。`targetExists` は `sessionFile` + `SESSION_FILES.state` で組み立てる
- [x] 2.3 `server/utils/stroke/session-param.ts`・`claude.ts` の import を `paths.ts` へ向ける

## 3. `session-core.ts` を `server/handler/session.ts` へ

- [x] 3.1 `server/handler/session.ts` を作る。`createSession` / `listSessions` / `deleteSession` / `readStoredInvocation` / `writeAtomic` / `SessionError`（`Core` を落とす。design D3）
- [x] 3.2 重複を寄せる——`deleteSessionCore` は `handler/delete.ts` の `removeTarget` へ、`sessionExistsCore` は `targetExists` へ、`removeSessionDir` は `removeTarget` へ。`isSessionId` は参照が無いので消す
- [x] 3.3 `server/utils/stroke/session-core.ts` を消し、`session-store.ts` の import と `sessionExists` の呼び口を差し替える
- [x] 3.4 `scripts/session.ts`（CLI）の呼び口を `server/handler/session.ts` へ向ける。使い方・出力・終了コードは変えない
- [x] 3.5 `scripts/stroke-check.ts` の後始末を `removeTarget` へ向ける

## 4. api を薄くする（endpoint ごとの handler）

- [x] 4.1 U11 `sessions/[id]/index.delete.ts` — `deleteSession` を呼ぶ形にする。`DELETABLE` は api に残す
- [x] 4.2 `toHttp` を `server/utils/stroke/conflict.ts` の `deleteErrorToHttp` に出し、U11 をそこから引く（design D6。#19 で P1 が使う）
- [x] 4.3 U7 `answer/index.post.ts` — `server/handler/answer.ts` の `recordAnswer` へ。再送の判定は handler、局面の述語は api
- [x] 4.4 U10 `approve/index.post.ts`・`index.delete.ts` — `server/handler/approve.ts` の `recordDecision` / `withdrawDecision` へ
- [x] 4.5 U15 `activate/index.post.ts` — `server/handler/activate.ts` の `recordActivation(sessionId, from)` へ（design D4）
- [x] 4.6 U13 `invoke-agent/index.get.ts` — `server/handler/invoke-agent.ts` の `invokeAgent` へ。失敗は `InvokeError` で返し、api が 503 に写す
- [x] 4.7 U14 `promote/index.post.ts` — `server/handler/promote.ts` の `promote` へ。占有の区間・巻き戻し・判断の取り下げ・配信・A8 への引き渡しを handler が持つ
- [x] 4.8 U1・U2・U3・U9・U12 が capability の物差しを満たしていることを確かめる（U12 は `listSessions` を呼ぶだけの形に更新）
- [x] 4.9 旧ファイル名を指す docblock を直す（design D8。`session-store.ts` の 2 行・`scripts/stroke-check.ts` の 2 行）

## 5. テストの寄せ替え

- [x] 5.1 `test/server/utils/stroke/session-core.test.ts` を `test/server/handler/session.test.ts` へ移す
- [x] 5.2 実処理の検査を `test/server/handler/{answer,approve,activate,invoke-agent,promote}.test.ts` へ移す（design D5）
- [x] 5.3 `test/server/api/sessions/**` に残すのは status の返し方と handler の呼び出しだけにする。二重に持たない

## 6. docs（承認済み 2026-09-09）

- [x] 6.1 `docs/specs/structure/system-structure.md` §1 に `handler/` の行を足す
- [x] 6.2 同 §4 の api の段落に 1 文足す
- [x] 6.3 `docs/specs/structure/server-structure.md` の棚卸しから `session-core` を外し（34 → 33）、`server/handler/` は対象外である旨を足す
- [x] 6.4 消えた `session-core.ts` を指す 3 ページ・6 行を追従させる（`README.md:181`／`docs/specs/architecture/session-workflow.md:72`・`:85`／`docs/specs/core/settings-reference.md:18`・`:198`・`:204`）。`SESSION_FILES` と `isSafeSegment` の移動先が `server/utils/stroke/paths.ts` であることを実物で確かめてから書く

## 7. 検証

- [x] 7.1 `yarn typecheck`
- [x] 7.2 `yarn test`
- [x] 7.3 `yarn build && yarn test:e2e`（応答が変わらないこと）。起動したものは必ず止め、ポートの解放を確かめる
- [x] 7.4 完了条件を確かめる——`server/api/sessions/**` の各ファイルが「読む → handler を呼ぶ → 返す」の形、`session-core.ts` が無く `*Core` の名が残っていない、`system-structure.md` §1 に `handler/` が載っている、`openspec validate --all --store stroke` が通る

## 8. レビュー

- [x] 8.1 `/santa-method` で 2 レビュアーによるレビューを行い、**両方がパスするまで**直す（`openspec/config.yaml` tasks ルール。`typescript-reviewer` エージェントはこの環境に無いので既定のレビュアー構成で代替する）

## 9. 締め

- [x] 9.1 change の成果物を commit し、`update-session-api-handler` を push して PR（base `pre3`）を出す
- [x] 9.2 ユーザーから完了承認を得て、`openspec/tickets/update-session-api-handler.md` の `status` を `Wait-for-archive` にする（親が PR のマージで代行する。子はここまで進めない）
