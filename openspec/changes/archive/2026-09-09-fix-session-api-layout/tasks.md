## 1. 着手の記録

- [x] 1.1 `openspec/tickets/fix-session-api-layout.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（この worktree のブランチは `fix-session-api-layout`、セッション ID は `92d3ea72-e0cf-4412-a969-d5e6aaab99d7`）。既に同じものがあれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. spec の扱いの確認

- [x] 2.1 capability `server/api-layout` が `openspec/specs/server/api-layout/spec.md` に既にあり、この change が要件を変えないことを確かめる（proposal「Capabilities」）。他の change の `specs/server/api-layout/` に delta が無いことも見る
- [x] 2.2 `openspec/changes/fix-session-api-layout/.openspec.yaml` に `skip_specs: true` が入っていることを確かめる（delta ゼロの change は これが無いと `openspec validate` に弾かれる。`docs/agents/issue-tracker.md`「進捗と検証」）

## 3. handler 13 本の移動（design「移動の表」）

- [x] 3.1 移動先のディレクトリを `mkdir -p` で先に作る（`git mv` はディレクトリを作らない）
- [x] 3.2 U 系 8 本を `git mv`（`strokes.get` / `answer.post` / `send-back.get` / `send-back.post` / `approve.post` / `approve.delete` / `invoke-agent.get` / `promote.post` を `strokes/[id]/<name>/index.<method>.ts` へ）
- [x] 3.3 A 系 4 本を `git mv`（`overview.get` / `question.post` / `proposal.post` / `submission.post` を `strokes/[id]/<name>/index.<method>.ts` へ）
- [x] 3.4 U15 を `git mv`（`sessions/[id]/activate.post.ts` → `sessions/[id]/activate/index.post.ts`）
- [x] 3.5 移した 13 本の相対 import を `../../../utils/…` → `../../../../utils/…` に直す（design「移動の手段」）。`#shared` の alias と外部パッケージの import は触らない。handler の本体・docblock・型は 1 文字も変えない
- [x] 3.6 差分が「移動 + import 行」だけであることを `git diff --cached -M` で確かめる（13 本すべてが rename として検出されること） — 13 本すべて `R`（rename）で検出。変更行は import の 61 行のみ

## 4. テストの写しの追随（design「テストの写し」）

- [x] 4.1 `test/server/api/strokes/` の 9 本を `git mv` で `<name>/index.<method>.test.ts` へ（`invoke-agent.multiplex.test.ts` は `invoke-agent/multiplex.test.ts`）
- [x] 4.2 `test/server/api/sessions/activate.post.test.ts` を `sessions/activate/index.post.test.ts` へ `git mv`
- [x] 4.3 移した 10 本の `await import()` が指す handler の path を移動後の形に直す（`…/[id]/answer.post` → `…/[id]/answer/index.post`）
- [x] 4.4 移した 10 本の相対 path の深さを 1 段増やす。`'../support'` → `'../../support'`、`'../../../../server/…'` → `'../../../../../server/…'`。**`vi.mock` の第 1 引数と `importOriginal<typeof import(...)>` の中も同じ数だけ直す**（文字列なので typecheck では落ちない）
- [x] 4.5 移した 10 本の冒頭 docblock の「対象は `server/api/…`」の行を移動後の path に直す。テスト同士が互いのファイル名を指している行も直す。`question/index.post.test.ts` の docblock が挙げていた「`[id]` の段を挟まない理由」（vitest の glob が文字クラスとして解釈する）は現在の設定では成り立たないので、その 1 箇所を事実に合わせて書き直す（design「テストの写し」の 2 つ目の代替バレット）
- [x] 4.6 `test/server/api/support.ts` の使い方の例に、段数がテストの位置で決まる旨の注記を足す。元の例は `'../../../server/api/...'` で移動前から 1 段浅く誤っていた。移動後のテストは深さ 5、移動しない `sessions/index.delete.test.ts`・`projects/index.post.test.ts` は深さ 4 で、1 つの数字では書けない — 例は動く形（深さ 4）のまま残し、`// 段数はテストの位置で決まる` を添えた
- [x] 4.7 `test/server/utils/stroke/creation-broadcast.test.ts` の docblock が指すテストの位置（`activate.post.test.ts`・`promote.post.test.ts`）を移動後の path に直す

## 5. `test/server/api/projects/index.delete.test.ts` の階層合わせ（design の同名の節。`fix-project-api-layout` からの申し送り）

