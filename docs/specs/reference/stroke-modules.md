# stroke のモジュール

ストローク（ユーザーと AI の1往復）を、置き場所から切り離したモジュールとして扱うための資料。
扱うのは次の2つ。

| 名前 | 何をするもの |
|---|---|
| `useAgentQuestion` | 問いの往復。今の1問を受け、回答を送り、次を待つ |
| `AgentQuestion` | 問いを出す面。**中身だけ**を持ち、外殻（オーバーレイ）は持たない |

## この資料の扱い

**ここに書くのは使い方だけ。** 引数・返り値・依存する境界・設置の手順・呼び出し例に限る。

**振る舞いの規定は書かない。** オーバーレイで開くこと、回答するまで閉じないこと、問いの並び、
送り直せることといった規定の本体は `openspec/specs/agent-question/spec.md` にある。
食い違ったときは spec が勝つ。

サーバとの境界（U/W の番号）は `docs/specs/api/contract.md` を参照する。

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

引数はセッション id 1つ。**状態を外から渡す引数は無い。**
composable は内部で持った状態を返す側であって、状態を受け取る側ではない。
`@vueuse/core` の `useWebSocket(url, options)` が同じ形で、`options` は振る舞いの設定
（`autoReconnect` / `onMessage`）だけを取り、観測する変数は全て返り値（`data` / `status` / `ws`）
として出す。`useAgentQuestion` には振る舞いの設定に当たるものが無いため、`options` 自体を持たない。

型（`Question` / `Answer`）は `shared/stroke.ts` を見ること（画面・面からは `#shared/stroke`
で import する）。ここには写さない。

### 何に依存するか

`docs/specs/api/contract.md` の番号で示す。

| 番号 | 使い方 |
|---|---|
| W1 `/api/:id/ws/question` | 今の1問を受ける。接続時にも現在分が1件届く |
| U7 `POST /api/:id/answer` | 回答を送る（受理のみ。AI は起動しない） |
| U13 `GET /api/:id/invoke-agent` | U7 の成功応答の直後に呼ぶ。AI 起動の唯一の入口 |

待機の決着は W1 の配信で付く。次の1問が届けば `waiting` は下りる。
ブラウザを開き直しても、再接続で現在の1問が届くので状態はそこから組み直せる。

### どこから呼ばれるか

質疑応答をさせたい画面。1画面に1インスタンス。

今これを通しているのは画面2（proposal 確認）だけで、`useProposalReview` が中で1つ作り、
`followupQuestion` / `followupWaiting` / `answered` として画面へ渡している。
画面1 は `useSessionChannel`（W1）と `useWaitingRetry` を直に持ち、送信も自分で書いている
（この composable は通っていない）。新しく質疑応答を置く画面は、この composable を呼ぶ側で書く。

### 呼び出し例

下の「設置の手順」を見ること。

## `AgentQuestion`

置き場は `app/components/` 直下。auto-import 名が `AgentQuestion` になるのはここだけなので、
下の階層へ移すと名前が変わる。

### 何を持つか

| props | 内容 |
|---|---|
| `question` | 出す1問。`null` なら「今は答える問いがありません」を出す |
| `waiting` | 待機中か。面の中に待機を示す。この間は回答欄も送信ボタンも出ない |
| `waiting-message` | 待機中に出す文言。場面ごとに置く側が与える |
| `answered` | ここまでに答えた数 |
| `submit-label` | 送信ボタンの文言。**画面ごとに変わるのはここと `waiting-message` だけ** |

5つとも必須。既定値は無い。

| emit | 内容 |
|---|---|
| `answer` | ユーザーの回答。`Answer` を1つ渡す |

面は `$fetch` を持たない。受け取って出し、返すだけ。
選択と自由入力の排他・未入力のときの notice・送信の可否判定は、全てこの面の中で閉じている。
置く側は `@answer` を受けるだけでよい。

**外殻は持たない。** オーバーレイ（`UModal`）にするかどうかは置く側が決める。
素置きにする画面（画面1）とモーダルで開く画面（画面2）で外殻が違うため、外殻は共有しない。

**送信ボタンはこの面の中にある。** 位置は画面によって変えない（文言だけが変わる）。
理由は下の「設計上の注記」に書く。

縦は「問いの中身」と「送信ボタン」の2段で、スクロールするのは中身だけ。
高さの制約がある置き方（モーダル）でだけスクロールが起き、制約が無い置き方（素置き）では
中身が伸びるだけになる。どちらも同じ markup で成立するので、画面ごとの出し分けを持たない。

### 何に依存するか

サーバとの境界を持たない。`useAgentQuestion` にも依存しない（props と emit だけで繋がる）。

