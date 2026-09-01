# Ticket status

`openspec/tickets/<change-id>.md` の frontmatter `status` に入れる値。

作業の段階を表す4値だけを持つ。**どの artifact まで書けたかは持たない** — それは `openspec/changes/<change-id>/` を見れば分かることで、ticket に写すと二重管理になる。

## Open

change を起票した時点で入る列。`openspec/changes/<change-id>/` と `openspec/tickets/<change-id>.md` が揃っただけで、artifact はまだ何も書いていない状態を指す。起票と同時に ticket の `status` へ `Open` と書く。

## Planning

artifact を書いている列。artifactの作成に着手したら status に `Planning` と書く。

## Doing

実装している列。**`openspec apply <change-id>` を実行するとき、その最初に ticket の `status` へ `Doing` と書く。** 書き換えは apply の手順の一部であり、タスクの消化状況から後で推定するものではない。

## Wait-for-archive

`openspec list` で change の tasks が A/B で A = B になったら status に `Wait-for-archive` と書く。`openspec archive <change-id>` を実行するまでこの値のまま置き、archive したら ticket を `openspec/tickets/.archive/` へ移す。
