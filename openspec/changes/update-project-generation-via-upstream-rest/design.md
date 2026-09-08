## Context

動機は proposal.md「Why」、要件は `specs/api/project/generate`・`specs/project/generation`・`specs/agent/invocation`・`specs/api/contract` の delta。ここでは実装の形だけを決める。

- endpoint は3系統ある（`docs/specs/api/overview.md`）。`U` はユーザー（画面）が叩くもの、`A` はエージェント側のもの（A8 は invokeAi が叩く）、`P` は昇格したプロジェクトのリソース（P1 `DELETE /api/projects/:projectId`。`docs/specs/api/projects/delete.md`）。**生成はプロジェクトというリソースの作成**なので `P` に置く（ユーザー指示 2026-09-08「なぜ、project をつかわない」）
- 昇格したプロジェクトが本家に存在するようになるのは、いま U13 が起こす steering 用 claude の `--mcp-config` に並べた本家 MCP が自己登録した瞬間（`server/utils/stroke/invoke.ts` の `mcpConfigFor`）。**この配線は本 change で触らない**
- 起動処理（`server/utils/stroke/ai.ts` の `runBuiltInvocation`）は `AiRun.prepare` を持つ。初回（`hasConversation()` が false）のときだけ `prepare()` を呼び、throw したら `実行環境を作れない` として `failed` を書いて起動しない。ストロークは `initSessionOpenspec` を渡し、steering は `prepare: undefined`（`invoke.ts` `buildRun`）。steering の `hasConversation` は `runId !== undefined`——初回の起動が成功して会話 id を覚えるまでは毎回「初回」になる
- 本家 2.2.5 の `POST /api/projects/add`（body `{ projectPath }`）は `addProjectByPath` を呼ぶ——`resolveGitWorkspaceRoot` でパスを解決し、登録済みなら同じ `projectId` を返し、未登録なら `process.pid`（dashboard 自身）で登録して `addProject` が watcher を起こす。`ApprovalStorage.start()` が `.spec-workflow/approvals/` を `mkdir` する。応答は `{ projectId, success: true }`。エラーは 400（`projectPath` 無し）と 500（`{ error }`）。2026-09-08 に `~/.npm/_npx/…/@pimzino/spec-workflow-mcp/dist/dashboard/{multi-server,project-manager}.js` で読了
- 接点層の REST クライアント `server/utils/upstream/rest.ts` は書き込みを3つ（承認への応答・仕様書の保存・steering の保存）に限り、`test/server/utils/upstream/read-only.test.ts` が `/api/projects/add` を禁止リストに置いて機械的に固定している。失敗の写像は `server/utils/control/upstream-proxy.ts` の `toHttpError`（未設定・不達・エラー応答 → 503、無い → 404、形違い → 502）
- `server/api/` の置き方は `docs/specs/api/server.md`（Endpoint はディレクトリ、Method は `index.<method>.ts`）。P1 は `server/api/projects/[projectId]/index.delete.ts`
- サーバー内から自分の endpoint を叩くときは相対パスの `$fetch`（`invoke.ts` の `invocationWriter` / `completionRecorder`）。外向けの URL で組まない
- E2E の本家スタブ `test/e2e/fixtures/upstream-stub.mjs` は `api/projects/list` と `api/projects/:id/...` を `handleApi(segments, respond, method, body)` で捌く。`POST /api/projects/add` は無い。E2E は `NUXT_CLAUDE_COMMAND: '/bin/true'` で claude を空にしている（`playwright.config.ts`）ので、steering の起動は `prepare` → 空の claude → `didWork` false → `failed` の順に流れる

## Goals / Non-Goals

**Goals:**

- 生成（本家への登録の依頼）をプロジェクトのリソースの作成 `POST /api/projects` に閉じる。id を取らず、本家が要る `projectPath` だけを本文で受ける
- 承認の後の実行の `prepare` として生成を依頼する。渡す値が1つ増えるだけで、起動定義・定型・`--mcp-config` は変えない
- 接点層の書き込みを「決めた4つ」に改め、機械的な固定を引き継ぐ
- 単体・E2E で「AI の起動前に正しいパスで本家へ依頼された」「本家が落ちていれば起動せず `failed`」を見る

