## 1. 着手の記録

- [x] 1.1 `openspec/tickets/update-project-generation-via-upstream-rest.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（この worktree のブランチは `pre6`）。既に同じものがあれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. 落ちるテストを先に置く

- [x] 2.1 `test/server/api/projects/index.post.test.ts` を書く（design D7）。`server/utils/control/upstream-proxy` の `upstreamClient` と `readStrokeConfig` を差し替える。ケースは (1) 親の直下のパス → 204・`registerProject` がそのパスで1回呼ばれる、(2) 本文無し・文字列でない・相対パス・親の外・親そのもの・2階層下 → 400・`registerProject` は呼ばれない、(3) `unreachable` / `error-response` → 503、`malformed` → 502、(4) どのケースでも `session-store` の `readState` / `writeState` と `broadcastProjectCreation` が呼ばれない
- [x] 2.2 `test/server/utils/stroke/invoke.test.ts` を改める（design D2・D3・D6 単体）。(a) steering の `kick` が渡す組み立て方（`build`）が `/api/projects` へ `{ projectPath: cwd }` を POST してから材料を返し、POST が失敗すれば reject する。(b) ストロークの組み立て方は POST しない。(c) **削除の検証**: `mcpConfigOf('steering').mcpServers` のキーが `['stroke-board']` だけ、`launch.args` を結合した文字列に `spec-workflow-mcp` と `SPEC_WORKFLOW_HOME` が無い。既存の「本家 MCP に SPEC_WORKFLOW_HOME を渡す」「本家 MCP は `--mcp-config` に引き続き並ぶ」は反転させる。(d) 両工程の自前 MCP エントリのヘッダに `x-stroke-cwd` が cwd で載る
- [x] 2.3 `test/server/utils/stroke/reap-match.test.ts` の argv の見本を新しい配線（自前 MCP エントリのヘッダに cwd）に改め、`JSON.stringify(cwd)` で照合できることと、組み立て（`buildRun`）が作った args から同じ照合が通ることを見る（design D4）
- [x] 2.4 `test/server/utils/stroke/ai.test.ts` に、`build` が Promise を返すときも組み立て失敗の記録（`failed` / `error`・`built` の reject）が同じに働くケースを足す
- [x] 2.5 `test/server/mcp/tools/get-steering-guide.test.ts` の「本家 MCP は使わない」の節の検査を「配線されていない」の文言に合わせる（design D3）
- [x] 2.6 `test/server/utils/upstream/rest.test.ts` に `registerProject` のケースを足す（成功で `{ projectId }` が返る・500 → `error-response`・接続拒否 → `unreachable`・`projectId` を持たない 200 → `malformed`）
- [x] 2.7 `test/server/utils/upstream/read-only.test.ts` を「決めた4つ」に改める（design D5）: `FORBIDDEN_UPSTREAM_WRITES` から `/api/projects/add` を外す、`method: 'POST'` の数を 2 に、公開メソッドの一覧に `registerProject` を足す、docblock を4つへ
- [x] 2.8 `yarn test test/server/api/projects test/server/utils/stroke test/server/utils/upstream test/server/mcp/tools/get-steering-guide.test.ts` で、**直す前に落ちる**ことを確かめる

## 3. 接点層に登録の依頼を足す（design D5）

- [x] 3.1 `server/utils/upstream/schema.ts` に `projectRegistrationSchema`（`{ projectId: z.string(), success: z.literal(true) }`）と型を足す
- [x] 3.2 `server/utils/upstream/rest.ts` に `registerProject(projectPath)` を足す。`POST /api/projects/add` に `{ projectPath }` を送り、応答を 3.1 のスキーマで検証し（合わなければ `malformed`）、発行の失敗は `toFailure` で写す。docblock の「書き込みは決めた3つ」を4つに改め、登録の関数を置かないと書いていた記述を外す。`retry: 0`
- [x] 3.3 2.6・2.7 が通る

## 4. 生成の endpoint（design D1）

- [x] 4.1 `server/api/projects/index.post.ts` を書く。本文を `z.object({ projectPath: z.string().min(1) })` で読み（`readValidatedBody` か既存の `request-schemas.ts` の作法に合わせる）、`path.resolve(projectPath)` が `join(readStrokeConfig().projectShareRoot, basename)` と一致しなければ 400 → `upstreamClient().registerProject(projectPath)` → 失敗は `toHttpError(failure)` を throw → 204。docblock に「P 系（プロジェクトのリソースの作成。ユーザーは叩かない）」「id を取らない理由」「AI を起動しない・改名しない・phase も `invocation` も書かない・配信しない・`state.json` を読まない」「親の直下に限る理由」を書く
- [x] 4.2 2.1 が通る

## 5. AI の起動に乗せた生成を外し、起動の材料の組み立てで生成を依頼する（design D2・D3・D4）

- [x] 5.1 `server/utils/stroke/ai.ts`: `invokeAi` の `build` を `() => AiRun | Promise<AiRun>` にし、`run = await build()` にする。docblock に「組み立てが非同期になりうる。判定は足さない」を1文足す
- [x] 5.2 `server/utils/stroke/invoke.ts`: `kick` が `invokeAi` へ渡す組み立て方を async にし、steering では `await generateProject(cwd)`（相対パスの `$fetch` で `/api/projects` へ `{ projectPath: cwd }` を POST）を通してから `buildRun` を呼ぶ（`buildRun` は同期のまま。design D2 の訂正）
- [x] 5.3 `server/utils/stroke/invoke.ts`: `mcpConfigFor` から `specworkflow` エントリ（`npx` と `SPEC_WORKFLOW_HOME`）を外し、自前 MCP のエントリだけにする。`readServerConfig` の import と、`mcpConfigFor` の docblock（「`SPEC_WORKFLOW_HOME` を渡す。これが無いと steering 工程は成立しない」）を外す。steering 分岐のコメント（「本家 spec-workflow の MCP を与えて起こす（ADR 0011）」「`.spec-workflow/` の内部構造は本家 MCP が作る」）を「生成（P2）を依頼して本家に作らせる。本家 MCP は配線しない」に改める
- [x] 5.4 `server/utils/stroke/invoke.ts`: `mcpToolServerEntry` のヘッダに `x-stroke-cwd: <cwd>` を足す（両工程）。docblock に「起動時の後始末の照合（`reap-match.ts`）が argv に cwd を見つけるためのもので、サーバーは読まない」を書く
- [x] 5.5 `server/utils/mcp/allowed-tools.ts` から `UPSTREAM_MCP_SERVER_NAME` とその docblock を外す。`withMcpToolsAllowed` の docblock で本家 MCP に触れる箇所を外す
- [x] 5.6 `server/utils/stroke/reap-match.ts` の docblock を「cwd は自前 MCP エントリのヘッダ `x-stroke-cwd` に載る」に改める。照合の式は変えない
- [x] 5.7 `server/mcp/tools/get-steering-guide.ts` の「本家 MCP は使わない」の節を「本家 spec-workflow の MCP はこの工程に配線されていない。ツールの一覧に本家のツールは並ばない。取得と提出は stroke-board のツールだけ」に改める
- [x] 5.8 「本家 MCP が接続した瞬間に `.spec-workflow/` ができる」と書いたコメントを「生成（P2）の依頼を本家が受理したときにできる」に改める: `server/utils/stroke/activate-approved.ts`・`server/utils/control/directory.ts`・`server/utils/control/creating.ts`・`server/utils/stroke/project.ts`・`server/api/projects/[projectId]/index.delete.ts`・`test/server/api/sessions/activate.post.test.ts`・`test/server/api/projects/index.delete.test.ts`・`test/server/utils/control/directory-creating.test.ts`・`test/e2e/stroke-exit.spec.ts`
- [x] 5.9 2.2〜2.5 が通る。`grep -rn "specworkflow\|SPEC_WORKFLOW_HOME\|spec-workflow-mcp@latest" server test --include=*.ts` で、残っているのがポータルの登録簿の読み（`server/utils/config.ts`・`registry.ts`）だけであることを確かめる

## 6. E2E（design D6・D7）

- [x] 6.1 `test/e2e/fixtures/upstream-stub.mjs` に `POST /api/projects/add` を足す。`projectPath` 無しは 400。同じパスは同じ `projectId`、新規は採番して登録。`stats.registrations` に `{ projectPath }` を積み、`__control/stats` で返す
- [x] 6.2 `test/e2e/stroke-exit.spec.ts` に「承認して起動が要求されると、スタブの登録が1件で `projectPath` は `<projectShareRoot>/<name>`」を足す
- [x] 6.3 **削除の検証（E2E）**: 本家が登録を受け付けない状態（スタブの `__control/refuse-registration` で `POST /api/projects/add` を 500 で断る。スタブを止めるのではない——止めると同じプロセスの他の口も落ちる）で起動を要求すると 503、`invocation` は `failed` で起こし直しの回数が増え、スタブの登録は増えず、そのプロジェクトに `.spec-workflow/` が無い。受け付けるように戻して U13 を叩き直すと登録が1件増える。件数は巡回（60秒ごと）の起こし直しで増えうるので、固定値ではなく増分で見る
- [x] 6.4 `yarn build && yarn test:e2e test/e2e/stroke-exit.spec.ts test/e2e/degraded.spec.ts` が通る。使ったポートは Playwright のログで確かめ、終了後に `ss -tlnp` で残っていないことを見る

## 7. 検証

- [x] 7.1 `yarn test`
- [x] 7.2 `yarn typecheck`（`lint` の script は package.json に無い。`yarn check` = typecheck + spec）
- [x] 7.3 手動（design D7）: 空きポートで `yarn dev --port <n>` を起こし、既に本家に登録済みの完成済みプロジェクトのパスで `curl -i -X POST http://127.0.0.1:<n>/api/projects -H 'content-type: application/json' -d '{"projectPath":"/opt/projects/<name>"}'` を打って 204 が返り、本家 `GET /api/projects/list` の件数が増えないことを見る
- [x] 7.4 **削除の検証（実機。design D6）**: 本家 dashboard を動かした状態で `yarn check:stroke --approve` を1周する。steering の実行中に `pgrep -af "spec-workflow-mcp@latest"` を取り、**そのプロジェクトのパスを引数に持つプロセスが1つも無い**こと。終了後、`<specWorkflowHome>/activeProjects.json` でそのプロジェクトの `instances` が dashboard の PID 1件だけであること。サーバーログで P2 の依頼が起動1回につき1回出ていること。**起こしたサーバーと検証で作ったセッションを片付け、ポートの解放を確かめる**（`pgrep -f "nuxt dev"`・`ss -tlnp | grep <n>`）
- [x] 7.5 7.3・7.4 の結果（プロセス一覧と `instances` の実物）を ticket の本文に書き足す

## 8. 上位資料への整合反映（design D8。承認を得てから書く）

- [x] 8.1 design D8 の表と `CONTEXT.md` の差分をユーザーへ示し、承認を得る。**承認前に docs を書き換えない**
- [x] 8.2 承認された差分だけを書く。却下された項目は design D8 に「却下」と理由を残す

## 9. レビュー

- [x] 9.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。対象は 2〜8 の差分すべて。指摘が出たら直して再実行し、**完全にパスするまで続ける**

## 10. 締め

- [x] 10.1 change の成果物を commit する（この worktree のブランチ `pre6` へ直接。`CLAUDE.md`「Worktree 運用」）
- [x] 10.2 ユーザーから完了承認を得て、`openspec/tickets/update-project-generation-via-upstream-rest.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
