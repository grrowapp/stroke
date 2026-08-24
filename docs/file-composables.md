# composables の棚卸し

`app/composables/` に5本。現状の実態を書き出したもの。

**これは棚卸しであって規則ではない。** 今こうなっている、という記録にすぎない。どう切り直すべきかは決めていない。置き場の規則は `docs/structure.md`。

## 一覧

| ファイル | 何をするか | 何に触るか | 誰が使うか |
|---|---|---|---|
| `useQuestionChannel.ts` | W1 を購読し、今の1問を持つ | WebSocket | 画面1、`useProposalReview` |
| `useProposalChannel.ts` | W2 を購読し、proposal と名前候補を持つ | WebSocket | `useProposalReview` |
| `useWaitingRetry.ts` | 送信後の待機と失敗の判定 | HTTP（`GET /api/<id>` をポーリング） | 画面1、`useProposalReview` |
| `useAnnotations.ts` | 差し戻しコメントを積み、4層のペイロードに組む | なし（純粋な状態と変換） | `useProposalReview`、`CommentModal` |
| `useProposalReview.ts` | 画面2の状態と往復の全部 | 上の4本 + HTTP | 画面2、`Modals.vue` |

## 個別

### `useQuestionChannel.ts`（24行）

```
useQuestionChannel(sessionId) → { question }
```

`ws://<host>/api/<id>/ws/question` に `useWebSocket`（vueuse）で繋ぎ、届いた1件で上書きする。**今の1問しか持たない。** 接続時にもサーバー側から現在分が1件届く。

URL を自前で組み立てている（`window.location` から scheme と host を取る）。

### `useProposalChannel.ts`（24行）

```
useProposalChannel(sessionId) → { message }
```

`useQuestionChannel` と**構造が完全に同じ**。違うのはパス（`/ws/proposal`）と型（`ProposalMessage`）だけ。URL の組み立てロジックも重複している。

### `useWaitingRetry.ts`（48行）

```
useWaitingRetry(sessionId) → { waiting, failed, startWaiting, stopWaiting }
```

待機中だけ3秒おきに `GET /api/<id>` を読み、`invocation` が `failed` / `idle` になったら止まる。**通常は W1 / W2 の配信が先に届くので、これは保険。**

SSR では `setInterval` を張らない（Nuxt が例外にする、と実測のコメントあり）。

回復（再送）はしない。呼び出し側の役割。

### `useAnnotations.ts`（178行）

```
useAnnotations() → { comments, addSelection, addGeneral, update, remove, clear,
                     summary, nextSteps, buildPayload }
```

**外に触らない。** コメントの配列を持ち、AI へ渡す4層のペイロード（`response` / `comments` / `annotations` / `nextSteps`）に組む。

ハイライト5色の定義（`highlightColors`）を持っていて、`CommentModal.vue` が直接 import している。**composable が色の定義も兼ねている。**

注釈は生テキストへの文字オフセット（`startOffset` / `endOffset`）と引用文字列で持つ。

### `useProposalReview.ts`（410行）

```
useProposalReview(sessionId, { phase, strokes }) → 46 個のプロパティ
```

**突出して大きい。** 他の4本を全部束ね、画面2の状態と往復を丸ごと持つ。返すものは自分でコメントを付けて6群に区切ってある。

```
本文と局面   phase / strokes / proposal / projectName /
             awaitingFollowup / followupQuestion / followupWaiting
コメント     comments
表示         viewMode / notice / busy / sendingBack
モーダル     commentModalOpen / pending / editingId / editing / editingGeneral /
             generalModalOpen / generalDraft / deleteId / alertTitle /
             alertMessage / approveOpen / conflictName / approveBlocked
問い返し     followupOpen / answered
操作         onSelect / editComment / saveComment / openGeneral / closeGeneral /
             saveGeneral / confirmDelete / sendBack / openFollowup /
             answerFollowup / openApprove / approve
```

内部に持っているもの。

- **HTTP エラーの解体**（`statusOf` / `reasonOf` / `messageOf`）。`$fetch` が投げる `FetchError` から statusCode・409 の理由・メッセージを取り出す3関数
- **送信〜決着の追跡**（`pendingAction` と `watch`）。差し戻しと問い返しの2種類の送信が同じ待機機構を共有していて、決着時にどちらの後始末をするかを `pendingAction` で分岐している
- **モーダル4種の開閉状態**（コメント / 全体コメント / 承認 / 問い返し）と、確認・警告
- **プロジェクト名の下書き**。ユーザーが書いたら proposal 更新で消さない

## 気づいたこと

- **`useQuestionChannel` と `useProposalChannel` が構造的に同じ。** WS の URL 組み立ても重複
- **`useProposalReview` が 410 行で、他の4本の合計（274行）より大きい。** 状態・モーダル・HTTP エラー解体・送信の決着追跡が1箇所に集まっている
- **色の定義が composable にある。** `useAnnotations.ts` の `highlightColors` を `CommentModal.vue` が直接 import している
- **画面1側には composable が無い。** `app/pages/strokes/[sessionId]/index.vue` は `useQuestionChannel` と `useWaitingRetry` を直接呼び、送信も自前で書いている。画面2だけが `useProposalReview` にまとまっている
