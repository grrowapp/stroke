# tasks — update-stroke-api-handler

## 1. 着手の記録

- [x] 1.1 `openspec/tickets/update-stroke-api-handler.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `update-stroke-api-handler/92d3ea72-e0cf-4412-a969-d5e6aaab99d7` を追記する（既に同じ物があれば追記しない。`tags` は追記のみ）

## 2. 型の置き場

- [x] 2.1 `server/utils/stroke/session-store.ts` に `ActiveSessionState`（`Exclude<SessionState, PromotedState>`）を足す（design D5）

## 3. `server/handler/question.ts`

- [x] 3.1 `submitQuestion(sessionId, state, question)` を作る——`state.json` へ残す・W1 配信・提出の記録。局面の述語は持たない（design D2）
- [x] 3.2 `currentQuestion(sessionId, from)` を作る——`from` に当てはまる局面のときだけ現在の 1 問を返す（design D4）

## 4. `server/handler/proposal.ts`

- [x] 4.1 `submitProposal(sessionId, state, proposal, projectName)` を作る——順序は「残す → phase を進める → W2 配信」を 1 続きで持つ。候補名の決定と `decision` を持ち越さない書き込みも handler（design D6）
- [x] 4.2 `currentProposal(sessionId, from)` を作る——`from` に当てはまり、保存された本文があるときだけ `ProposalMessage` を返す
- [x] 4.3 `ProposalMessage` の組み立てを内部の 1 関数にし、受理時の配信と接続時の配信が同じところを通るようにする（design D1）

## 5. api を薄くする

- [x] 5.1 A5 `server/api/strokes/[id]/question/index.post.ts` — `parseQuestion` の 400（文言は変えない）と `isPromotedState` の 409 を api に残し、実処理は `submitQuestion` へ
- [x] 5.2 A7 `server/api/strokes/[id]/proposal/index.post.ts` — `parseBody` と `isPromotedState` の 409 を api に残し、実処理は `submitProposal` へ
- [x] 5.3 A1・A4・A8 が capability の「既に薄い endpoint」を満たしていることを確かめる（design D3。触らない）

## 6. WS の route を薄くする

- [x] 6.1 W1 `server/routes/api/sessions/[id]/ws/question.ts` — 流してよい局面の literal（`['stroking', 'proposed']`）を route に置き、`currentQuestion` が返したものを送るだけにする
- [x] 6.2 W2 `server/routes/api/sessions/[id]/ws/proposal.ts` — 同じく `['proposed', 'approved', 'activated']` を置き、`currentProposal` が返したものを送るだけにする
- [x] 6.3 走査で確かめる——`server/api/` と `server/routes/` に `writeState` / `.publish(` / `readState` / 保存された本文の読み書きが直接現れないこと

## 7. テストの寄せ替え

- [x] 7.1 `test/server/handler/question.test.ts` を作る（`submitQuestion` の 3 段と `currentQuestion` の局面。design D7）
- [x] 7.2 `test/server/handler/proposal.test.ts` を作る（`submitProposal` の順序・出し直しの `decision`・候補名、`currentProposal` の局面と本文の有無）
- [x] 7.3 `test/server/api/strokes/{question,proposal}/index.post.test.ts` を返し方と handler の呼び出しだけに絞る。二重に持たない

## 8. 検証

- [x] 8.1 `yarn typecheck`
- [x] 8.2 `yarn test`
- [x] 8.3 `yarn build && yarn test:e2e`。既知の失敗（`approval-annotation.spec.ts` の 11 件）は base と同じかを確かめて切り分ける。起動したものは必ず止め、50000 番台のポートの解放を確かめる
- [x] 8.4 完了条件を確かめる——`server/api/strokes/[id]/**` と WS route が capability の Scenario を満たすこと、W1 / W2 の接続時配信と A7 の順序が変わらないこと、`openspec validate --all --store stroke` が通ること

## 9. レビュー

- [x] 9.1 `/santa-method` で 2 レビュアーによるレビューを行い、**両方がパスするまで**直す（`openspec/config.yaml` tasks ルール。`typescript-reviewer` エージェントはこの環境に無いので既定のレビュアー構成で代替する）

## 10. 締め

- [x] 10.1 change の成果物を commit し、`update-stroke-api-handler` を push して PR（base `pre3`）を出す
- [x] 10.2 ユーザーから完了承認を得て、`openspec/tickets/update-stroke-api-handler.md` の `status` を `Wait-for-archive` にする（親が PR のマージで代行する。子はここまで進めない）
