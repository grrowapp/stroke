# 問いの往復

ユーザー・画面・サーバ・エージェントの4者が、いつ何を送り、サーバの中身がどう動くかを図で示す。

状態の正はサーバのファイル（`state.json` / `strokes.json`）にある。WS はバッファを持たず、
繋がっている接続へその場で流すだけ。図と実装が食い違ったら実装が正しい。

矢印に付けた番号（U1・U7・U9・U13・A5・A7・A9・W1・W2）は `docs/specs/api/contract.md` の一覧と同じもの。
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
    Note over S: state.json に今の1問<br/>記録だけ。配信しない
    Note over S,A: claude が終わり、invokeAi が完了を検知する
    Note over S: A9 実行の決着（submitted=question）
    S-->>V: W1 今の1問
    Note over S: invocation=idle
    V->>U: 問いを出す

    U->>V: 答える
    V->>S: U7 POST /api/:id/answer
    Note over S: strokes.json に往復を1行<br/>今の1問は消さない
    V->>S: U13 GET /api/:id/invoke-agent
    S->>A: claude を継続

    Note over A: 把握完了
    A->>S: A7 POST /api/:id/proposal
    Note over A: docs/proposal.md を書く<br/>（書き手は claude。サーバーは書かない）
    Note over S: strokes.json にマーカー行（初回のみ）<br/>記録だけ。phase は動かない
    Note over S,A: claude が終わり、invokeAi が完了を検知する
    Note over S: A9 実行の決着（submitted=proposal）<br/>phase=proposed / 今の1問を消す
    S-->>V: W2 proposal と名前候補
    Note over S: invocation=idle
    Note over V: 待機が明け、新しい問いは来ない<br/>画面が今の1問を手放す

    U->>V: 指摘を積んで差し戻す
    V->>S: U9 POST /api/:id/send-back
    Note over S: 指摘一式を保存
    V->>S: U13 GET /api/:id/invoke-agent
    S->>A: claude を継続
    A->>S: A4 GET /api/:id/send-back

    alt 問い返しを返す
        A->>S: A5 POST /api/:id/question
        Note over S: A9 実行の決着（submitted=question）
        S-->>V: W1 今の1問
        U->>V: 答える
        V->>S: U7 POST /api/:id/answer
        V->>S: U13 GET /api/:id/invoke-agent
    else そのまま出し直す
        A->>S: A7 POST /api/:id/proposal
        Note over S: A9 実行の決着（submitted=proposal）
        S-->>V: W2 出し直された proposal
        Note over V: 画面が今の1問を手放す
    end

    U->>V: 承認する
    V->>S: U10 POST /api/:id/approve
    Note over S: phase=approved<br/>プロジェクトを作る
```

受理する endpoint（U1・U7・U9）は記録までで完結し、AI を起動しない。起動は U13 だけが行い、
画面が受理の成功応答の直後に呼ぶ。**提出を受ける endpoint（A5・A7）も記録までで完結する**——
局面の切り替えと配信は持たない。結果は、その提出を行った実行が決着した瞬間（A9）に WS で
画面へ届く。承認の操作が現れるのは決着の後なので、承認による改名（U14）が走っている claude と
重なることは無い。

往復が決着したとき、新しい問いが来ていなければ、画面が握っている今の1問を手放す。これは画面側で
起きる。

## 状態

サーバが持つファイルは2つ。今の局面を持つ `state.json` と、済んだ往復を積む `strokes.json`。

```mermaid
stateDiagram-v2
    [*] --> stroking: U1 概要の投稿

    state stroking {
        [*] --> 問い無し
        問い無し --> 答え待ち: A5 問いの提出 → A9 決着
        答え待ち --> 答え待ち: U7 回答<br/>（今の1問は消えない）
        答え待ち --> 答え待ち: A5 次の問い → A9 決着<br/>（上書き）
    }

    stroking --> proposed: A7 proposal の提出 → A9 決着<br/>今の1問を消す

    state proposed {
        [*] --> 確認中
        確認中 --> 差し戻し済み: U9 差し戻し
        差し戻し済み --> 問い返し待ち: A5 問い返し → A9 決着
        問い返し待ち --> 問い返し待ち: U7 回答<br/>（今の1問は消えない）
        問い返し待ち --> 確認中: A7 出し直し → A9 決着<br/>今の1問を消す
        差し戻し済み --> 確認中: A7 出し直し → A9 決着
    }

    proposed --> approved: U10 判断 → U14 昇格
    approved --> activated: U15 完成の記録<br/>（steering が文書を出し終えた）
    activated --> [*]
```

**局面が変わるのは提出の受理ではなく決着（A9）の時点である。** 提出（A5・A7）はその材料を
記録するだけで、局面はまだ動かない。

`invocation` は上の局面とは別に動く。U13 で `running`、実行の決着を済ませた後に `idle`、
リトライが尽きたとき `failed`。書くのは invokeAi だけである（A8）。

`strokes.json` は U7 で往復を1行、A7 の**初提出だけ**でマーカー行を1行積む。出し直しでは増えない。

**今の1問は `state.json`、済んだ往復は `strokes.json`。** 回答（U7）は `strokes.json` を増やすが、
`state.json` の今の1問は消さない。消えるのは A5 の上書きか、proposal の決着（A9）のときだけ。

## 配信

W1（今の1問）と W2（proposal）は、どちらも2つの経路で流れる。

```mermaid
flowchart LR
    subgraph サーバ
        SJ[(state.json)]
        A5W[A5 の受理]
        A7W[A7 の受理]
        INV[invokeAi<br/>完了を検知する]
        SET[A9 実行の決着]
        REG[["接続の集合<br/>Map: sessionId → peers"]]
    end

    subgraph claude
        PM[("docs/proposal.md<br/>書き手は claude だけ")]
    end

    A5W -->|書く| SJ
    A7W -->|書かない| PM
    A5W -.->|その起動で何を出したか| INV
    A7W -.->|その起動で何を出したか| INV
    INV -->|完了時に叩く| SET
    SET -->|読む / phase を書く| SJ
    SET -->|読む| PM
    SET -->|決着時配信| REG

    OPEN1[W1 の接続] -->|接続時配信で読む| SJ
    OPEN2[W2 の接続] -->|接続時配信で読む| PM

    REG -->|繋がっている全接続へ| V[画面]
    SJ -.->|その接続へ1件| V
    PM -.->|その接続へ1件| V
```

**決着時配信**: エージェントの提出を受けた実行が完了し、invokeAi が決着した瞬間、その提出に
応じたものを、そのセッションに繋がっている全接続へ流す。**提出を受理した瞬間には流れない。**

**接続時配信**: 画面が繋いだ瞬間、サーバがファイルを読んでその接続にだけ1件流す。
W1 は `state.json` の今の1問があれば流す。**答え済みかどうかは見ていない。**

W1 が流すのは問いだけで、**問いの取り下げは流れない**。proposal の決着（A9）は `state.json` の
今の1問を消すが、配信するのは W2 だけ。画面はそれを知る手段を持たないため、往復の決着（新しい問いが来ないまま
待機が明けたとき）に、画面側が自分で今の1問を手放している。

接続の集合（`server/utils/ws-channels.ts`）が持つのはセッション id と接続だけで、
内容は保持しない。再送のための待ち行列も無い。

## 関連

- `docs/specs/api/contract.md` — endpoint の一覧と契約
- `docs/specs/core/schema.md` — 入れ物の形と検証の規定
- `docs/specs/reference/stroke-modules.md` — 画面側の使い方
