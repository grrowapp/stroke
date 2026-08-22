# 未解消の事項

**まだ change に起こしていないもの**だけを置く。change を作ったらここから消す（実体は `openspec/changes/<change-id>/` に移る）。作業単位の管理は `docs/agents/issue-tracker.md` のとおり OpenSpec の change が担う。

## 置き場への要求の強さが、機能ごとに違うのに書かれていない

`server/utils/paths.ts` は `SESSIONS_ROOT` と `PROJECTS_ROOT` の定数を2つ持つだけで、**誰がその置き場に何を要求するのか**が書かれていない。

`/opt/projects` は、承認時にプロジェクトを生成する側には書き込みが要るが、そこに何があるかを読むだけの用途には読み取りで足りる。`stroke-board` へ統合すると、後者（プロジェクト一覧の母集合として走査する側）が同じディレクトリを読む。

厳しいほうの要求を全体に及ぼすと、読み取りで足りる使い方が書き込み権限の不足で止まる。下記の「起動時チェックがプロセスごと落とす」と合わせて直すのが自然。

## 起動時チェックがプロセスごと落とす

`server/plugins/00.startup-checks.ts` は、3つの前提（`/var/lib/stroke-board/sessions` への書き込み・`/opt/projects` への書き込み・`runtimeConfig.claude` の妥当性）のうち1つでも欠けると `process.exit(1)` で Nitro のサーバープロセスごと終了する。

`throw` が握り潰されるという問題への回避策としてプロセスを殺しているが、**その前提を必要としない機能まで巻き添えになる**。AI を起動しないセッションの一覧や削除も、`runtimeConfig.claude` が不正だと実行できない。`/opt/projects` は用途によって読み取りで足りるのに、書き込み必須の要求でプロセスを殺している。

直すべきは手段であって、意図（実行中に初めて気付かせない）ではない。チェック結果の適用範囲を、プロセス全体から機能単位に絞る。

## プロジェクト名の連番採番に上限が無い

`server/utils/project.ts:59-61` の `for (let n = 2; ; n++)` は終了条件を持たない。既存名が多いと際限なく回る。

## コメントが実在しないファイルを指している

`server/utils/paths.ts:6` と `server/plugins/00.startup-checks.ts:22` のコメントが `server/plugins/00.writable.ts` を指しているが、実体は `00.startup-checks.ts`。