**Non-Goals:**

- steering 用 claude の起動定義・`steeringPrompt`・`mcpConfigFor` の本家 MCP・公開ツールの変更
- 画面（`useProposalReview.ts`）・U13 / U14 / U15 / P1・巡回・生成中の行・決着の器の変更
- 本家の登録が dashboard 再起動で消える性質の手当て（proposal「本家との関係」）
- 設定の追加。使うのは既存の `upstreamBaseUrl` と `projectShareRoot` だけ

## Decisions

### D1. endpoint は P2 `POST /api/projects`。id を取らず、本文は `{ projectPath }`

- 置き場は `server/api/projects/index.post.ts`（`server.md` の規則）。P1 と同じく**メソッドで振り分け、パスに動詞を置かない**
- **id を取らない。** 作成に id は無く、本家が要るのはパスであり、呼び手（起動の準備）は cwd としてパスを既に持っている。id を受けてパスを導出し直すのは、呼び手が持つ事実をもう一度別の規則で決めることになる（U13 が cwd を導出しないのと同じ理由）
- 本文は `z.object({ projectPath: z.string().min(1) })` で検証し、さらに `path.resolve(projectPath)` が `join(readStrokeConfig().projectShareRoot, basename)` と一致すること（親の直下1階層）を要求する。外れたら 400。**親の外を本家に登録させない**ための入力検証であり、状態の判定ではない（ADR-0014）。`state.json` は読まない
- 依頼先は `upstreamClient().registerProject(projectPath)`。失敗は `toHttpError(failure)` で写す（未設定・不達・本家のエラー応答 → 503、形違い → 502、`not-found`＝本家が古く `/api/projects/add` が無い → 404）。画面向けの写像を割らない
- 成功は 204。`broadcastProjectCreation` を呼ばず、phase も `invocation` も書かない

**Alternatives considered**

- `POST /api/sessions/:id/generate`（U 系）で画面が叩く — ユーザー操作ではない。不採用（ユーザー指示）
- U14（昇格）の中で依頼する — U 系に生成を持たせることになる。不採用（ユーザー指示）
- `POST /api/strokes/generate`（A 系） — 生成はプロジェクトのリソースの作成であり、`projects/` が既にある。不採用（ユーザー指示）
- `:id` を取ってパスを導出する — 作成に id は無い。不採用（ユーザー指示）

### D2. 依頼するのは steering の `prepare`。渡す値が1つ増えるだけ

- `invoke.ts` `buildRun` の steering 分岐で `prepare: () => generateProject(cwd)` を渡す。`generateProject` は `$fetch('/api/projects', { method: 'POST', body: { projectPath: cwd } })`（相対パス。`invocationWriter` と同じ作法）。失敗は throw のまま——`runBuiltInvocation` が `実行環境を作れない` として `failed` を書く（既存経路。新しい判定を足さない）
- `prepare` は初回（`hasConversation()` が false ＝ `runId` 未記録）にだけ呼ばれる。初回の claude が失敗して `runId` が残らなければ次も「初回」になり、生成も依頼し直される——本家は登録済みのパスに同じ `projectId` を返すので重ねて無害
- 続きの起動（`runId` あり）では依頼しない。本家の登録は steering claude の本家 MCP の自己登録でも保たれる（従来どおり残す）
- **起動処理（`ai.ts`）は変えない。** `prepare` の呼び出し方も失敗の扱いも既にある。用途の違いは渡す値の違いだけ（`agent/invocation`「起動は1系統」）
- 生成の受理を待ってから claude を起こすので、steering claude が起きたときには本家の一覧に載っている（`get-steering` / `submit-document` の projectId 引き当てが本家の一覧に依存する）

**Alternatives considered**

