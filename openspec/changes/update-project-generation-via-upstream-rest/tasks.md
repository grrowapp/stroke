## 1. 着手の記録

- [ ] 1.1 `openspec/tickets/update-project-generation-via-upstream-rest.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [ ] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（この worktree のブランチは `pre6`）。既に同じものがあれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. 落ちるテストを先に置く

- [ ] 2.1 `test/server/api/projects/index.post.test.ts` を書く（design D5）。`server/utils/control/upstream-proxy` の `upstreamClient` と `readStrokeConfig` を差し替える。ケースは (1) 親の直下のパス → 204・`registerProject` がそのパスで1回呼ばれる、(2) 本文無し・文字列でない・相対パス・親の外・親そのもの・2階層下 → 400・`registerProject` は呼ばれない、(3) `unreachable` / `error-response` → 503、`malformed` → 502、(4) どのケースでも `session-store` の `readState` / `writeState` と `broadcastProjectCreation` が呼ばれない
- [ ] 2.2 `test/server/utils/stroke/invoke.test.ts` に、steering の `buildRun` が `prepare` を渡し、それを呼ぶと `$fetch` が `/api/projects` へ `{ projectPath: cwd }` を POST すること、ストロークの `prepare` は従来どおりであることを足す
- [ ] 2.3 `test/server/utils/upstream/rest.test.ts` に `registerProject` のケースを足す（成功で `{ projectId }` が返る・500 → `error-response`・接続拒否 → `unreachable`・`projectId` を持たない 200 → `malformed`）
- [ ] 2.4 `test/server/utils/upstream/read-only.test.ts` を「決めた4つ」に改める（design D3）: `FORBIDDEN_UPSTREAM_WRITES` から `/api/projects/add` を外す、`method: 'POST'` の数を 2 に、公開メソッドの一覧に `registerProject` を足す、docblock を4つへ
- [ ] 2.5 `yarn test test/server/api/projects test/server/utils/stroke/invoke.test.ts test/server/utils/upstream` で、**直す前に落ちる**ことを確かめる

## 3. 接点層に登録の依頼を足す（design D3）

- [ ] 3.1 `server/utils/upstream/schema.ts` に `projectRegistrationSchema`（`{ projectId: z.string(), success: z.literal(true) }`）と型を足す
- [ ] 3.2 `server/utils/upstream/rest.ts` に `registerProject(projectPath)` を足す。`POST /api/projects/add` に `{ projectPath }` を送り、応答を 3.1 のスキーマで検証し（合わなければ `malformed`）、発行の失敗は `toFailure` で写す。docblock の「書き込みは決めた3つ」を4つに改め、登録の関数を置かないと書いていた記述を外す。`retry: 0`
- [ ] 3.3 2.3・2.4 が通る

## 4. 生成の endpoint（design D1）

- [ ] 4.1 `server/api/projects/index.post.ts` を書く。本文を `z.object({ projectPath: z.string().min(1) })` で読み（`readValidatedBody` か既存の `request-schemas.ts` の作法に合わせる）、`path.resolve(projectPath)` が `join(readStrokeConfig().projectShareRoot, basename)` と一致しなければ 400 → `upstreamClient().registerProject(projectPath)` → 失敗は `toHttpError(failure)` を throw → 204。docblock に「P 系（プロジェクトのリソースの作成。ユーザーは叩かない）」「id を取らない理由」「AI を起動しない・改名しない・phase も `invocation` も書かない・配信しない・`state.json` を読まない」「親の直下に限る理由」を書く
- [ ] 4.2 2.1 が通る

## 5. 起動の準備に生成を載せる（design D2）

- [ ] 5.1 `server/utils/stroke/invoke.ts` に `generateProject(cwd)`（相対パスの `$fetch` で `/api/projects` へ `{ projectPath: cwd }` を POST）を足し、steering の `buildRun` の `prepare: undefined` を `prepare: () => generateProject(cwd)` にする。そこにあるコメント「作業場所は昇格済みのプロジェクト。`.spec-workflow/` の内部構造は本家 MCP が作る」を「生成（P2）を依頼して本家に作らせる。起動定義・`--mcp-config` は変えない」に直す。`ai.ts` は触らない
- [ ] 5.2 2.2 が通る

## 6. E2E（design D4）

- [ ] 6.1 `test/e2e/fixtures/upstream-stub.mjs` に `POST /api/projects/add` を足す。`projectPath` 無しは 400。同じパスは同じ `projectId`、新規は採番して登録。`stats.registrations` に積み、`__control/stats` で返す
- [ ] 6.2 `test/e2e/stroke-exit.spec.ts` に「承認して起動が要求されると、スタブが `<projectShareRoot>/<name>` で登録の依頼を受ける」を足す
- [ ] 6.3 `yarn build && yarn test:e2e test/e2e/stroke-exit.spec.ts test/e2e/degraded.spec.ts` が通る。使ったポートは Playwright のログで確かめ、終了後に `ss -tlnp` で残っていないことを見る

## 7. 検証

- [ ] 7.1 `yarn test`
- [ ] 7.2 `yarn typecheck`・`yarn lint`
- [ ] 7.3 手動（design D5）: 空きポートで `yarn dev --port <n>` を起こし、既に本家に登録済みの完成済みプロジェクトのパスで `curl -i -X POST http://127.0.0.1:<n>/api/projects -H 'content-type: application/json' -d '{"projectPath":"/opt/projects/<name>"}'` を打って 204 が返り、本家 `GET /api/projects/list` の件数が増えないことを見る。**起こしたサーバーを止め、ポートの解放を確かめる**（`pgrep -f "nuxt dev"`・`ss -tlnp | grep <n>`）
- [ ] 7.4 7.3 の結果を ticket の本文に1段落で書き足す

## 8. 上位資料への整合反映（design D6。承認を得てから書く）

- [ ] 8.1 design D6 の表の差分をユーザーへ示し、承認を得る。**承認前に docs を書き換えない**
- [ ] 8.2 承認された差分だけを書く（`docs/specs/api/projects/generate.md` 新規、`overview.md`・`contract.md`・`portal-stroke-exit.md`・`settings-reference.md`・`session-workflow.md`）。却下された項目は design D6 に「却下」と理由を残す

## 9. レビュー

- [ ] 9.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。対象は 2〜8 の差分すべて。指摘が出たら直して再実行し、**完全にパスするまで続ける**

## 10. 締め

- [ ] 10.1 change の成果物を commit する（この worktree のブランチ `pre6` へ直接。`CLAUDE.md`「Worktree 運用」）
- [ ] 10.2 ユーザーから完了承認を得て、`openspec/tickets/update-project-generation-via-upstream-rest.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
