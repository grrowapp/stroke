## 1. invokeAi の内部化（server/utils/ai.ts）

- [x] 1.1 初回判定を実装する: セッションの保存済み記録（問いと回答のペア・proposal マーカー）が空かどうかで初回/継続を導く（design 決定2）
- [x] 1.2 `invokeAi` の引数を `sessionId` のみにし、定型（`firstPrompt` / `continuePrompt`）の選択を内部へ移す。リトライの内部切替は現行維持
- [x] 1.3 定型を `runtimeConfig.claude` の項目（`firstPrompt` / `continuePrompt`）に外出しする。`claude-config.ts` のスキーマに追加し、現行の `prompt.ts` の文言を runtimeConfig の値へ移す。移設後、`prompt.ts` のハードコードされた文言は削除し、コード側に定型の本文を残さない（design 決定4）

## 2. 起動 endpoint の新設

- [x] 2.1 `server/api/[id]/invoke-agent.get.ts` を新設する: セッション存在確認 → busy なら受理しない → `beginRun` → `invokeAi(sessionId)` を fire-and-forget → `endRun` を finally で対称に → 即応答
- [x] 2.2 存在しないセッション・busy の応答を既存のエラー応答の形式に合わせる

## 3. 受理側 endpoint からの起動除去

- [x] 3.1 `server/api/overview.post.ts` から `invokeAi` / `beginRun` / `endRun` / `firstPrompt` を除去し、受理と応答のみにする
- [x] 3.2 `server/api/[id]/answer.post.ts` から同様に除去する
- [x] 3.3 `server/api/[id]/send-back.post.ts` から同様に除去する

## 4. フロントエンドの起動呼び出し

- [x] 4.1 概要投稿の成功応答後に `GET /api/[id]/invoke-agent` を呼ぶ（`app/pages/index.vue` 系のフロー）
- [x] 4.2 回答送信の成功応答後に同様に呼ぶ（`app/pages/s/[sessionId]/index.vue` 系のフロー）
- [x] 4.3 差し戻し送信の成功応答後に同様に呼ぶ（`app/composables/useProposalReview.ts`）
- [x] 4.4 invoke-agent の失敗（busy 含む）を既存のエラー表示系へ流す

## 5. ドキュメントと検証

- [x] 5.1 `docs/api-contract.md` に invoke-agent を追記し、overview / answer / send-back が起動しなくなったことを反映する
- [x] 5.2 一連のフロー（概要 → ストローク → 差し戻し → 承認）を実際に動かし、初回判定・継続・busy 拒否・リトライが現行どおり働くことを確認する