### どこから呼ばれるか

画面1（`app/pages/strokes/[sessionId]/index.vue`）と画面2（同 `proposal.vue`）の両方。

### 呼び出し例

下の「設置の手順」を見ること。

## 設置の手順

### 1. composable を呼ぶ

```ts
const { question, waiting, answered, error, send } = useAgentQuestion(sessionId)
```

### 2. 外殻を決めて面を置く

素置きにするなら、そのまま置く（画面1）。

```vue
<AgentQuestion
  v-if="waiting || question"
  :question="question"
  :waiting="waiting"
  waiting-message="AI が次を考えています…"
  :answered="answered"
  submit-label="送信"
  @answer="send"
/>
```

`v-if` は「問いも待機も無いあいだは面ごと出さない」ため。これが無いと、最初の問いが
届く前に「今は答える問いがありません」が出る。

オーバーレイで開くなら、`UModal` の body slot に入れる（画面2）。

```vue
<UModal
  v-model:open="followupOpen"
  title="AI からの質問"
  :dismissible="false"
  :close="false"
  :ui="{ content: 'max-w-2xl', body: 'flex min-h-0 flex-col overflow-y-hidden' }"
>
  <template #body>
    <AgentQuestion
      :question="question"
      :waiting="waiting"
      waiting-message="AI が次を考えています…"
      :answered="answered"
      submit-label="答える"
      @answer="send"
    />
  </template>

  <template #footer>
    <span class="text-xs text-muted">答えると、AI がさらに聞いてくることがあります</span>
  </template>
</UModal>
```

`:dismissible="false"` と `:close="false"` は、答え終わるまで閉じさせないため
（ESC・背景クリック・閉じるボタンのいずれも受け付けない）。
`:ui` の `body` 指定は省けない。理由は下の「設計上の注記」に書く。
footer には注記だけを置く。**送信ボタンを footer へ出さない。**

なお `UModal` は既定で `unmountOnHide`（reka-ui `DialogRoot` の既定値 `true`）なので、
閉じると body ごと破棄される。開き直すと面は新しく組み立て直され、書きかけは残らない。

### 3. 開く引き金を決める

モーダルで開く場合だけ要る。`open` は置く側が持ち、いつ開くかは画面ごとに違う。

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

## 設計上の注記

### 送信ボタンを面の中に置いている

`openspec/specs/agent-question/spec.md` が「並びと構成は画面によって変わらない」と規定するのは、
話題タグ → 詳細説明 → 問い本文 → 選択肢 → 自由入力欄の並びであって、**送信ボタンはそこに含まれない。**
つまり spec はボタンの置き場所を決めていない。それでも面の中に置いているのは、外へ出す2案が
どちらも成立しなかったため。

- `defineExpose` で送信のメソッドを親へ出す案: 親が子のメソッドを叩く形になる
- `v-model` で回答の下書きを親へ出す案: 描画に要る選択と自由入力は子に残るので状態が二重になる。
  加えて自由入力を全部消したとき下書きは `null → null` で変化せず、親の watch では notice を
  クリアできない

結果として、選択・自由入力・排他・notice・送信判定は全て面の中に閉じている。
置く側が与えるのはボタンの文言（`submit-label`）だけになる。

### モーダルに置くときは `:ui` の `body` 指定が要る

問いは詳細説明300字・選択肢5件までを許容する（`server/utils/stroke/question.ts` の契約）。
`UModal` の body は既定で `overflow-y-auto` なので、そのままだと長い問いのときに body 自身が
スクロールし、**送信ボタンが下へ流れて押せなくなる。**

`body: 'flex min-h-0 flex-col overflow-y-hidden'` で body 自身のスクロールを止め、縦の flex に
する。スクロールするのは面の中の「問いの中身」だけになり、送信ボタンはその外に残るので
常に見える。素置きの画面（画面1）は高さの制約が無いため、この手当ては要らない。

## 関連

- `docs/specs/reference/mdc-observations.md` — markdown モジュールが乗っている `@nuxtjs/mdc` の癖（崩れた前提7件と、それを固定しているテスト）
- `docs/specs/plan/next-agent-run.md` — この2つを汎用のエージェント実行へ広げる案（未着手）
- `openspec/specs/agent-question/spec.md` — 振る舞いの規定（本体）
- `openspec/specs/proposal-review/spec.md` — 画面2 に固有の規定
- `docs/specs/api/contract.md` — サーバとの境界
- `docs/specs/architecture/question-flow.md` — 往復の全体像（誰がいつ何を送るか）
- `docs/specs/core/schema.md` — 入れ物の形と検証の規定
- `shared/stroke.ts` — `Question` / `Answer` の型（import は `#shared/stroke`）
