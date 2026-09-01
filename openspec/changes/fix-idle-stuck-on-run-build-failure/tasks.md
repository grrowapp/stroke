## 1. 現状を再現する

- [x] 1.1 `test/server/utils/stroke/invoke.test.ts` に、組み立てが失敗したとき `invocation` が1つも書かれないことを示す失敗テストを足す（`config.broken` の形を使う。design.md D5）——実装を1パスで進めたため、赤テストのまま残さず、修正後の期待値（`invokeAi` が `failed`/`error` を書く）で `test/server/utils/stroke/ai.test.ts`「invokeAi の組み立て失敗」に置いた。加えて `invoke.test.ts` に「kick は組み立て方（build）を invokeAi へ渡すだけで、自分では呼ばない」を足し、`config.broken` が同期的に throw する経路が保たれていることを確かめた
- [x] 1.2 U13（`server/api/strokes/[id]/invoke-agent.get.ts`）が、その失敗でも 200 を返すことを示す失敗テストを足す——同じ理由で、新設した `test/server/api/strokes/invoke-agent.get.test.ts` に修正後の期待値（503 を返す）で置いた
- [x] 1.3 巡回（`server/plugins/01.retry-failed.ts`）が `idle` を拾わないため、1.1 の状態が次の巡回でも回復しないことを確かめる（既存の `shouldRetry` のテストで足りるなら足さない）——`test/server/utils/stroke/sweep.test.ts` の「running / idle / error は拾わない」が既に `idle` を含めて確かめている。追加なし

## 2. 実行の記録を残す

- [x] 2.1 `invokeAi`（`server/utils/stroke/ai.ts`）が、組み立て済みの `AiRun` ではなく「組み立て方」を受け取れるようにする（design.md D1）——`invokeAi(sessionId, retries, build)` に変更。戻り値も `{ built, settled }` の2点（3.2 参照）
- [x] 2.2 `kick`（`server/utils/stroke/invoke.ts`）を 2.1 の形に合わせ、`buildRun` の呼び出しを `invokeAi` の内側へ移す。A8 を直接叩かない
- [x] 2.3 組み立てに失敗した実行を、起こし直しの上限に達していなければ `failed`、達している／上限を読み出せないなら `error` として A8 へ書く（specs `agent/invocation`・design.md D3）
- [x] 2.4 その失敗も起こし直しの回数に数える（記録と一緒に回数を1つ進めた値を渡す）
- [x] 2.5 接続表 token が、組み立て失敗の経路でも必ず消えることを保つ（発行・登録は spawn の手前のまま、削除は1本に集約する。design.md Risks）——削除は `settled.finally(() => removeConnection(token))` の1本に集約
- [x] 2.6 すでに `failed` / `error` を書いている経路（実行環境を作れない・提出が届かない・時間切れ・上限到達）と成功経路の振る舞いが変わっていないことを、既存テストで確かめる——`ai.test.ts` の既存 17 ケースは無変更のまま（呼び出し方だけ `runInvoke` ヘルパー経由に更新）全て通る

## 3. 起動の受け口（U13）

- [x] 3.1 組み立てに失敗した起動要求を、200 ではなく 503 で返す。理由の文言を添える（specs `api/session/invoke-agent`・design.md D2）
- [x] 3.2 応答が AI の応答の完了を待たないことを保つ。待つのは組み立ての成否までとする——`kick`/`invokeAi` の戻り値を `built`（組み立ての成否だけ）と `settled`（実行全体の完了）に分け、U13 は `built` だけを `await` する
- [x] 3.3 受理しなかったときも busy ガード（`endRun`）が必ず解けることを確かめる（design.md D4）——`endRun` は `settled` に紐づけたので、`built` が reject して 503 を返した後も `settled` の解決で解ける
- [x] 3.4 巡回と承認処理（`server/api/strokes/[id]/approve.post.ts`）の `$fetch` の catch が、この 503 を失敗として拾うことを確かめる——両方とも汎用の catch（ステータスで分岐しない）なので、コード変更なしで拾う。読み合わせのみ
- [x] 3.5 画面側の3箇所（`app/pages/strokes/index.vue`・`app/composables/useWaitingRetry.ts`・`app/composables/useProjectApi.ts`）が、前提欠如の 503 と同じ扱いで済むことを確かめる。新しい分岐が要ると分かったら、実装を進めずユーザーへ報告する——`useWaitingRetry.ts` は 409 だけを特別扱いし他は汎用失敗、他の2箇所も汎用 catch。新しい分岐は不要と確認した（読み合わせのみ、コード変更なし）

## 4. テスト

- [x] 4.1 1.1・1.2 で足した再現テストが通ることを確かめる
- [x] 4.2 組み立て失敗で `failed` が書かれ、起こし直した回数が1つ進むことのテストを足す
- [x] 4.3 上限に達しているとき、および上限を読み出せないときに `error` になることのテストを足す
- [x] 4.4 U13 が組み立て失敗で 503 を返し、busy ガードが解けることのテストを足す
- [x] 4.5 `yarn test` が通る（746 tests passed, 0 failed）
- [x] 4.6 型検査（`yarn typecheck`）が通る（exit 0）。**`yarn lint` はこのリポジトリに存在しない**（`package.json` に `lint` script が無く、eslint 設定も無い）ため実行していない——報告に明記

## 5. 上位資料への整合反映（ユーザー承認を得てから）

- [ ] 5.1 design.md の「上位資料への整合反映（提案）」をユーザーへ提示し、承認を得る
- [ ] 5.2 承認を得たら `docs/specs/api/contract.md` の U13 の節（output・エラー行）を提案どおりに更新する。**承認前は書き換えない**
- [ ] 5.3 `docs/specs/api/contract.md` の A8 の節と `docs/specs/architecture/session-workflow.md` が変更不要のままであること（`invocation` の書き手が `invokeAi` 1つに保たれていること）を確かめる

## 6. 仕上げ

- [ ] 6.1 成果物を commit する
- [ ] 6.2 `typescript-reviewer` エージェントに `/santa-method` でレビューさせる。指摘が無くなり**完全にパスするまで**繰り返す
- [ ] 6.3 ユーザーから完了承認を得る
