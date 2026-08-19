## Why

待機表示（`WaitingIndicator`）は「AI が次を考えています…」という静止テキストのみで、AI が実際に処理を続けていることが視覚的に伝わらない。文字を点滅させ、動いている状態を表現することで、ユーザーが「止まっているのでは」と不安になるのを防ぐ。

## What Changes

- 待機表示のテキストに点滅アニメーションを追加し、AI が応答を生成中であることを視覚的に示す
- `WaitingIndicator` は画面1・画面2・問い返しモーダルの3箇所で共有される単一コンポーネントのため、この変更は3箇所すべてに自動的に反映される
- `prefers-reduced-motion` 環境ではアニメーションを無効にする（既存の `.blink` クラスと同じ挙動）

## Capabilities

### New Capabilities

なし

### Modified Capabilities

- `stroke-session`: 「応答を待っている」ことを示す表示の仕方に、動作中であることを示す視覚的表現（点滅）を含める

## Impact

- `app/components/WaitingIndicator.vue` — 待機表示テキストへのアニメーション適用
- `app/assets/css/main.css` — 点滅アニメーションの定義（既存の `.blink` を再利用するか新規に定義するかは design で判断）
- 影響する呼び出し元（変更不要、コンポーネント変更で自動反映）:
  - `app/pages/s/[sessionId]/index.vue`（画面1）
  - `app/pages/s/[sessionId]/proposal.vue`（画面2）
  - `app/components/review/FollowupModal.vue`（問い返しモーダル）