- [x] 5.1 `test/server/api/projects/index.delete.test.ts` を `test/server/api/projects/[projectId]/index.delete.test.ts` へ `git mv` し、`'../support'` と `'../../../../server/…'` の深さを 1 段増やす（`await import()` が指す handler は移動していないのでそのまま）
- [x] 5.2 `test/server/handler/delete.test.ts` の docblock がこのテストの位置を書いているので追随させる

## 6. 検証（design「検証の順序」）

- [x] 6.1 `yarn typecheck` — 相対 import の付け替え漏れがゼロであること — exit 0
- [x] 6.2 `yarn test` — 移した 10 本を含む既存の単体テストが全て通ること。`vi.mock` の付け替え漏れはここでしか落ちない — 78 ファイル 1020 件 pass。移動前と同じファイル数で、`test/server/api/projects/[projectId]/index.delete.test.ts` も収集されている（`yarn vitest list` で確認）。途中 2 回落ちている。(1) 移動直後の 1 回目に `test/server/utils/stroke/reap.test.ts` の 2 件（実プロセスを起こして止める検査。当時の load average は 10 超）。回し直して pass。(2) santa-method の 1 周目の指摘を直した後に `test/server/api/strokes/question/index.post.test.ts` が transform error でファイルごと落ちた。**docblock に書いた glob の中の閉じ記号がブロックコメントを途中で閉じていたため**で、書き方を変えて解消した（コメントだけの編集でもファイルが壊れうる実例）
- [x] 6.3 `yarn build && yarn test:e2e` — 移動後のファイルから同じ URL が組み立てられ、セッションの画面が動くこと。E2E は 50000 番から空きポートを自動で取る。**起こしたものは必ず止め、ポートの解放を確かめる** — build は exit 0。**ビルドが登録した `/api/**` の route キーの一覧（`.nuxt/types/nitro-routes.d.ts` の 29 本）を移動前の worktree（`pre3`）のものと `diff` して差分ゼロ**（URL 集合が 1 つも増減していない直接の証拠）。比較元の `pre3` の `.nuxt` は `fix-project-api-layout` より前の生成物なので、`/api/projects` の Method の並びだけはこの比較の外にある。**セッション系（下に挙げる 13 の route キー）については、route と Method の対応（15 組）まで一致している。** 内訳は `/api/strokes/:id/{answer,approve,invoke-agent,overview,promote,proposal,question,send-back,strokes,submission}`・`/api/strokes/:id`・`/api/sessions/:id/activate`・`/api/sessions/:id` で、移動前のファイル名から Nuxt の規則で導かれる URL 集合と一致する。全件実行（246 件）は 233 pass / 4 fail / 9 未実行。落ちた 4 件は `stroke-exit:140`（本家への登録の依頼。spec 自身のコメントが書くとおり 60 秒ごとの巡回が登録を増やしうる）と `upstream-style` の寸法検査 3 件（`:294`・`:402`・`:470`）で、いずれも handler の path に依らない。実行中の load average が 22 を超えていたので**負荷起因と推定する**。負荷が下がってから当該 2 spec を回し直して **47 件すべて pass**（未実行だった 9 件を含む）。起こした Playwright・Chromium・スタブは終了済みで、50000 番台のポートは解放を確認
- [x] 6.4 移した handler の旧 path を指す記述が残っていないことを 2 つの `grep` で確かめる（prefix 付きの形と、短い名前だけの形。design「Risks」）。走査範囲は `test/`・`server/`・`scripts/`・`docs/` と、親の `openspec/`（archive 済みを除く change と ticket）— design「コード中のコメントが指すファイル名は据え置き」の 2 つの表に挙げた分（`server/mcp/tools/**`・`server/utils/stroke/**`・`scripts/stroke-check.ts`・移した handler 自身の docblock・親の `openspec/`）を除くと、残るのは `test/` の 2 行だけで、それは移動していない `server/api/sessions/[id]/index.delete.ts` を指す正しい参照である。旧テストファイル名（`<name>.<method>.test.ts`）への参照は `test/`・`server/`・`scripts/` で 0 件

## 7. 上位資料への整合反映（design「`.spec-workflow/steering/structure.md` の 1 行」。親が許可済み）

- [x] 7.1 親の実体 `/opt/projects/stroke-board/.spec-workflow/steering/structure.md` 37 行目の server API ルートの命名例を `projects/index.get.ts`・`projects/index.post.ts` の形に直す（worktree には無いので、この change の PR には載らない。git への反映は親）
- [x] 7.2 `docs/specs/api/overview.md`・`docs/specs/api/server.md` を変更していないことを `git status docs/` で確かめる（基準は触らない）。`docs/` 全体が無変更であることも見る（proposal「Impact」の docs は無し） — `git status --short docs/` は空

