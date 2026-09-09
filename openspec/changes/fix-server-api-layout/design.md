## Context

動機と分解の全体は proposal.md（Why / What Changes）。ここは**親 change として子 change 8 本をどう回すか**を決める。

現状と制約:

- `openspec/` は親（`/opt/projects/stroke-board`、`develop` の実体）だけが持ち、各 worktree は sparse checkout で除外している（`CLAUDE.md`「前提」）。子 change の artifact と ticket はすべて親の `openspec/` に書く
- 作業は worktree 単位で、合流点はこの worktree のブランチ `pre3`。`develop` へのマージはユーザー指示と承認が要る（`CLAUDE.md`「Worktree 運用」）
- リモートは Gitea（`grrowapp/stroke`）。issue は #10 #11 #12 #13 #17 #15 #18 #19（親 #14）。PR は `tea` で出し、マージも `tea pr merge` で行える
- ticket の運用は `docs/agents/ticket-tracker.md`（`status` 4 値・`origin`・エージェント主体の起票の「経緯」「畳む方向」）、change の運用は `docs/agents/issue-tracker.md`（同時起票・archive・上位資料への整合反映は design で提案し承認後）
- `openspec/config.yaml` の tasks ルール: 先頭 2 タスク（`Doing`・`tags`）、末尾 2 タスク（commit・`Wait-for-archive`）、その直前に `typescript-reviewer` による `/santa-method` レビュー
- E2E のポートは実行のたびに空きを取るので worktree を並べて回せる。dev サーバーは今回の検証に要らない

## Goals / Non-Goals

**Goals:**

- 子 change 8 本を、依存の順序を守りながら、1 issue = tasks の 1 区切りとして最後まで実行する
- 子 change の成果は change 名のブランチで作り、PR（base `pre3`）を経て `pre3` に取り込む。最後に `pre3` から親ブランチへ PR を出す
- 子 change の作業は opus に委ね、親（このセッション）はゲート（起票・順序・PR のマージ・issue のクローズ・規範の確認）だけを持つ

**Non-Goals:**

- 子 change の設計そのもの（各子 change の design.md が持つ。issue に書いた「修正するファイル」と各セクションが出発点）
- `develop` へのマージ（PR を出すところまで。マージはユーザー）
- `docs/specs/api/overview.md`・`server.md` の変更

## Decisions

### 子 change の起票 — issue 1 本 = change 1 本で、親と同じ運用に載せる

各 issue に対し `openspec new change <change-id>` と ticket（`openspec/tickets/<change-id>.md`）を同時に起票する。ticket は `origin: agent`（ユーザー指示の親 change から派生。`ticket-tracker.md`「起票の主体」）で、本文に「経緯」（親 change と Gitea issue 番号）と「畳む方向」を書く。artifact は `/openspec-ff-change` で proposal → specs → design → tasks を揃え、`/openspec-apply-change` で実行し、`openspec archive` で閉じる。

- 代替: 親の tasks.md に 8 本分の実装タスクを直接並べる → 1 change が巨大になり、spec の delta の帰属（#11 の `api/session/promote`、#12 の capability など）が親に集まって archive 時の `openspec/specs` への取り込みが混ざる。却下
- 代替: Gitea issue だけで回し openspec を使わない → repo の issue tracker は openspec（`issue-tracker.md`）。却下

### 作業場所とブランチ — change 名の worktree、ブランチ名 = change-id、base = `pre3`

`git worktree add /home/vagrant/work/stroke-board/<change-id> -b <change-id> pre3` で切り、既存 worktree と同じ sparse checkout（`openspec/`・`.spec-workflow/` を除外）を設定する。子 change の担当は worktree の中で作業し、artifact だけを親の `openspec/` へ書く。

- 代替: `pre3` 上で直接ブランチを切り替える → 並走できず、親のゲート作業と混ざる。却下
- 依存の無い子 change（#10・#11・#12、後段の #18・#19）は worktree を並べて同時に進める。直列（#13 → #17 → #15）は前の PR が `pre3` に入ってから切る

### 担当とゲート — 担当は opus のサブエージェント。親はゲートだけ

子 change の ff（artifact 作成）と apply（実装）は `general-purpose` サブエージェント（model: opus）に委ねる。渡すものは: change-id・Gitea issue 番号と本文・worktree の path・`CLAUDE.md`／`docs/agents/*.md`／`openspec/config.yaml` を読んでから始めること・`docs/specs/api/overview.md` と `server.md` を触らないこと・完了条件（issue の「完了条件」）・PR を出すところまで。

- 2026-09-09 の再分割で「作業量が多い」issue は無くなったので fable は使わない（ユーザーの指摘「作業量が多いものは split が甘い」を受けての再分割）
- 子 change の tasks.md にも `openspec/config.yaml` のルール（先頭 2・末尾 2・santa-method）が入る。末尾の「ユーザーから完了承認」は不要とユーザーが決めた（2026-09-09「末尾タスクのユーザー承認は不要。お前の確認で進めろ」）。親が完了条件を確かめ、PR のマージをもって代える。子 ticket の `Wait-for-archive` と archive は親が行う