- 巡回（`01.retry-failed.ts`）が U13 の前に P2 を叩く — 巡回に判定を足すことになる（`portal/batch`「巡回は他の判定を持たない」）。不採用
- 新しいプラグインで `approved` を見張って P2 を叩く — 新しい巡回を設けることになる（`api/session/promote`「新しい巡回や新しい判定を設けてはならない」）。不採用
- 毎回の起動で依頼する — `prepare` の意味（初回に実行環境を整える）から外れる。継続の起動は会話の続きであって環境の作り直しではない。不採用

### D3. 接点層に `registerProject(projectPath)` を足し、「決めた4つ」にする

- `UpstreamRestClient.registerProject(projectPath: string): Promise<UpstreamResult<{ projectId: string }>>`。`POST /api/projects/add` に `{ projectPath }` を送り、応答を `projectRegistrationSchema`（`schema.ts` に追加。`{ projectId: z.string(), success: z.literal(true) }`）で検証する。既存の `read` は GET 固定なので、`respondToApproval` と同じ形で `ofetch` を直に呼び（`retry: 0`）、失敗は `toFailure` で写す。本文の検証に失敗したら `malformed`
- ファイルに触るのは本家（ADR-0005 は保たれる）。`rest.ts` の docblock「書き込みは決めた3つ」を4つに改め、**呼べる関数を置かない**と書いていたプロジェクトの登録の記述を外す（解除 `DELETE /api/projects/:projectId` は引き続き置かない）
- `read-only.test.ts`: `FORBIDDEN_UPSTREAM_WRITES` から `/api/projects/add` を外す、`method: 'POST'` の数を 2 に、公開メソッドの一覧に `registerProject` を足す。docblock も「4つ」へ
- `rest.test.ts` に `registerProject` のケース（成功・500 → `error-response`・接続拒否 → `unreachable`・`projectId` を持たない 200 → `malformed`）を足す

### D4. E2E スタブに `POST /api/projects/add` を足し、依頼されたことを見えるようにする

- `handleApi` の先頭で `method === 'POST' && segments.join('/') === 'api/projects/add'` を捌く。`body.projectPath` が無ければ 400 `{ error: 'projectPath is required' }`。同じ `projectPath` が既にあればその `projectId` を返し、無ければ `projectId` を採番（16文字。本家の形に合わせる）して `projects` に登録する（specs・approvals は空、`projectName` はパスの末尾）。応答は `{ projectId, success: true }`
- 依頼を数える: `stats.registrations` に `{ projectPath }` を積み、`__control/stats`（既存の計数の口）で返す。テストは「承認後、スタブが `<projectShareRoot>/<name>` で依頼を受けた」ことをこれで見る
- 登録後の `projectList()` に新しいエントリが載るので、`instances` を持つ＝アクティブとして stroke-board が扱う。既存の E2E（`stroke-exit.spec.ts`「生成中の行は押せない」）は生成中の判定を phase で行っているため影響しない（`project/generation`「生成中の行を本家との接続の判定から外す」）

### D5. テスト

- **単体** `test/server/api/projects/index.post.test.ts`: `upstreamClient` を差し替え、(1) 親の直下のパス → 204・`registerProject` がそのパスで1回呼ばれる、(2) 本文無し・相対パス・親の外・親そのもの・2階層下 → 400・`registerProject` は呼ばれない、(3) `unreachable` / `error-response` → 503、`malformed` → 502、(4) どのケースでも `writeState`・`broadcastProjectCreation`・`readState` が呼ばれない
- **単体** `test/server/utils/stroke/invoke.test.ts`: steering の `buildRun` が `prepare` を渡し、それを呼ぶと `/api/projects` へ `{ projectPath: cwd }` の POST が出ること。ストロークの `prepare` は従来どおり `initSessionOpenspec`
- **単体** `rest.test.ts`・`read-only.test.ts`（D3）
- **E2E** `stroke-exit.spec.ts` に「承認して起動が要求されると、スタブが `<projectShareRoot>/<name>` で登録の依頼を受ける」を1件足す（D4。claude は `/bin/true` なので `prepare` は走る）。本家スタブを止めた状態の承認は `degraded.spec.ts` の作法で、昇格が成立して生成中の行が出ることを見る
- **手動**: 空きポートで `yarn dev --port <n>` を起こし、既に本家に登録済みの完成済みプロジェクトのパスで `curl -i -X POST http://127.0.0.1:<n>/api/projects -H 'content-type: application/json' -d '{"projectPath":"/opt/projects/<name>"}'` を打って 204 と本家 `GET /api/projects/list` の件数が増えないことを見る（新規登録の副作用を本家に残さない）。**起こしたサーバーは必ず止め、ポートの解放を確かめる**