## 8. 完了条件の確認（Gitea #13「完了条件」）

- [x] 8.1 `find server/api/strokes server/api/sessions -type f` の結果がすべて `index.<method>.ts` であること — 17 本すべて該当
- [x] 8.2 `find server/api -type f` に `index.<method>.ts` でないものが 1 本も無いこと（プロジェクト系を含めた `server/api/` 全体が capability `server/api-layout` の到達点に届いたこと） — 30 本すべて `index.<method>.ts`。`! -name 'index.*.ts'` の結果は 0 件
- [x] 8.3 全 endpoint が同じ URL で応答すること（6.2 と 6.3 の結果で判定する）
- [x] 8.4 `openspec validate --all --store stroke` でこの change が `✓` になること（`change/fix-session-api-layout` `✓`・`spec/server/api-layout` `✓`）。capability `server/api-layout` の Scenario「到達点に達しているかを走査で判定する」「Endpoint 名をファイル名に持つ handler がある」「handler を移す」「移した後に旧 path を残そうとする」を満たすことを、8.1・8.2・6.3・移動の差分で確かめる
- [x] 8.5 **#17（`fix-session-api-namespace`）へ引き継ぐ 3 件を親への報告に書く**（design にしか残らず、archive すると辿れなくなるため）— (1) テストの位置に `[id]` の段を挟むかどうかの判断、(2) `test/server/api/sessions/index.delete.test.ts` が `projects` の件と同型のずれを残していること、(3) `server/mcp/tools/**`・`server/utils/stroke/**`・`scripts/stroke-check.ts`・移した handler 自身の docblock が旧ファイル名を指したままであること。あわせて、親の `openspec/` の稼働中 ticket 3 本（`replace-polling-with-push.md` 34・35 行、`fix-retry-count-without-launch.md` 59 行、**#17 が吸収する `fix-session-api-path.md` 41 行**）が実在しない path を指すことも報告する — 親への最終報告に記載する

## 9. レビュー

- [x] 9.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。対象は 3〜7 の差分すべてと artifact。指摘が出たら直して再実行し、**2 レビュアーが両方パスするまで続ける**（この環境に `typescript-reviewer` エージェントは無いので、`/santa-method` の既定どおり独立した 2 つの汎用レビュアーで代替した） — 4 周かけて両方 PASS（critical なし）。1 周目は 2 人とも FAIL（design に韓国語の混入／`creation-broadcast.test.ts` の 1 行が旧名のまま／`question/index.post.test.ts` の docblock が偽の根拠を残したまま 7 本から参照されている／proposal のテスト本数が 1 本多い／E2E 未実施のままレビューに入っている）。2 周目も 2 人とも FAIL で、指摘は同じ 1 点に収束——**旧 path の掃き出しが親の `openspec/` を走査していない**。3 周目は 1 人 PASS・1 人 FAIL（`openspec/config.yaml` の「レビューは末尾 2 タスクの直前」に対し引き継ぎのタスクが間に挟まっていた。8.5 へ移した）。4 周目で 2 人とも PASS。あわせて拾った指摘も反映した——据え置き表への `openspec/tickets/fix-session-api-path.md` 41 行の追加、`git diff -M` の rename 検出を据え置きの理由から外したこと、掃き出しの grep が拡張子を省いた略記を取りこぼすこと、`support.ts` の例と本数の書き方

## 10. 締め

- [x] 10.1 change の成果物を commit する（この worktree のブランチへ直接。`CLAUDE.md`「Worktree 運用」）。`git push -u origin fix-session-api-layout` の後、`tea pr create --base pre3` で PR を出す（マージはしない） — `96916948`（27 ファイル。rename 24 ＋ 変更 3、176 行追加 / 168 行削除）。push 済み。PR は [#23](http://192.168.1.202/gitea/grrowapp/stroke/pulls/23)（base `pre3`）。親の `openspec/` 側（proposal / design / tasks / ticket）と親の実体の `.spec-workflow/steering/structure.md` は未コミットで、親の取り込み commit に委ねる
- [x] 10.2 ユーザーから完了承認を得て、`openspec/tickets/fix-session-api-layout.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）。**この change では親が PR のマージをもって代行するので、担当は 10.1 まで進めて親へ報告する**
