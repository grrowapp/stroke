## 1. 開始

- [x] 1.1 `openspec/tickets/fix-server-api-layout.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `pre3/92d3ea72-e0cf-4412-a969-d5e6aaab99d7` を追記する（既にあれば追記しない。`docs/agents/issue-tracker.md`「ticket の起票」）
- [x] 1.3 作業規範を読み直す: `CLAUDE.md`・`docs/agents/issue-tracker.md`・`docs/agents/ticket-tracker.md`・`openspec/config.yaml`・design.md の Decisions の各節。子 change の担当へ渡す共通の指示文（読むもの・触らないもの・PR まで）を `openspec/changes/fix-server-api-layout/.brief.md` に置く

## 2. Gitea #10 — `fix-api-contract-path-drift`（並走その1）

- [x] 2.1 子 change `fix-api-contract-path-drift` と ticket を同時起票する（`openspec new change`。ticket は `status: Open`・`origin: agent`、本文に経緯＝親 `fix-server-api-layout` と Gitea #10、畳む方向）。Gitea #10 に change-id をコメントする
- [x] 2.2 worktree `/home/vagrant/work/stroke-board/fix-api-contract-path-drift` をブランチ `fix-api-contract-path-drift`（base `pre3`）で切り、sparse checkout を `pre3` と同じ（`openspec/`・`.spec-workflow/` 除外）にする
- [x] 2.3 opus サブエージェントで ff（proposal → specs → design → tasks）。design の docs 書き換え案（`contract.md` の見出し 8 本）をユーザーに提示し承認を得る（design.md「docs の書き換え」）
- [x] 2.4 opus サブエージェントで apply（子 tasks を最後まで。子 ticket の `Doing`・tags・santa-method を含む）
- [x] 2.5 親が worktree で `openspec validate --all` を通し、Gitea #10 の完了条件（`grep -rn "api/strokes" docs/specs/api` の残り）を照合する
- [x] 2.6 PR（base `pre3`）を出してマージし、`pre3` を ff で更新、worktree を消す（design.md「PR とマージ」）
- [x] 2.7 子 change を archive（ticket `Wait-for-archive` → `.archive/`）。`openspec validate --all`。Gitea #10 をクローズ

## 3. Gitea #11 — `fix-promote-name-conflict-withdrawal`（並走その1）

- [x] 3.1 子 change `fix-promote-name-conflict-withdrawal` と ticket を同時起票する（`origin: agent`、経緯＝親と Gitea #11、畳む方向）。Gitea #11 に change-id をコメント
- [x] 3.2 worktree `/home/vagrant/work/stroke-board/fix-promote-name-conflict-withdrawal` をブランチ同名（base `pre3`）で切り、sparse checkout を揃える
- [x] 3.3 opus サブエージェントで ff。specs の delta（`api/session/promote`・`project/generation`）が issue のとおりか親が確認する
- [x] 3.4 opus サブエージェントで apply（`promote.post.ts`・テスト・`useProposalReview.ts` の補いの除去）
- [x] 3.5 親が worktree で `yarn test`・`yarn typecheck` を通し、Gitea #11 の完了条件（衝突後に `decision` が無い）を照合
- [x] 3.6 PR（base `pre3`）を出してマージし、`pre3` を ff で更新、worktree を消す
- [x] 3.7 子 change を archive（ticket → `.archive/`）。`openspec validate --all`。Gitea #11 をクローズ

## 4. Gitea #12 — `fix-project-api-layout`（並走その1）

- [x] 4.1 子 change `fix-project-api-layout` と ticket を同時起票する（`origin: agent`、経緯＝親と Gitea #12）。Gitea #12 に change-id をコメント
- [x] 4.2 worktree `/home/vagrant/work/stroke-board/fix-project-api-layout` をブランチ同名（base `pre3`）で切り、sparse checkout を揃える
- [x] 4.3 opus サブエージェントで ff。`server.md` の置き方の capability（候補 `server/api-layout`）の置き場と Requirement を親が確認する。`spec-screen-flow.md` の書き換え案をユーザーに提示し承認を得る（design.md「docs の書き換え」）
- [x] 4.4 opus サブエージェントで apply（handler 9 本の移動・import・テストの写し・capability・docs 1 行）
- [x] 4.5 親が worktree で `yarn test`・`yarn typecheck`・`yarn test:e2e` を通し、Gitea #12 の完了条件（`find server/api/projects -type f` がすべて `index.<method>.ts`）を照合
- [x] 4.6 PR（base `pre3`）を出してマージし、`pre3` を ff で更新、worktree を消す
- [x] 4.7 子 change を archive（ticket → `.archive/`）。`openspec validate --all`。Gitea #12 をクローズ

## 5. Gitea #13 — `fix-session-api-layout`（#11 の後）

- [x] 5.1 子 change `fix-session-api-layout` と ticket を同時起票する（`origin: agent`、経緯＝親と Gitea #13）。Gitea #13 に change-id をコメント
- [x] 5.2 #11 のマージ後の `pre3` から worktree `/home/vagrant/work/stroke-board/fix-session-api-layout` を切り、sparse checkout を揃える
- [x] 5.3 opus サブエージェントで ff。capability は #12 のもの（`server/api-layout`）を使い、二重に作らないことを親が確認する
- [x] 5.4 opus サブエージェントで apply（handler 13 本の移動・import・テスト 10 本の写し）
- [x] 5.5 親が worktree で `yarn test`・`yarn typecheck`・`yarn test:e2e` を通し、Gitea #13 の完了条件（`server/api/strokes`・`sessions` がすべて `index.<method>.ts`、URL 不変）を照合
- [x] 5.6 PR（base `pre3`）を出してマージし、`pre3` を ff で更新、worktree を消す
- [x] 5.7 子 change を archive（ticket → `.archive/`）。`openspec validate --all`。Gitea #13 をクローズ

## 6. Gitea #17 — `fix-session-api-namespace`（#13 の後）

- [x] 6.1 子 change `fix-session-api-namespace` と ticket を同時起票する（`origin: agent`、経緯＝親と Gitea #17、吸収する旧 ticket 2 本）。Gitea #17 に change-id をコメント
- [x] 6.2 #13 のマージ後の `pre3` から worktree `/home/vagrant/work/stroke-board/fix-session-api-namespace` を切り、sparse checkout を揃える
- [x] 6.3 opus サブエージェントで ff。関連 docs 4 ページ（`system-structure.md`・`session-workflow.md`・`settings-reference.md`・`file-composables.md`）の書き換え案をユーザーに提示し承認を得る（design.md「docs の書き換え」）。spec `server/session-management` の delta を親が確認
- [x] 6.4 opus サブエージェントで apply（ディレクトリ移動・WS route・`wsPathPattern`・サーバ内参照・画面 8 本・`useAgentQuestion` の基底・テスト・E2E 5 本・`.claude/settings.json`・spec・docs 4 ページ・`useAgentQuestion` 経路のテスト追加）
- [x] 6.5 親が worktree で `yarn test`・`yarn typecheck`・`yarn test:e2e` を通し、Gitea #17 の完了条件（`grep -rn "api/strokes" app server shared test .claude` の残りが A 系と MCP tools だけ。問い返しの回答送信が 404 にならない）を照合
- [x] 6.6 PR（base `pre3`）を出してマージし、`pre3` を ff で更新、worktree を消す
- [x] 6.7 子 change を archive（ticket → `.archive/`）。旧 ticket `fix-session-api-path.md`・`fix-agent-question-api-path.md` を `.archive/` へ移し、README だけの `openspec/changes/fix-agent-question-api-path/` を消す（design.md「旧 ticket の吸収」）。`openspec validate --all`。Gitea #17 をクローズ

## 7. Gitea #15 — `update-session-api-handler`（#17 の後）

- [x] 7.1 子 change `update-session-api-handler` と ticket を同時起票する（`origin: agent`、経緯＝親と Gitea #15）。Gitea #15 に change-id をコメント
- [x] 7.2 #17 のマージ後の `pre3` から worktree `/home/vagrant/work/stroke-board/update-session-api-handler` を切り、sparse checkout を揃える
- [x] 7.3 opus サブエージェントで ff。切り出しの物差しの capability（候補 `server/api-handler`）の Requirement と、handler の粒度・名前・`session-core` の取り込み・共有の「後始末」（`toHttp`）を親が確認する。`system-structure.md`・`server-structure.md` の書き換え案をユーザーに提示し承認を得る（design.md「docs の書き換え」）
- [x] 7.4 opus サブエージェントで apply（U 系 11 本の切り出し・`server/handler/` 新設・`session-core` の統一・テストの寄せ替え・capability・docs 2 ページ）
- [x] 7.5 親が worktree で `yarn test`・`yarn typecheck`・`yarn test:e2e` を通し、Gitea #15 の完了条件（api が「読む → handler → 返す」、`*Core` が残っていない、E2E の応答が不変）を照合
- [x] 7.6 PR（base `pre3`）を出してマージし、`pre3` を ff で更新、worktree を消す
- [x] 7.7 子 change を archive（ticket → `.archive/`）。`openspec validate --all`。Gitea #15 をクローズ

## 8. Gitea #18 — `update-stroke-api-handler`（#15 の後。並走その2）

- [x] 8.1 子 change `update-stroke-api-handler` と ticket を同時起票する（`origin: agent`、経緯＝親と Gitea #18）。Gitea #18 に change-id をコメント
- [x] 8.2 #15 のマージ後の `pre3` から worktree `/home/vagrant/work/stroke-board/update-stroke-api-handler` を切り、sparse checkout を揃える
- [x] 8.3 opus サブエージェントで ff。#15 の capability と `handler/` の置き方に従うことを親が確認する（新しい capability は作らない）
- [x] 8.4 opus サブエージェントで apply（A 系 5 本と WS route 2 本の切り出し・テストの寄せ替え）
- [x] 8.5 親が worktree で `yarn test`・`yarn typecheck`・`yarn test:e2e` を通し、Gitea #18 の完了条件（W1/W2 の接続時配信と A7 の順序が不変）を照合
- [x] 8.6 PR（base `pre3`）を出してマージし、`pre3` を ff で更新、worktree を消す
- [x] 8.7 子 change を archive（ticket → `.archive/`）。`openspec validate --all`。Gitea #18 をクローズ

## 9. Gitea #19 — `update-project-api-handler`（#15・#12 の後。並走その2）

- [x] 9.1 子 change `update-project-api-handler` と ticket を同時起票する（`origin: agent`、経緯＝親と Gitea #19）。Gitea #19 に change-id をコメント
- [x] 9.2 #15 のマージ後の `pre3` から worktree `/home/vagrant/work/stroke-board/update-project-api-handler` を切り、sparse checkout を揃える
- [x] 9.3 opus サブエージェントで ff。#15 の capability と共有の「後始末」を使うことを親が確認する
- [x] 9.4 opus サブエージェントで apply（プロジェクト系 5 本の切り出し・`resolveName` の handler 化・`toHttp` の統一・テストの寄せ替え）
- [x] 9.5 親が worktree で `yarn test`・`yarn typecheck`・`yarn test:e2e` を通し、Gitea #19 の完了条件（`toHttp` が 1 つ、本家仲介の応答が不変）を照合
- [x] 9.6 PR（base `pre3`）を出してマージし、`pre3` を ff で更新、worktree を消す
- [x] 9.7 子 change を archive（ticket → `.archive/`）。`openspec validate --all`。Gitea #19 をクローズ

## 10. 全体の検証

- [x] 10.1 `pre3` で `yarn test`・`yarn typecheck`・`yarn test:e2e` を通す
- [x] 10.2 `docs/specs/api/` の規定と `server/api/` を突き合わせ直す: `find server/api server/routes -type f` がすべて `index.<method>.ts`（WS route を除く）、`grep -rn "api/strokes" app server shared test .claude` の残りが A 系と MCP tools だけ、`server/handler/` に実処理が揃い api が薄い層になっている
- [ ] 10.3 `openspec validate --all` を通し、子 change 8 本が `openspec/changes/archive/` に、ticket 8 本と旧 ticket 2 本が `openspec/tickets/.archive/` に在ることを確認する
- [ ] 10.4 Gitea #14 に完了の状況（PR 番号と change-id の対応）をコメントする
- [x] 10.5 起動したものが残っていないことを確認する（`pgrep -f "nuxt|playwright"`、worktree の残り、`git worktree list`）

## 11. レビュー

- [ ] 11.1 `typescript-reviewer` エージェント（この環境に無ければ `/santa-method` の既定の 2 レビュアー構成）で `/santa-method` レビューを実行する。対象は `pre3` に取り込まれた子 change 8 本の差分（`git diff <着手時の pre3>..pre3`）と、この change の artifact。完全にパスするまで指摘を直して繰り返す

## 12. 終了

- [x] 12.1 `pre3` から親ブランチ（`develop`）への PR を Gitea に出す（本文に Gitea #14 と子 PR 8 本の対応。マージはしない）
- [ ] 12.2 change の成果物を commit する: `openspec/` の親 change の artifact・子 change 8 本の archive・ticket の移動を、ユーザー承認のうえ `develop`（`/opt/projects/stroke-board`）に 1 回でコミットする（design.md「openspec 成果物のコミット」）
- [ ] 12.3 ユーザーから完了承認を得て、`openspec/tickets/fix-server-api-layout.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
