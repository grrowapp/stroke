# 問いの往復

ユーザー・画面・サーバ・エージェントの4者が、いつ何を送り、サーバの中身がどう動くかを図で示す。

状態の正はサーバのファイル（`state.json` / `strokes.json`）にある。WS はバッファを持たず、
繋がっている接続へその場で流すだけ。図と実装が食い違ったら実装が正しい。

矢印に付けた番号（U1・U7・U9・U13・A5・A7・W1・W2）は `docs/specs/api/api-contract.md` の一覧と同じもの。
入れ物の形と検証の規定は `docs/specs/core/schema.md` を参照。

## 並び

概要から承認までの一巡。差し戻しと問い返しを含む。

```mermaid
sequenceDiagram
    actor U as ユーザー
    participant V as 画面
    participant S as サーバ
    participant A as エージェント

    U->>V: 概要を書く
    V->>S: U1 POST /api/overview
    S-->>V: sessionId
    Note over S: state.json を作る<br/>phase=stroking / 問い無し / idle
    V->>S: U13 GET /api/:id/invoke-agent
    Note over S: invocation=running
    S->>A: claude を起動

    A->>S: A5 POST /api/:id/question
    Note over S: state.json に今の1問<br/>invocation=idle
    S-->>V: W1 今の1問
    V->>U: 問いを出す

    U->>V: 答える
    V->>S: U7 POST /api/:id/answer
    Note over S: strokes.json に往復を1行<br/>今の1問は消さない
    V->>S: U13 GET /api/:id/invoke-agent
    S->>A: claude を継続

    Note over A: 把握完了
    A->>S: A7 POST /api/:id/proposal
    Note over S: proposal.md を書く<br/>strokes.json にマーカー行（初回のみ）<br/>phase=proposed / 問い無し / idle
    S-->>V: W2 proposal と名前候補
    Note over V: 待機が明け、新しい問いは来ない<br/>画面が今の1問を手放す

    U->>V: 指摘を積んで差し戻す
    V->>S: U9 POST /api/:id/send-back
    Note over S: 指摘一式を保存
    V->>S: U13 GET /api/:id/invoke-agent
    S->>A: claude を継続
    A->>S: A4 GET /api/:id/send-back

    alt 問い返しを返す
        A->>S: A5 POST /api/:id/question
        S-->>V: W1 今の1問
        U->>V: 答える
        V->>S: U7 POST /api/:id/answer
        V->>S: U13 GET /api/:id/invoke-agent
    else そのまま出し直す
        A->>S: A7 POST /api/:id/proposal
        S-->>V: W2 出し直された proposal
        Note over V: 画面が今の1問を手放す
    end

    U->>V: 承認する
    V->>S: U10 POST /api/:id/approve
    Note over S: phase=approved<br/>プロジェクトを作る
```

受理する endpoint（U1・U7・U9）は記録までで完結し、AI を起動しない。起動は U13 だけが行い、
画面が受理の成功応答の直後に呼ぶ。結果はエージェントの提出（A5・A7）が WS で画面へ届く。

往復が決着したとき、新しい問いが来ていなければ、画面が握っている今の1問を手放す。これは画面側で
起きる。

## 状態

サーバが持つファイルは2つ。今の局面を持つ `state.json` と、済んだ往復を積む `strokes.json`。

```mermaid
stateDiagram-v2
    [*] --> stroking: U1 概要の投稿

    state stroking {
        [*] --> 問い無し
        問い無し --> 答え待ち: A5 問いの提出
        答え待ち --> 答え待ち: U7 回答<br/>（今の1問は消えない）
        答え待ち --> 答え待ち: A5 次の問い<br/>（上書き）
    }

    stroking --> proposed: A7 proposal の提出<br/>今の1問を消す

    state proposed {
        [*] --> 確認中
        確認中 --> 差し戻し済み: U9 差し戻し
        差し戻し済み --> 問い返し待ち: A5 問い返し
        問い返し待ち --> 問い返し待ち: U7 回答<br/>（今の1問は消えない）
        問い返し待ち --> 確認中: A7 出し直し<br/>今の1問を消す
        差し戻し済み --> 確認中: A7 出し直し
    }

    proposed --> approved: U10 承認
    approved --> [*]
```

`invocation` は上の局面とは別に動く。U13 で `running`、A5 と A7 の受理で `idle`、
リトライが尽きたとき `failed`（`server/utils/ai.ts`）。

`strokes.json` は U7 で往復を1行、A7 の**初提出だけ**でマーカー行を1行積む。出し直しでは増えない。

**今の1問は `state.json`、済んだ往復は `strokes.json`。** 回答（U7）は `strokes.json` を増やすが、
`state.json` の今の1問は消さない。消えるのは A5 の上書きか A7 の受理のときだけ。

## 配信

W1（今の1問）と W2（proposal）は、どちらも2つの経路で流れる。

```mermaid
flowchart LR
    subgraph サーバ
        SJ[(state.json)]
        PM[(proposal.md)]
        A5W[A5 の受理]
        A7W[A7 の受理]
        REG[["接続の集合<br/>Map: sessionId → peers"]]
    end

    A5W -->|書く| SJ
    A7W -->|書く| PM
    A5W -->|提出時配信| REG
    A7W -->|提出時配信| REG

    OPEN1[W1 の接続] -->|接続時配信で読む| SJ
    OPEN2[W2 の接続] -->|接続時配信で読む| PM

    REG -->|繋がっている全接続へ| V[画面]
    SJ -.->|その接続へ1件| V
    PM -.->|その接続へ1件| V
```

**提出時配信**: エージェントが提出した瞬間、そのセッションに繋がっている全接続へ流す。

**接続時配信**: 画面が繋いだ瞬間、サーバがファイルを読んでその接続にだけ1件流す。
W1 は `state.json` の今の1問があれば流す。**答え済みかどうかは見ていない。**

W1 が流すのは問いだけで、**問いの取り下げは流れない**。A7 は `state.json` の今の1問を消すが、
配信するのは W2 だけ。画面はそれを知る手段を持たないため、往復の決着（新しい問いが来ないまま
待機が明けたとき）に、画面側が自分で今の1問を手放している。

接続の集合（`server/utils/ws-channels.ts`）が持つのはセッション id と接続だけで、
内容は保持しない。再送のための待ち行列も無い。

## 関連

- `docs/specs/api/api-contract.md` — endpoint の一覧と契約
- `docs/specs/core/schema.md` — 入れ物の形と検証の規定
- `docs/specs/reference/stroke-modules.md` — 画面側の使い方
