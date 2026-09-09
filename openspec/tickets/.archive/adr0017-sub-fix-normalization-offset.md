---
status: ready-for-human
change: adr0017-sub-fix-normalization-offset
tags:
  - bug
---

# adr0017-sub-fix-normalization-offset

本番の呼び出し側が、正規化していない生文字列を渡している。

`app/pages/projects/[projectId]/approvals/[approvalId].vue` の `source` が、`MarkdownView` にも**注釈の基準**にもそのまま渡っている。CRLF を含む文書が来ると、いま在る注釈機能が黙ってずれる。実測では `null` に倒れず、**黙って別の場所を返す** — 本文の `b` を選ぶと front matter の `b` が返る反例が取れている。

本家が返す文書に CRLF や front matter が含まれうることも実測済みである。本家は `readFile` / `writeFile` で素通しし、改行を触るコードが `dist` に0件。アプリ側の正規化も0件である。

**決めが2件ある。実装の前に決める。**

- 注釈のオフセットを**どの座標で保存するか**（生ファイルの座標 / 正規化後の座標）。オフセットは本家へ送られて保存される。正規化した座標で保存すると、ディスク上の生ファイルとずれた値が残り、あとから別の道具がその注釈を生ファイルに当てると合わない。本家に保存された注釈を誰が読むかを調べてから決める
- 正規化を**どこで行うか**（モジュールの内側 / 呼ぶ側）。「呼ぶ側が忘れずにやる」は、いま潰そうとしている黙って壊れる形そのものである

`e2e/fixtures/upstream-stub.mjs` が `\n` 直書きのみで、この2件を一切カバーしていない。

`create-module-markdown` から分けた。`adr0017-sub-add-position-port-preview` の後続で、口の形が固まってから、口が受け取る座標の基準を決める。
