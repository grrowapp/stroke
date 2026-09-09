## 1. 着手の記録

- [x] 1.1 `openspec/tickets/fix-project-api-layout.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（この worktree のブランチは `fix-project-api-layout`、セッション ID は `child-12`）。既に同じものがあれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」） — `fix-project-api-layout/child-12` を追記

## 2. capability の新設

- [x] 2.1 `openspec/specs/server/api-layout/` と、他の change の `specs/server/api-layout/` が既に無いことを確かめる（design「capability の置き場」。`fix-session-api-layout` が先に置いていたら新設せずそちらに寄せる） — どちらも無く、この change が新設した
- [x] 2.2 `openspec/changes/fix-project-api-layout/specs/server/api-layout/spec.md` に delta を書く（`## Purpose` と `## ADDED Requirements`。正は規範に置き、食い違ったら規範が勝つと明記する ＝ design「capability の書き方」） — Requirement 4 本（root handler・Method ごとの handler・動的 Endpoint・移しても Endpoint の見え方は変わらない）
- [x] 2.3 `openspec validate --all --store stroke` を回し、この change が valid になることを確かめる — `change/fix-project-api-layout` は `✓`。同じ実行で 9 本が落ちるが、いずれも骨組みだけの既存 change（`create-feature`・`create-spec-document`・`fix-agent-question-api-path`・`fix-retry-count-without-launch`・`fix-submit-document-project-name`・`reorganize-server-utils`・`spec-document-management`・`update-changes-operation-flow`・`view-openspec-changes`）で、この change の範囲外

## 3. handler 9 本の移動（design「移動の表」）

- [x] 3.1 移動先のディレクトリを `mkdir -p` で先に作る（`git mv` はディレクトリを作らない）
- [x] 3.2 `server/api/projects.get.ts` → `server/api/projects/index.get.ts` を `git mv`
- [x] 3.3 `server/api/projects/[projectId]/info.get.ts` → `[projectId]/info/index.get.ts` を `git mv`
- [x] 3.4 `[projectId]/approvals/[approvalId]/content.get.ts` → `…/[approvalId]/content/index.get.ts`、`[approvalId]/[action].post.ts` → `…/[approvalId]/[action]/index.post.ts` を `git mv`
- [x] 3.5 `[projectId]/specs/[specName]/documents.get.ts`・`tasks.get.ts`・`[document].put.ts` を `…/[specName]/documents/index.get.ts`・`…/tasks/index.get.ts`・`…/[document]/index.put.ts` へ `git mv`
- [x] 3.6 `[projectId]/steering/[name].get.ts`・`[name].put.ts` を `…/steering/[name]/index.get.ts`・`index.put.ts` へ `git mv`（同じ Endpoint の 2 Method が 1 ディレクトリに並ぶ）
- [x] 3.7 移動した 9 本の相対 import を 1 段深くする（design「移動の手段」の内訳表）。`#shared` の alias と外部パッケージの import は触らない。handler の本体・docblock・型は 1 文字も変えない
- [x] 3.8 `git status` の差分が「移動 + import 行」だけであることを `git diff --cached -M` で確かめる — 9 本すべて `R`（rename）で検出され、変更行は import の 18 行だけ

## 4. テストの写しの確認

- [x] 4.1 `test/server/api/projects/` に、移動した 9 本を対象とする単体テストが無いことを確かめる（`index.delete.test.ts`・`index.post.test.ts` はいずれも移動しない handler が対象。あれば `<name>/index.<method>.test.ts` へ動かして import を直す） — 無し。写しの追随は不要
- [x] 4.2 `test/server/utils/upstream/read-only.test.ts` が `server/utils/upstream/` だけを走査し handler の名前に依らないことを確かめる — `UPSTREAM_DIR = join(process.cwd(), 'server/utils/upstream')` のみ

## 5. 検証（design「検証の順序」）