### D6. 上位資料への整合反映（承認を得てから書く）

issue-tracker「更新対応」により、差分をユーザーへ示し承認を得てから書く。**承認前に docs を書き換えない。**

| 資料 | 差分 |
|---|---|
| `docs/specs/api/projects/generate.md`（新規） | P2 の入出力・振る舞い・エラー表。`projects/delete.md` と同じ構成 |
| `docs/specs/api/overview.md` | `projects/` を 2 本にし、P2 の行を足す |
| `docs/specs/api/contract.md` | 「各 endpoint の入出力」に P2 を足す。「全体設計」の「AI の起動は U13 が唯一の入口」の段落に、生成は起動の準備としてサーバーが P2 で依頼することを1文足す。「502 は無い」に、本家の応答の形違いを 502 で返す P2 の例外を書く（`toHttpError` の既存の写像） |
| `docs/specs/plan/portal-stroke-exit.md` | 「承認ボタン → 一覧へ戻る」の `.spec-workflow/` が「本家 MCP が接続した瞬間にできる」の記述を「起動の準備で生成を依頼したとき（本家が受理して作る）、または本家 MCP が接続したとき」に改める |
| `docs/specs/core/settings-reference.md` | 「ポータル側」の `upstreamBaseUrl` が効く先に生成（P2）を足す |
| `docs/specs/architecture/session-workflow.md` | 「配線」の表に生成の行（`api/project/generate`。steering の `prepare` が cwd を渡す）を足す |

`CONTEXT.md` の「生成中」は変えない——終わりは完成の記録のままである。ADR-0006「プロジェクトを新規に作る機能は本家に無い」は事実として正しいまま（登録であって新規作成ではない）なので触らない。

## Risks / Trade-offs

- [初回の起動が本家への1往復ぶん遅れる] → 本家が動いていれば数十 ms。落ちていれば接続拒否で即失敗し、起動せず `failed` → 巡回（60 秒ごと）が拾う。上限（`maxRetries`）に達すれば `error` でユーザーに引き渡される——本家が止まっている間に承認すると、これまでは claude が空振りして同じ結末になっていたので、決着の形は変わらない
- [登録の道が2本になる（P2 と、steering claude の本家 MCP の自己登録）] → 本家は登録済みのパスに同じ `projectId` を返し、MCP の自己登録は `instances` に PID を1つ足すだけ。二重登録にはならない（本家 2.2.5 `registerProject`）。MCP 側を外すのは範囲外
- [本家がパスを git のトップレベルへ解決する（`upstream-observations.md`）] → `projectShareRoot` は git 管理下に無いので値は変わらない。変わる環境では引き当てが外れるが、それは `fix-project-id-lookup` で決めたとおり失敗として現れる。P2 はそれを吸収しない
- [dashboard 再起動で登録が消える] → 本家の性質。`.spec-workflow/` は残るので一覧の母集合からは消えない。続きの起動では依頼しないが、steering claude の本家 MCP が自己登録するので工程は成立する
- [E2E スタブに登録が増えると `projects-update` の配信内容が変わる] → スタブは登録時に WS を配信しない（接続時だけ）。次の一覧取得で載る。既存テストはスタブの seed 2件を前提にしており、登録は承認を通すテストでしか起きない
- [P2 は認証を持たないので、画面からも叩ける] → 既存の A 系・P1 と同じ。入力は親の直下1階層に限っており、本家に登録できるのは承認で昇格したディレクトリだけ

## Open Questions

なし。
