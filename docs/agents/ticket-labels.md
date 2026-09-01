# Ticket status

`openspec/tickets/<change-id>.md` の frontmatter `status` に入れる値。

## Open

change を起票した時点で入る列。`openspec/changes/<change-id>/` と `openspec/tickets/<change-id>.md` が揃っただけで、artifact はまだ何も書いていない状態を指す。起票と同時に ticket の `status` へ書き、最初の artifact である proposal が出来上がるまでこの列に留まる。

## Proposal

openspec の proposal phase の作業を終え、その phase で指定されたファイルを書き出したら、ticket の `status` に `Proposal` と書く。

## Design

openspec の design phase の作業を終え、その phase で指定されたファイルを書き出したら、ticket の `status` に `Design` と書く。

## Tasks

openspec の tasks phase の作業を終え、その phase で指定されたファイルを書き出したら、ticket の `status` に `Tasks` と書く。

## Wait-for-archive

`openspec list` で change の status が `complete` になったら、ticket の `status` に `Wait-for-archive` と書く。`openspec archive <change-id>` を実行するまでこの値のまま置き、archive したら ticket を `openspec/tickets/.archive/` へ移す。
