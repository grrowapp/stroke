# stroke のモジュール

ストローク（ユーザーと AI の1往復）を、置き場所から切り離したモジュールとして扱うための資料。
扱うのは次の2つ。

| 名前 | 何をするもの |
|---|---|
| `useAgentQuestion` | 問いの往復。今の1問を受け、回答を送り、次を待つ |
| `AgentQuestionModal` | 問いを出す面。オーバーレイのモーダル |

## この資料の扱い

**ここに書くのは使い方だけ。** 引数・返り値・依存する境界・設置の手順・呼び出し例に限る。

**振る舞いの規定は書かない。** オーバーレイで開くこと、回答するまで閉じないこと、問いの並び、
送り直せることといった規定の本体は `openspec/specs/agent-question/spec.md` にある。
食い違ったときは spec が勝つ。

サーバとの境界（U/W の番号）は `docs/specs/api/api-contract.md` を参照する。

## `useAgentQuestion`

### 何を持つか

```ts
const { question, waiting, failed, error, answered, send } = useAgentQuestion(sessionId)
```

| 名前 | 内容 |
|---|---|
| `question` | 今の1問。届いていなければ `null` |
| `waiting` | 次が返るのを待っているか |
| `failed` | AI から応答が得られなかったか |
| `error` | 送れなかったときの理由（`{ title, message }`）。送れていれば `null` |
| `answered` | ここまでに答えた数。総数は持たない |
| `send(answer)` | 回答を送り、AI の起動まで要求する |

`error` は「何が起きたか」の判別まで済ませた形で出る（送信そのものの失敗・まだ前の応答を
待っている・起動に失敗した）。置く側はそれをどう見せるかだけを決める。

引数はセッション id 1つ。**状態を外から渡す口は無い。**
composable は内部で持った状態を返す側であって、状態を受け取る側ではない。
`@vueuse/core` の `useWebSocket(url, options)` が同じ形で、`options` は振る舞いの設定
（`autoReconnect` / `onMessage`）だけを取り、観測する変数は全て返り値（`data` / `status` / `ws`）
として出す。`useAgentQuestion` には振る舞いの設定に当たるものが無いため、`options` 自体を持たない。

型（`Question` / `Answer`）は `shared/types.ts` を見ること。ここには写さない。

### 何に依存するか

`docs/specs/api/api-contract.md` の番号で示す。

| 番号 | 使い方 |
|---|---|
| W1 `/api/:id/ws/question` | 今の1問を受ける。接続時にも現在分が1件届く |
| U7 `POST /api/:id/answer` | 回答を送る（受理のみ。AI は起動しない） |
| U13 `GET /api/:id/invoke-agent` | U7 の成功応答の直後に呼ぶ。AI 起動の唯一の入口 |

待機の決着は W1 の配信で付く。次の1問が届けば `waiting` は下りる。
ブラウザを開き直しても、再接続で現在の1問が届くので状態はそこから組み直せる。

### どこから呼ばれるか

質疑応答をさせたい画面。1画面に1インスタンス。

### 呼び出し例

下の「設置の手順」を見ること。

## `AgentQuestionModal`

### 何を持つか

| props | 内容 |
|---|---|
| `open`（`v-model:open`） | 面が開いているか。**開閉は置く側が持つ** |
| `question` | 出す1問。`null` なら出すものが無い |
| `waiting` | 待機中か。面の中に待機を示す |
| `answered` | ここまでに答えた数 |
| `waiting-message` | 待機中に出す文言。場面ごとに置く側が与える |

| emit | 内容 |
|---|---|
| `answer` | ユーザーの回答。`Answer` を1つ渡す |

面は `$fetch` を持たない。受け取って出し、返すだけ。

### 何に依存するか

サーバとの境界を持たない。`useAgentQuestion` にも依存しない（props と emit だけで繋がる）。

### どこから呼ばれるか

`useAgentQuestion` を呼んだ画面。並べて置く。

### 呼び出し例

下の「設置の手順」を見ること。

## 設置の手順

### 1. composable を呼ぶ

```ts
const { question, waiting, answered, send } = useAgentQuestion(sessionId)
```

### 2. 面を置く

```vue
<AgentQuestionModal
  v-model:open="followupOpen"
  :question="question"
  :waiting="waiting"
  :answered="answered"
  waiting-message="AI が次を考えています…"
  @answer="send"
/>
```

### 3. 開く引き金を決める

`open` は置く側が持つ。いつ開くかは画面ごとに違う。

画面2（proposal 確認）の問い返しでは、問いが届いたことを点滅する帯で知らせ、
それを押すと開く。

```vue
<button v-if="awaitingFollowup" @click="followupOpen = true">
  AI から質問があります。ここを押して答えてください
</button>
```

開いた面が閉じる条件は `openspec/specs/agent-question/spec.md` の規定による。
置く側が `open` を `false` にして閉じさせることはしない。

### 4. 送れなかったときの見せ方を決める

`send` は throw しない。送れなかった理由は `error` に出るので、置く側はそれを自分の
知らせ方で出す。画面2 では確認モーダルに載せている。

```ts
watch(error, (reason) => {
  if (reason) warn(reason.title, reason.message)
})
```

## 関連

- `docs/specs/plan/next-agent-run.md` — この2つを汎用のエージェント実行へ広げる案（未着手）
- `openspec/specs/agent-question/spec.md` — 振る舞いの規定（本体）
- `openspec/specs/proposal-review/spec.md` — 画面2 に固有の規定
- `docs/specs/api/api-contract.md` — サーバとの境界
- `docs/specs/architecture/question-flow.md` — 往復の全体像（誰がいつ何を送るか）
- `docs/specs/core/schema.md` — 入れ物の形と検証の規定
- `shared/types.ts` — `Question` / `Answer` の型
