# Ticket status

`openspec/tickets/<change-id>.md` の frontmatter `status` に入れる値。

作業の段階を表す4値だけを持つ。**どの artifact まで書けたかは持たない** — それは `openspec/changes/<change-id>/` を見れば分かることで、ticket に写すと二重管理になる。

## Open

change を起票した時点で入る列。`openspec/changes/<change-id>/` と `openspec/tickets/<change-id>.md` が揃っただけで、artifact はまだ何も書いていない状態を指す。起票と同時に ticket の `status` へ書き、最初の artifact である proposal が出来上がるまでこの列に留まる。

## Planning

artifact を書いている列。`proposal.md` が書き出されたら `Planning` と書く。

specs・ui・design のどれが書き出されても値は変えない。`tasks.md` が書き出されるまでこの値のまま置く。

## Doing

実装している列。`tasks.md` が書き出されたら `Doing` と書き、`openspec list` で change の status が `complete` になるまでこの値のまま置く。

## Wait-for-archive

`openspec list` で change の status が `complete` になったら `Wait-for-archive` と書く。`openspec archive <change-id>` を実行するまでこの値のまま置き、archive したら ticket を `openspec/tickets/.archive/` へ移す。