- [x] 5.1 `yarn typecheck` — 相対 import の付け替え漏れがゼロであること — pass
- [x] 5.2 `yarn test` — 既存の単体テストが全て通ること — 78 ファイル 1012 件 pass
- [x] 5.3 `yarn build && yarn test:e2e` — 移動後のファイルから同じ URL が組み立てられ、プロジェクト系の画面が動くこと。E2E は空きポートを自動で取る。**起こしたものは必ず止め、ポートの解放を確かめる** — build pass。ビルド成果の nitro が登録した `/api/projects…` の route は、移動前のファイル名から Nuxt の規則で導かれる URL 集合と一致する（`/api/projects` の GET と POST、`/:projectId` の DELETE、`/:projectId/info`・`/:projectId/approvals`・`/:approvalId/content`・`/:approvalId/:action`・`/:projectId/specs`・`/:specName/documents`・`/:specName/tasks`・`/:specName/:document`・`/steering/:name` の GET と PUT）。1 回目の全件実行（246 件）は 234 pass / 3 fail / 9 未実行で、落ちた 3 件はいずれも `resetBoard`（`test/e2e/support.ts:131`）が本家接続の印を 5 秒で待てなかったもの（`document-editing:152`・`upstream-style:915`）と、巡回が起こし直した登録が混ざる `stroke-exit:140`。3 件とも handler の path に依らない（接続の印は本家 WS と registry に由来して REST を通らず、登録は移動していない `projects/index.post.ts` の受け口である）。機序は 2 種で、`resetBoard` の 2 件は接続待ちのタイムアウト——実行中に別 worktree の typecheck が重なって load average が 8 を超えていたので**負荷起因と推定する**（実行時の観測で、ログには残らない）。`stroke-exit:140` は別筋で、spec 自身のコメント（`test/e2e/stroke-exit.spec.ts:143-146`）が書くとおり 60 秒ごとの巡回が `failed` を起こし直して登録を増やすためと**推定する**（ログから読めるのは `registrations.every(...)` が false という事実まで）。負荷が下がってから当該 3 spec を回し直して **61 件すべて pass**（未実行だった 9 件を含む）。起こした Playwright・Chromium・スタブは終了済みで、50000 番台のポートは解放を確認

## 6. 上位資料への整合反映（design「`docs/specs/architecture/spec-screen-flow.md` の書き換え案」。承認済み）

- [x] 6.1 `docs/specs/architecture/spec-screen-flow.md`「位置」の表の本文 API の行を `…/specs/[specName]/documents/index.get.ts` へ直す（ユーザー承認 2026-09-09）。一覧 API の行・`docs/specs/plan/artifact-extension-plan.md`・`docs/adr/0018` は触らない
- [x] 6.2 `docs/specs/api/overview.md`・`docs/specs/api/server.md` を変更していないことを `git status` で確かめる（基準は触らない） — `git status docs/specs/api/` は空

## 7. 完了条件の確認（Gitea #12「完了条件」）

- [x] 7.1 `find server/api/projects -type f` の結果がすべて `index.<method>.ts` であること — 13 本すべて該当
- [x] 7.2 `server/api/projects.get.ts` が存在しないこと
- [x] 7.3 `openspec validate --all --store stroke` でこの change が `✓` になり、capability `server/api-layout` の delta が読めること（同じ実行で落ちる 9 本は範囲外の既存 change。内訳は 2.3）
- [x] 7.4 `spec-screen-flow.md` の「位置」が実在するファイルを指していること（表の全行を実ファイルと突き合わせる） — 13 個の参照先すべて実在

## 8. レビュー

- [x] 8.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。対象は 2〜6 の差分すべて。指摘が出たら直して再実行し、**2 レビュアーが両方パスするまで続ける**（この環境に `typescript-reviewer` エージェントは無いので、`/santa-method` の既定どおり独立した 2 つの汎用レビュアーで代替した） — 3 周かけて両方 PASS。1 周目は 2 人とも FAIL（capability spec が「規範を写さない」と述べながら写していた矛盾／Scenario が現状に反する断定をしていた／単体テストの規則が既存 capability `app-structure` と二重／tasks 5.3 が未完了の E2E を「全 spec pass」と書いていた）。2 周目は 1 人 PASS・1 人 FAIL（親が持つ `.spec-workflow/steering/structure.md` 37 行目の見落とし）。3 周目で 2 人とも PASS、critical なし

## 9. 締め

- [x] 9.1 change の成果物を commit する（この worktree のブランチへ直接。`CLAUDE.md`「Worktree 運用」）。`git push -u origin fix-project-api-layout` の後、`tea pr create --base pre3` で PR を出す（マージはしない） — `dd78dc8b`（9 rename ＋ import 18 行 ＋ docs 1 行）。push 済み。PR は [#21](http://192.168.1.202/gitea/grrowapp/stroke/pulls/21)（base `pre3`、No Conflicts）。親の `openspec/` 側（proposal / design / tasks / spec / ticket）は未コミットで、親の取り込み commit に委ねる
- [x] 9.2 ユーザーから完了承認を得て、`openspec/tickets/fix-project-api-layout.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）。**この change では親が PR のマージをもって代行するので、担当は 9.1 まで進めて親へ報告する**
