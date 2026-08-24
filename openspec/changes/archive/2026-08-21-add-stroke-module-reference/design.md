## Context

動機は proposal.md（Why）を見ること。ここでは資料の置き方を決めるうえで効く制約だけを挙げる。

- `docs/api-contract.md` は「画面・エージェントとサーバの境界」を1枚で示す地図として既にある。表と番号（U/W/A）で引ける形
- 振る舞いの規定は `openspec/specs/<capability>/spec.md` が本体。`docs/` にはこれまで規定を二重に置いていない
- `modularize-agent-question` が切り出すのは `useAgentQuestion`（往復）と `AgentQuestionModal`（面）の2つ。まだ実装されていない

## Goals / Non-Goals

**Goals:**

- 切り出す2つについて、置く側が資料だけを読んで設置できるようにする
- 実装前に呼び出し形で認識を合わせ、着地点をずらさない
- 資料と spec のどちらが本体かを、読む人が迷わないようにする

**Non-Goals:**

- コードの変更。この change は資料だけを足す
- 振る舞いの規定を資料側へ移すこと
- 既存の composable（`useQuestionChannel` ほか）の記述。切り出す2つだけを扱う
- `app/components/` 全体の一覧

## Decisions

### 1. 資料は使い方、spec は規定。同じことを二度書かない

`docs/stroke-modules.md` に書くのは、引数・返り値・設置の手順・呼び出し例。「回答するまで閉じない」「並びは画面によって変わらない」といった規定は書かず、`openspec/specs/agent-question` への参照だけを置く。

**Alternatives considered:**
- 資料に規定も要約して載せる案: 読むのは楽になるが、要約は必ず本体から遅れる。片方を直したときにもう片方が残り、どちらが本体か分からなくなる
- spec に使い方も書く案: spec は振る舞いの契約で、関数名や引数は本来入らない（schema の instruction が明示的に避けろと言っている）

### 2. 置き場所は `docs/stroke-modules.md`

切り出す対象（stroke のモジュール）の名前をそのままファイル名にする。`docs/api-contract.md` がサーバ境界の地図であるのと同じ並びに置く。

**Alternatives considered:**
- `docs/composables.md`: 層全体を扱う名前になり、載せる対象と食い違う
- `docs/agents/` 配下: あそこはエージェントの働き方の置き場で、実装の資料ではない

### 3. まだ無いものなので、冒頭に「予定」と明記する

資料の冒頭に、これが `modularize-agent-question` の着地点であり、実装はまだ入っていないことを書く。実装が入った時点で印を外す。

**Alternatives considered:**
- 実装後に書く案: 認識合わせという目的そのものが果たせない
- 印を付けずに書く案: 資料が実装より先に走っていることが読み手に伝わらない

### 4. 2つの節を同じ見出しで揃える

`useAgentQuestion` と `AgentQuestionModal` を「何を持つか / 何に依存するか / どこから呼ばれるか / 呼び出し例」の4点で揃える。

**Alternatives considered:**
- 節ごとに書き方を変える案: 後で3つ目のモジュールが増えたときに、書くべきことが決まらない

### 5. `useAgentQuestion` の呼び出し形（この資料が固める中身）

資料に載せる素案。`modularize-agent-question` の design（決定1〜4）をそのまま呼び出し側の言葉に直したもの。

**状態は全て返り値として出し、外から渡させない。** `@vueuse/core` の `useWebSocket(url, options)` と同じ形にする——`options` は振る舞いの設定だけを取り、`data` / `status` のような観測する変数は返り値に出す（型定義で確認）。今回は振る舞いの設定に当たるものが無いので、引数はセッション id 1つ。

```ts
// 置く側が書くのはこれだけ
const { question, waiting, failed, answered, send } = useAgentQuestion(sessionId)

// question  今の1問（W1 から届く。届いていなければ null）
// waiting   次を待っているか
// failed    AI から応答が得られなかったか
// answered  ここまでに答えた数
// send(answer)  回答を送り、AI の起動まで要求する
```

```vue
<!-- 面。開閉は置く側が持つ（modularize-agent-question design 決定4） -->
<AgentQuestionModal
  v-model:open="followupOpen"
  :question="question"
  :waiting="waiting"
  :answered="answered"
  waiting-message="AI が次を考えています…"
  @answer="send"
/>
```

**Alternatives considered:**
- 待機の実体を `options` で渡させる案: 置く側に中の作りを知ることを強いるだけになる（`modularize-agent-question` design 決定3）
- 面が composable を内側で呼ぶ案（置く側は `<AgentQuestionModal :session-id="id" />` だけ）: 置くのは最も楽だが、往復だけを使いたい画面が composable を取り出せない

この素案は資料を書く時点で確定させる。実装で覆ったら、資料を直してから実装を進める（proposal の順序）。

## Risks / Trade-offs

- **資料が実装より先に走り、着地点が変わると嘘になる** → 冒頭に予定であることと change id を明記し（決定3）、`modularize-agent-question` の tasks に「実装後に資料を合わせる」を足す
- **spec と資料の役割分担が、書く人によって崩れる** → 資料の冒頭に、これが使い方だけを扱うことと、規定の参照先を書く
