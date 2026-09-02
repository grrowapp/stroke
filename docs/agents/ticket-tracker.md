# Ticket

`openspec/tickets/<change-id>.md` の運用。起票の規定は `docs/agents/issue-tracker.md`「ticket の起票」。

## 起票の主体

frontmatter `origin` に、起票を誰の判断で行ったかを書く。起票と同時に書き、後で書き換えない。

| 値 | 意味 |
| --- | --- |
| `user` | ユーザーの指示で起票した |
| `agent` | エージェントの判断で起票した。ユーザー指示の change から派生して切り出したものも含む |

## エージェント主体の起票

`origin: agent` の ticket は、本文に次の2つを書く。

- **経緯** — 何を見て起票を判断したか。派生なら元の change-id
- **畳む方向** — 何をすれば archive できるか

## ユーザーへ判断を求めるとき

change の作業中にユーザーへ判断や承認を求めるときは、次の形で出す。

- 選択肢は **挙動の差** で示す — 「こう操作するとこうなる」。実装の選択肢をそのまま並べない
- ticket の `origin`・経緯・畳む方向を添える。ユーザーが ticket や change を遡らずに済む状態で問う
- 挙動の差に落とせない問いは、その形のままでは持ち込まない

## ラベル設定

frontmatter `status` に入れる値。

作業の段階を表す4値だけを持つ。**どの artifact まで書けたかは持たない** — それは `openspec/changes/<change-id>/` を見れば分かることで、ticket に写すと二重管理になる。

### Open

change を起票した時点で入る列。`openspec/changes/<change-id>/` と `openspec/tickets/<change-id>.md` が揃っただけで、artifact はまだ何も書いていない状態を指す。起票と同時に ticket の `status` へ `Open` と書く。

### Planning

artifact を書いている列。artifactの作成に着手したら status に `Planning` と書く。

### Doing

実装している列。**tasks.md の先頭タスクとして ticket の `status` へ `Doing` と書く。** 書き換えは tasks の一部であり、タスクの消化状況から後で推定するものではない。

### Wait-for-archive

tasks.md の末尾タスクでユーザーから完了承認を得たら、同じタスクの中で status に `Wait-for-archive` と書く。`openspec archive <change-id>` を実行するまでこの値のまま置き、archive したら ticket を `openspec/tickets/.archive/` へ移す。
