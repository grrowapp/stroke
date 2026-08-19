## 1. WaitingIndicator の文言を必須 prop 化

- [x] 1.1 `app/components/WaitingIndicator.vue` に required な `message` prop を追加し、既定の文言を削除する
- [x] 1.2 既存3箇所（`app/pages/index.vue` / `app/pages/s/[sessionId]/index.vue` / `app/components/review/FollowupModal.vue`）で「AI が次を考えています…」を明示で渡す。表示は従来どおりであること

## 2. 差し戻しの待ち受け画面

- [x] 2.1 `app/pages/s/[sessionId]/proposal.vue` のヘッダー帯から `busy` の待機表示を外す
- [x] 2.2 `busy` の間は proposal 本文とヘッダー操作の代わりに、「AI が修正中です」がブリンク表示される待ち受け画面を全面に出す
- [x] 2.3 応答が返って `busy` が解けたら待ち受けを抜けることを確認する。修正なら proposal 画面へ戻り、問い返しなら問い返しの面につながる（`sendBack()` の既存分岐を流用し、分岐は新設しない）

## 3. 動作確認

- [x] 3.1 差し戻し → 待ち受け画面 → 修正が返って proposal 画面に戻る流れをブラウザで確認する
- [x] 3.2 差し戻し → 問い返しが返る流れで、待ち受けを抜けて問い返しの面が出ること、面の中の待機が「AI が次を考えています…」の点滅であることを確認する
- [x] 3.3 画面1のストローク待機の表示が従来と変わっていないことを確認する
