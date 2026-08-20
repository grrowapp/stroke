# tasks — migrate-claude-p-to-api-endpoint

前提: specs/（agent-api・ai-invocation）が契約、design.md が方式（API 定義・WS チャネル定義・シーケンス）。用語は CONTEXT.md に従う。

## 1. サーバ: エージェント向け endpoint と記録

- [x] 1.1 `GET /api/[id]/overview`・`GET /api/[id]/send-back` を新設する（保存済みを返す。無ければ 404）
- [x] 1.2 `POST /api/[id]/question` を新設する。検証は `server/utils/question.ts` の `parseQuestion`、不適合 400、存在しないセッション 404、phase `approved` は 409。受理で「今の1問」を更新する
- [x] 1.3 `POST /api/[id]/proposal` を新設する。空本文 400、`approved` 409。受理で本文を `proposal.md` へ保存し（サーバが書く）、`projectName` は kebab-case のときだけ候補として保存する
- [x] 1.4 strokes の記録を実装する: `POST /api/[id]/answer` 受理で（今の1問 + 回答）のペア行を追記、proposal の初回受理でマーカー行（`proposal: true`）を追記（`shared/types.ts` の `Stroke` をマーカー行対応に変更）

## 2. サーバ: WS チャネル

- [x] 2.1 Nitro の WS ハンドラでチャネル2本（`/api/[id]/ws/question`・`/api/[id]/ws/proposal`）を新設し、セッション id ごとに接続を束ねる
- [x] 2.2 受理時配信を実装する: question / proposal の提出を受理した瞬間、該当チャネルの全接続へ1件分を流す
- [x] 2.3 接続時配信を実装する: 接続が張られた瞬間、そのチャネルの現在分（あれば）を1件流す

## 3. サーバ: 画面向け再編と呼び出し制御

- [x] 3.1 `POST /api/overview`（即 200 + `sessionId`）、`GET /api/[id]`（`{ phase, invocation }`）、`GET /api/[id]/strokes`（全件）へ再編する
- [x] 3.2 `POST /api/[id]/answer`・`POST /api/[id]/send-back`・`POST /api/[id]/approve` を新構成（即 200・本文なし、busy / phase ガード）へ再編する
- [x] 3.3 `server/utils/ai.ts` を作り直す: 起動後タイムアウト時間（設定値）内に受理された提出が無ければ失敗とし、既存のリトライ（続きを促す再起動・入力は再送しない）へ。尽きたら `invocation: failed`。502 は廃止
- [x] 3.4 `server/utils/claude.ts` の標準出力の扱いをプロセス成否の判定のみに絞る
- [x] 3.5 `shared/api-contract.md` を新構成（U1〜U10 の現行6本 + W1・W2）で全面更新する

## 4. prompt の固定テンプレート化

- [x] 4.1 `server/utils/prompt.ts` を固定テンプレート1本にする: 取得先（overview / strokes / send-back）と提出先（question / proposal）の URL をセッション id 込みで明記し、応答の形式規定を endpoint 提出へ書き換える。`overviewPrompt` / `answerPrompt` / `sendBackPrompt` の合成は廃止（`continuePrompt` 相当のリトライ文言は維持）
- [x] 4.2 提出先 URL の base（ホスト・ポート）を設定値（runtime config）に追加する

## 5. 旧経路の削除（BREAKING）

- [x] 5.1 `server/utils/ai-response.ts`（`parseQuestionResult` / `parseProjectName`）を削除する
- [x] 5.2 `server/utils/session-store.ts` の `readProposalStamp` を削除する
- [x] 5.3 `shared/types.ts` の `SessionView` / `StrokeResult` / `ApproveResult` を廃止し、参照残りを整理してビルドが通ることを確認する

## 6. 画面

- [x] 6.1 WS 受信ベースの描画に切り替える: `useWebSocket`（VueUse）で W1 / W2 を購読し、受信を reactive な状態に入れて描画する（最後に届いた1件で上書き）
- [x] 6.2 リロード時の組み立てを実装する: U2 で phase / `invocation` を読み、画面の行き先と待機・失敗表示を決め、U3 でパンくずを組み立てる
- [x] 6.3 待機・失敗の扱いを実装する: 回答・差し戻しの送信後は待機表示、待機中のみ U2 を数秒おきに読み直し、`failed` ならエラー表示と同じ入力 POST での再試行
- [x] 6.4 パンくずをマーカー行対応にする: 問い返しの往復も粒として並び、proposal マーカーが道に入る

## 7. 実機確認

- [x] 7.1 起動設定の `--allowedTools` でエージェントが endpoint へ GET / POST できること（HTTP 発行手段の許可）を確認する
- [x] 7.2 ストローク一連（概要投稿→WS で最初の問い→回答→次の問い）を実機で確認する
- [x] 7.3 把握完了→proposal 配信→画面2表示（`projectName` 候補・パンくずのマーカー）を確認する
- [x] 7.4 差し戻し→問い返し（粒に積まれる）→proposal 出し直しを確認する
- [x] 7.5 提出が無いままタイムアウト→リトライ→尽きて `failed` 表示→同じ POST の再送で再開、を確認する
- [x] 7.6 リロード復帰（stroking 中・proposed 中・approved 後・実行中）を確認する