### PR とマージ — PR は `tea pr create --base pre3`、マージは親が `tea pr merge --style merge`

子の santa-method レビューが通り、`yarn test`・`yarn typecheck` が worktree で通っていることを親が確認してからマージする。マージ後に `pre3` を `git pull --ff-only` で更新し、worktree を `git worktree remove` で消し、Gitea issue を `tea issues close` で閉じる（Gitea は default branch 以外へのマージで issue を自動クローズしない）。

- 代替: squash → 子 change の commit が消え、tasks の「成果物を commit」の記録と PR の対応が追えなくなる。却下
- 代替: rebase-merge → 履歴は直線だが、既存の運用（`Merge remote-tracking branch 'origin/pre6' into develop`）は merge commit。合わせる

### openspec 成果物のコミット — 親の working tree に溜め、最後にまとめて `develop` へコミットする（承認制）

子 change の artifact・ticket・archive は親の `openspec/` に書かれるが、それは `develop` の working tree である。`develop` へのコミットはユーザー承認が要る（`CLAUDE.md`）。子 change ごとにコミットせず、親 change の末尾タスクで「`update openspec: fix-server-api-layout の子 change 8 本の archive を取り込む`」として 1 回、承認を得てコミットする。

- 代替: 子 change ごとに `develop` へコミット → 承認が 8 回要る。却下
- リスク: 途中で親の working tree が壊れると 8 本分の記録が失われる → 各子 change の archive 直後に `git -C /opt/projects/stroke-board status --short openspec/` で存在を確認し、記録を Gitea PR 本文にも写す

### 旧 ticket の吸収 — 旧 ticket / change を #17 の子 change に吸収する

`fix-session-api-path.md` と `fix-agent-question-api-path.md` は #17 の子 change に吸収する。#17 の archive と同時に、両 ticket を `openspec/tickets/.archive/` へ移し（中身は当時のまま。`issue-tracker.md`「過去の記録」）、README だけの `openspec/changes/fix-agent-question-api-path/` を消す。

### 用語 handler — CONTEXT.md に登録しない

一般的なプログラミング用語として扱う。定義は Gitea #15 と子 change `update-session-api-handler` の design が持つ。

### docs の書き換え — `docs/specs/api/` の外の docs は、子 change が「関連 docs」として design で提案し、承認後に直す

対象は issue に列挙済み（#12: `spec-screen-flow.md`、#17: `system-structure.md`・`session-workflow.md`・`settings-reference.md`・`file-composables.md`、#15: `system-structure.md`・`server-structure.md`）。plan・検討資料・ADR は据え置く。`issue-tracker.md`「更新対応」のとおり、子 change の design.md で書き換え案を出し、承認を得てから反映する。承認は親が子の design を読んでユーザーに問う。

## Risks / Trade-offs

- [子 change の apply が途中で止まる（テスト失敗・環境）] → 親は worktree を残したまま次に依存しない子 change を進め、止まった子は同じ worktree で再開する。依存する後段は待つ
- [`pre3` に PR を順に入れるので、後段の worktree が古い `pre3` から切られる] → 直列の子 change は前の PR のマージと `git pull --ff-only` の後に切る。並走の子 change は触るファイルが重ならないことを issue で確認済み
- [#17 の URL 変更で、`pre3` を dev で動かしている画面が一時的に 404 になる] → 同じ PR で画面・E2E を追随させる。`pre3` の dev サーバーは検証に使わない
- [`typescript-reviewer` エージェントがこの環境に無い] → `/santa-method` の既定のレビュアー構成で代替し、tasks にその旨を書く
- [子 change の artifact が親の `openspec/` に溜まり、`develop` の working tree が長く dirty になる] → 「openspec 成果物のコミット」。途中経過は `openspec validate --all` を各子 change の archive 後に回して壊れていないことを確かめる
- [Gitea の issue 番号と change-id の対応が散る] → 子 ticket の本文と PR 本文に issue 番号を書き、Gitea issue には PR 番号をコメントする

## Migration Plan

1. #10・#11・#12 の worktree を切り、並走で ff → apply → PR → マージ → archive
2. #13 → #17 → #15 を直列で同じ流れ
3. #18・#19 を並走で同じ流れ
4. `yarn test`・`yarn test:e2e`・`openspec validate --all` を `pre3` で通す
5. `openspec` の成果物を `develop` にコミット（承認制）。`pre3` から親ブランチへ PR

巻き戻し: 各 PR は独立にリバートできる。#17 だけは URL 変更を含むので、リバートするときは画面・E2E も同じ PR のリバートで戻る。

## Open Questions

なし。
