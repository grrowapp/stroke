# adr0016-sub-define-request-validation-messages — Tasks

`[x]` は `/home/vagrant/work/stroke-board/pre5`（ブランチ `provide-operations-via-mcp`）の
コードで確認済み。A5 の分はコミット `521b273` で入っている。

## 1. A5（問いの提出）に違反の理由を返す

- [x] 1.1 `server/utils/stroke/question.ts` に `questionViolations(value: unknown): string[]` を追加する。`rawQuestionSchema` を `safeParse` し、`error.issues` を 1 件 1 行の文字列にする（design 決定1）
- [x] 1.2 1 行の形を「`位置: 理由`」にする。位置は `issue.path.join('.')`、空なら `(全体)`（design 決定2）
- [x] 1.3 `lengthAt(value, path)` を追加し、`too_big` / `too_small` のときだけ `（現在 N）` を添える。文字列は `trim()` 後の字数、配列は件数（design 決定3）
- [x] 1.4 `server/api/strokes/[id]/question.post.ts` で `questionViolations(body)` を呼び、全件を `' / '` で連結して既存の `問いの構造として読み取れない。` の後ろに足す（design 決定4・決定5）
- [x] 1.5 `violations` が空のときは従来の 1 文だけを返す分岐を残す（design 決定5）

## 2. A5 の検証テスト

- [x] 2.1 `test/server/utils/stroke/question.test.ts` を追加する（6 ケース・`yarn vitest run test/server/utils/stroke/question.test.ts` で全件 pass を確認）
- [x] 2.2 通る問いには何も返さないことを見る
- [x] 2.3 `options[].description` の 1 字超過で、位置（`options.0.description`）と現在値（`現在 51`）の両方が返ることを見る（spec「あと幾つ削ればよいか分かる」）
- [x] 2.4 `question` の超過も同じ形で返ることを見る
- [x] 2.5 選択肢の件数超過で件数が返ることを見る（spec「件数の違反も同じ形で伝わる」）
- [x] 2.6 複数違反がすべて返ることを見る（spec「複数の違反が一度に返る」）
- [x] 2.7 項目そのものが欠けている場合も、欠けている項目名が返ることを見る
- [ ] 2.8 メッセージが zod の既定文でないことを見るケースを足す（spec「検証の仕組みの言葉が漏れない」）。4 章の完了が前提

## 3. 受け口の現状を確認する

- [x] 3.1 `server/api/**` を通して `parseBody` を通る受け口を洗う（`strokes/index.post` / `answer` / `approve` / `proposal` / `send-back` / `submission` の 7 箇所）
- [x] 3.2 `strokes/[id]/question.post.ts` は `parseBody` を通らないが `parseQuestion` + `questionViolations` で検証されている（別経路であって、無検証ではない）ことを確認する
- [x] 3.3 `strokes/[id]/delete.post.ts` はボディを読んでおらず（`readBody` を呼ばない）、送り手が値を組み立てて送る口ではないことを確認する。ボディスキーマの追加対象から外す（design 決定8）
- [x] 3.4 MCP ツール `send-question` の `readFetchFailure` が `error.data.message` だけを取り、`outputSchema` が `{ status, errorCode, error }` であることを確認する。送り手に届くのが 1 本の文字列だけであることの裏取り（design 決定4）

## 4. 制約ごとのメッセージを定める

- [ ] 4.1 `server/utils/stroke/question.ts` の `rawQuestionSchema` / `rawOptionSchema` の全制約（`header` / `detail` / `question` / `options` の件数 / `label` / `description`）に、その制約のメッセージを第 2 引数で書く（design 決定6）
- [ ] 4.2 `server/utils/stroke/request-schemas.ts` のメッセージが無い制約に書く: `annotationBase.id` / `annotationBase.timestamp` / `highlightColorSchema.name` / `bg` / `border` / `startOffset` / `endOffset` / `sendBackBody.response` / `sendBackBody.annotations` / `nextSteps` / `submissionBody.invocation` / `retries`
- [ ] 4.3 メッセージの文面を「何の項目が、どの決まりに反したか」がそのまま読める日本語に揃える。既存の `'概要が要る。'` `'指摘の本文が要る。'` と同じ調子にする
- [ ] 4.4 zod の既定文が 1 つも出ないことを、全スキーマの全制約について確かめる

## 5. 組み立てを共通化し、`parseBody` を全件返しに揃える

- [ ] 5.1 issue から 1 行を作る処理（位置 + メッセージ + 量なら現在値）と `lengthAt` を `server/utils/stroke/` 配下の 1 モジュールへ寄せる（design 決定7）
- [ ] 5.2 `question.ts` の `questionViolations` をそのモジュールを使う形に置き換える。外から見た振る舞い（返る文字列）は変えない
- [ ] 5.3 `request-schemas.ts` の `parseBody` を、`issues[0]` だけでなく全件を組み立てて返す形に変える
- [ ] 5.4 `parseBody` が返している `data: { path }` の扱いを決める（削るか全件の path 配列にするか）。画面側（`useAgentQuestion` / `useProposalReview`）は `statusMessage` と `message` しか読んでいないことを確認済み

## 6. 展開後の検証

- [ ] 6.1 `parseBody` を通る受け口それぞれについて、複数違反が一度に返ることのテストを足す
- [ ] 6.2 長さ・件数の違反に現在値が添うことのテストを、`parseBody` 側でも足す
- [ ] 6.3 文言の全文一致ではなく「どの項目が出るか」「現在値が出るか」で見る形にする（design Risks）
- [ ] 6.4 `yarn vitest run` で既存テストの回帰が無いことを確認する
- [ ] 6.5 MCP 経由（`send-question`）で 400 の本文が書き換えられずに届くことを、`test/server/mcp/tools/send-question.test.ts` の期待値を新しい本文へ更新して確認する
