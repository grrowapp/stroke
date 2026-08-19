## 1. 実装

- [x] 1.1 `app/assets/css/main.css` の `.blink` コメントを、待機表示（`WaitingIndicator`）にも使う共有アニメーションである旨に更新する
- [x] 1.2 `app/components/WaitingIndicator.vue` のテキストに `blink` クラスを適用する

## 2. 確認

- [x] 2.1 画面1（ストローク中の待機）で点滅することを確認する
- [x] 2.2 画面2の問い返しモーダル（`FollowupModal`）で点滅することを確認する
- [x] 2.3 画面2の `proposal.vue` での待機表示で点滅することを確認する
- [x] 2.4 `prefers-reduced-motion` 設定時にアニメーションが無効になることを確認する
