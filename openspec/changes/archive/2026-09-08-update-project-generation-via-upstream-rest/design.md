## Context

動機は proposal.md「Why」、要件は `specs/` 配下の delta（`api/project/generate`・`project/generation`・`agent/invocation`・`project/directory`・`api/project/delete`・`api/contract`）。ここでは実装の形だけを決める。

- endpoint は3系統ある（`docs/specs/api/overview.md`）。`U` はユーザー（画面）が叩くもの、`A` はエージェント側のもの（A8 は invokeAi が叩く）、`P` は昇格したプロジェクトのリソース（P1 `DELETE /api/projects/:projectId`。`docs/specs/api/projects/delete.md`）。**生成はプロジェクトというリソースの作成**なので `P` に置く（ユーザー指示 2026-09-08）
- 昇格したプロジェクトが本家に存在するようになるのは、いま U13 が起こす steering 用 claude の `--mcp-config` に並べた本家 MCP（`mcpConfigFor` の `specworkflow` エントリ。`npx -y @pimzino/spec-workflow-mcp@latest <cwd>`、env `SPEC_WORKFLOW_HOME`）が起動時に自己登録した瞬間。目的は自己登録だけで、ツールは `--allowedTools` に無く1つも呼ばれない（`settings-reference.md`「`--allowedTools`」・`get-steering-guide.ts`「本家 MCP は使わない」）
- 起動処理（`server/utils/stroke/ai.ts`）: `invokeAi(sessionId, retries, build: () => AiRun)` が `build()` を同期で呼び、throw したら `recordBuildFailure` が「起動の材料を組み立てられない」として `failed`（上限に達していれば `error`）を書き、`built` を reject する。U13 は `built` の reject を 503 にする（「起こせなかったときは受理しない」）。組み立てが通れば `runBuiltInvocation` が `prepare`（初回のみ）→ `runClaude` と進む
- 起動時の後始末（`server/utils/stroke/reap.ts` → `reap-match.ts`）は、走っている claude を argv で照合する。steering は `JSON.stringify(cwd)` が argv に含まれるかで見ており、その cwd は本家 MCP エントリの `npx` 引数に載っている。`--session-id` は uuid しか受けないので steering の初回起動には会話 id が無い
- 本家 2.2.5 の `POST /api/projects/add`（body `{ projectPath }`）は `addProjectByPath` を呼ぶ——`resolveGitWorkspaceRoot` でパスを解決し、登録済みなら同じ `projectId` を返し、未登録なら `process.pid`（dashboard 自身）で登録して `addProject` が watcher を起こす。`ApprovalStorage.start()` が `.spec-workflow/approvals/` を `mkdir` する。応答は `{ projectId, success: true }`。エラーは 400（`projectPath` 無し）と 500（`{ error }`）。2026-09-08 に `~/.npm/_npx/…/@pimzino/spec-workflow-mcp/dist/dashboard/{multi-server,project-manager}.js` で読了。dashboard を再起動すると、その PID で登録された entry は `cleanupStaleProjects()` で消える
- 接点層の REST クライアント `server/utils/upstream/rest.ts` は書き込みを3つに限り、`test/server/utils/upstream/read-only.test.ts` が `/api/projects/add` を禁止リストに置いて固定している。失敗の写像は `server/utils/control/upstream-proxy.ts` の `toHttpError`（未設定・不達・エラー応答 → 503、無い → 404、形違い → 502）
- `server/api/` の置き方は `docs/specs/api/server.md`（Endpoint はディレクトリ、Method は `index.<method>.ts`）。P1 は `server/api/projects/[projectId]/index.delete.ts`
- サーバー内から自分の endpoint を叩くときは相対パスの `$fetch`（`invoke.ts` の `invocationWriter` / `completionRecorder`）
- E2E の本家スタブ `test/e2e/fixtures/upstream-stub.mjs` は `api/projects/list` と `api/projects/:id/...` を `handleApi(segments, respond, method, body)` で捌く。`POST /api/projects/add` は無い。E2E は `NUXT_CLAUDE_COMMAND: '/bin/true'` で claude を空にしている（`playwright.config.ts`）

## Goals / Non-Goals

**Goals:**

- 生成（本家への登録の依頼）をプロジェクトのリソースの作成 `POST /api/projects` に閉じる。id を取らず、本家が要る `projectPath` だけを本文で受ける
- steering の起動の材料を組み立てるたびに生成を依頼し、受理されなければ起動しない。起動定義・定型は変えない
- **AI の起動に乗せた生成を外す**——steering の `--mcp-config` から本家 MCP を外し、claude がプロジェクトを本家に登録する手段を持たない状態にする。外したことを、単体・E2E・実機で「AI の起動ではプロジェクトが生成されない」として確かめる
- 接点層の書き込みを「決めた4つ」に改め、機械的な固定を引き継ぐ

**Non-Goals:**

- steering 用 claude の起動定義（`claude.args`）・`steeringPrompt`・自前 MCP の公開ツールの変更
- 画面（`useProposalReview.ts`）・U13 / U14 / U15 / P1・巡回・生成中の行・決着の器の変更
- 起動時の後始末の照合規則（argv に cwd が含まれる）の変更。手がかりの載せ方だけを変える
- 設定の追加。使うのは既存の `upstreamBaseUrl` と `projectShareRoot` だけ。`specWorkflowHome` はポータルの登録簿の読みに残る（steering の起動からは消える）

## Decisions

### D1. endpoint は P2 `POST /api/projects`。id を取らず、本文は `{ projectPath }`

- 置き場は `server/api/projects/index.post.ts`（`server.md` の規則）。P1 と同じく**メソッドで振り分け、パスに動詞を置かない**
- **id を取らない。** 作成に id は無く、本家が要るのはパスであり、呼び手（起動の材料の組み立て）は cwd としてパスを既に持っている
- 本文は `z.object({ projectPath: z.string().min(1) })` で検証し、さらに `path.resolve(projectPath)` が `join(readStrokeConfig().projectShareRoot, basename)` と一致すること（親の直下1階層）を要求する。外れたら 400。**親の外を本家に登録させない**ための入力検証であり、状態の判定ではない（ADR-0014）。`state.json` は読まない
- 依頼先は `upstreamClient().registerProject(projectPath)`。失敗は `toHttpError(failure)` で写す（未設定・不達・本家のエラー応答 → 503、形違い → 502）。`not-found`（本家が古く `/api/projects/add` が無い）は P2 で 503 に倒す——作成の要求に「対象が見つからない」を返すと読み違えるうえ、spec は本家のエラー応答を一律 503 と定めている（santa-method レビュー 2周目の指摘で 404 → 503 に改めた。2026-09-08）
- 成功は 204。`broadcastProjectCreation` を呼ばず、phase も `invocation` も書かない

**Alternatives considered**

- `POST /api/sessions/:id/generate`（U 系）で画面が叩く／U14 の中で依頼する／`POST /api/strokes/generate`（A 系）／`:id` を取ってパスを導出する — いずれも不採用（ユーザー指示 2026-09-08）

### D2. 依頼するのは steering の起動の材料の組み立て。起動のたびに、AI を起動する前に

- `buildRun`（同期の組み立て）は変えず、`kick` が `invokeAi` へ渡す組み立て方（`build`）を async にする。steering では `await generateProject(cwd)` が通ってから `buildRun` を呼んで `AiRun` を返す。`generateProject` は `$fetch('/api/projects', { method: 'POST', body: { projectPath: cwd } })`（相対パス。`invocationWriter` と同じ作法）。失敗は throw のまま——`invokeAi` の `recordBuildFailure` が「起動の材料を組み立てられない」として `failed` / `error` を書き、`built` が reject して U13 は 503 を返す（既存経路。新しい判定を足さない）。**実装時の訂正**: 当初は `buildRun` 自体を async にする案だったが、`buildRun` の既存テストが同期の戻り値を前提にしており、依頼は `kick` の閉包に置くほうが差分が小さい（2026-09-08）
- `ai.ts` は `build: () => AiRun | Promise<AiRun>` を受けて `await build()` にするだけ。組み立ての成否で分岐する既存の形は変わらない
- **起動のたびに依頼する。** 本家の登録は dashboard の再起動で消える（Context）。本家 MCP の自己登録を外す（D3）と、続きの起動で登録が戻る道が無くなるので、初回だけ（`prepare`）ではなく毎回にする。本家は登録済みのパスに同じ `projectId` を返すので重ねて無害
- 生成の受理を待ってから claude を起こすので、steering claude が起きたときには本家の一覧に載っている（`get-steering` / `submit-document` の projectId 引き当てが本家の一覧に依存する。`upstream-connection`）
- ストロークの分岐は変えない（`prepare: initSessionOpenspec` のまま）

**Alternatives considered**

- `prepare`（初回のみ）で依頼する — D3 で本家 MCP を外すと、dashboard 再起動後の続きの起動で登録が戻らず、`get-steering` が `project_not_registered` で落ち続ける。不採用
- 巡回や新しいプラグインが依頼する — 巡回に判定を足す・新しい巡回を設けることになる（`portal/batch`・`api/session/promote`）。不採用
- U13 の endpoint が依頼する — U 系に生成を持たせることになる。不採用（ユーザー指示）

### D3. AI の起動に乗せた生成を外す——steering の `--mcp-config` から本家 MCP を外す

- `mcpConfigFor(cwd, token, apiBaseUrl)` から `specworkflow` エントリ（`npx -y @pimzino/spec-workflow-mcp@latest <cwd>`・`env: { SPEC_WORKFLOW_HOME }`）を外す。残るのは自前 MCP（`stroke-board`）のエントリだけ。`invoke.ts` から `readServerConfig`（`specWorkflowHome`）の参照が消える。`allowed-tools.ts` の `UPSTREAM_MCP_SERVER_NAME` とその docblock を外す
- `--strict-mcp-config` は残す（開発者個人の MCP を読ませない守り。`settings-reference.md`）。`claude.args`・`--allowedTools` は変えない
- `get-steering-guide.ts` の「本家 MCP は使わない」の節を、「本家 spec-workflow の MCP はこの工程に配線されていない。一覧に本家のツールは並ばない」に改める。`get-steering-guide.test.ts` の節の検査（`/approvals/ /呼ばない/ /許可/ /通らない/`）を新しい文言に合わせる
- **これが「プロジェクト生成していた」経路の削除である。** 外した後、claude が本家にプロジェクトを登録する手段は無い（`--allowedTools` に本家のツールは無く、配線も無く、`Write`/`Edit` も無い）。確かめ方は D6

**Alternatives considered**

- 本家 MCP の配線を残し、P2 を足すだけ — 登録の道が2本残り、「AI の起動ではプロジェクトが生成されない」を確かめられない。不採用（ユーザー指示「remove delta」「project が生成されないことを確認」）

### D4. 起動時の後始末の手がかり——cwd は自前 MCP エントリのヘッダで argv に載せる

- `reap-match.ts` は steering の claude を `argv.includes(JSON.stringify(cwd))` で見分ける。cwd は本家 MCP エントリの `npx` 引数に載っていた。D3 で外すと手がかりが消える
- `mcpToolServerEntry` のヘッダに `x-stroke-cwd: <cwd>` を足す（steering・flontier とも。flontier はセッションディレクトリ）。`--mcp-config` は JSON 文字列で argv に載るので、`JSON.stringify(cwd)` はこれまでどおり含まれる。**サーバー側はこのヘッダを読まない**（接続の担保は `x-stroke-token` のまま）。照合の規則（`reap-match.ts`）は変えず、docblock の「本家 MCP エントリに載る」を「自前 MCP エントリのヘッダに載る」に改める
- `reap-match.test.ts` の argv の見本を新しい配線の形（`{"mcpServers":{"stroke-board":{"headers":{"x-stroke-cwd":"/opt/projects/my-project"}}}}`）に改める。「組み立て（`invoke.ts`）と同じ事実を見ている」ことを固定する検査は残す

**Alternatives considered**

- `/proc/<pid>/cwd` を読む — `ps` の argv では取れず、後始末の材料が argv の外へ広がる。Linux 依存も増える。不採用
- `--resume <runId>` で照合する — 初回の起動に会話 id が無く、一覧の応答からも取れない（`reap-match.ts` docblock）。不採用

### D5. 接点層に `registerProject(projectPath)` を足し、「決めた4つ」にする

- `UpstreamRestClient.registerProject(projectPath: string): Promise<UpstreamResult<{ projectId: string }>>`。`POST /api/projects/add` に `{ projectPath }` を送り、応答を `projectRegistrationSchema`（`schema.ts` に追加。`{ projectId: z.string(), success: z.literal(true) }`）で検証する。`respondToApproval` と同じ形で `ofetch` を直に呼び（`retry: 0`）、失敗は `toFailure` で写す。本文の検証に失敗したら `malformed`
- `rest.ts` の docblock「書き込みは決めた3つ」を4つに改め、登録の関数を置かないと書いていた記述を外す（解除 `DELETE /api/projects/:projectId` は引き続き置かない）
- `read-only.test.ts`: `FORBIDDEN_UPSTREAM_WRITES` から `/api/projects/add` を外す、`method: 'POST'` の数を 2 に、公開メソッドの一覧に `registerProject` を足す。docblock も「4つ」へ
- `rest.test.ts` に `registerProject` のケース（成功・500 → `error-response`・接続拒否 → `unreachable`・`projectId` を持たない 200 → `malformed`）を足す

### D6. 検証——「AI の起動ではプロジェクトが生成されない」を3段で確かめる

削除（D3）を対象にした検証。P2 の検証と分けて持つ。

| 段 | 何を見るか | どう見るか |
|---|---|---|
| 単体 | steering の起動の材料に本家 MCP が無い | `invoke.test.ts`: `mcpConfigOf('steering').mcpServers` のキーが `['stroke-board']` だけ、`SPEC_WORKFLOW_HOME` を含む env がどこにも無い、`launch.args` に `spec-workflow-mcp` の文字列が無い。既存の3件（「SPEC_WORKFLOW_HOME を渡す」「配線は続ける」ほか）は反転する |
| E2E | 登録は P2 からしか起きない | スタブの `stats.registrations` を見る。(a) 承認して起動が要求されると登録が**1件**、`projectPath` は `<projectShareRoot>/<name>`。(b) 本家スタブを止めて承認すると、起動要求は 503 で `invocation` は `failed`、登録は 0 件、`.spec-workflow/` は無い。スタブを戻して巡回（`__control` で U13 を叩く）すると登録が1件になる |
| 実機 | claude の起動で本家の登録簿が変わらない | 本家 dashboard を動かし、`yarn check:stroke --approve` で承認まで通す（既存の検証道具）。steering の実行中に `pgrep -af "spec-workflow-mcp@latest"` を取り、**そのプロジェクトのパスを引数に持つプロセスが1つも無い**こと（配線があれば claude が `npx` で起こしていた）。終了後、`<specWorkflowHome>/activeProjects.json` のそのプロジェクトの `instances` が **dashboard の PID 1件だけ**で、他の PID が無いこと。P2 の依頼はサーバーログ（`[stroke-board]`）で1起動につき1回出ていること |

### D7. P2 のテスト

- **単体** `test/server/api/projects/index.post.test.ts`: `upstreamClient` を差し替え、(1) 親の直下のパス → 204・`registerProject` がそのパスで1回呼ばれる、(2) 本文無し・相対パス・親の外・親そのもの・2階層下 → 400・`registerProject` は呼ばれない、(3) `unreachable` / `error-response` → 503、`malformed` → 502、(4) どのケースでも `writeState`・`broadcastProjectCreation`・`readState` が呼ばれない
- **単体** `test/server/utils/stroke/invoke.test.ts`: steering の `kick` が渡す組み立て方が `/api/projects` へ `{ projectPath: cwd }` を POST してから材料を返し、POST が失敗すれば reject して材料を返さないこと。ストロークの組み立て方は POST しない
- **単体** `test/server/utils/stroke/ai.test.ts`: `build` が Promise を返しても既存の組み立て失敗の記録（`failed` / `error`、`built` の reject）が同じに働くこと
- **単体** `rest.test.ts`・`read-only.test.ts`（D5）、`reap-match.test.ts`（D4）、`get-steering-guide.test.ts`（D3）
- **E2E** `upstream-stub.mjs` に `POST /api/projects/add` を足す（`projectPath` 無しは 400。同じパスは同じ `projectId`、新規は採番して登録。`stats.registrations` に積み `__control/stats` で返す）。`stroke-exit.spec.ts` に D6 の (a)(b) を足す
- **手動**: 空きポートで `yarn dev --port <n>` を起こし、既に本家に登録済みの完成済みプロジェクトのパスで `curl -i -X POST http://127.0.0.1:<n>/api/projects -H 'content-type: application/json' -d '{"projectPath":"/opt/projects/<name>"}'` を打って 204 と本家 `GET /api/projects/list` の件数が増えないことを見る。**起こしたサーバーは必ず止め、ポートの解放を確かめる**

### D8. 上位資料への整合反映（承認を得てから書く）

issue-tracker「更新対応」により、差分をユーザーへ示し承認を得てから書く。**承認前に docs を書き換えない。**

| 資料 | 差分 |
|---|---|
| `docs/specs/api/projects/generate.md`（新規） | P2 の入出力・振る舞い・エラー表。`projects/delete.md` と同じ構成 |
| `docs/specs/api/overview.md` | `projects/` を 2 本にし、P2 の行を足す |
| `docs/specs/api/contract.md` | 「各 endpoint の入出力」に P2 を足す。「全体設計」の「AI の起動は U13 が唯一の入口」の段落に、生成は起動の材料の組み立てでサーバーが P2 で依頼することを1文足す。「502 は無い」に、本家の応答の形違いを 502 で返す P2 の例外を書く |
| `docs/specs/plan/portal-stroke-exit.md` | 「起動時に `--mcp-config` で本家 spec-workflow の MCP を与え」「`.spec-workflow/` の内部構造は、この claude が呼ぶ本家 MCP が作る」「`.spec-workflow/` は本家 MCP が接続した瞬間にできる」を、生成（P2）の依頼を本家が受理したときに本家が作る、に改める。「設定に足すもの」の mcp-config の記述から本家 MCP を外す |
| `docs/specs/core/settings-reference.md` | 「`--allowedTools`」の「第三者の MCP のツールを許可に載せない…steering 工程は本家 MCP を `--mcp-config` に並べるが」の段落を外す。「ポータル側」の「`specWorkflowHome` はポータル専用ではない…`--mcp-config` に載る」の段落を外し、`upstreamBaseUrl` が効く先に生成（P2）を足す |
| `docs/specs/architecture/session-workflow.md` | 「配線」の表に生成の行を足し、「steering 工程はポータル側の設定を2つ使う」を `upstreamBaseUrl` の1つに改める |
| `docs/specs/mcp/tools.md` | 本家 MCP の配線に触れる記述があれば外す（着手時に grep で確かめる） |

`CONTEXT.md` の「生成中」の「`.spec-workflow/` が出来ただけでは終わらない——それは本家が接続した瞬間にできる」は、契機が変わるので「それは生成の依頼を本家が受理したときにできる」に改める（用語集の説明文。承認を得てから）。ADR-0006「プロジェクトを新規に作る機能は本家に無い」は事実として正しいまま（登録であって新規作成ではない）なので触らない。ADR-0011（archive 済み）は触らない。

**確定（2026-09-08、ユーザー承認）。** 上の表のうち採ったのは「変更後に事実と食い違う記述の訂正」と「endpoint の目録」だけである。

- 書いた: `overview.md`（P2 の行）、`projects/generate.md`（新規・短い1枚）、`settings-reference.md`（本家 MCP を並べると書いた3箇所）、`session-workflow.md`（「設定を2つ使う」→ `upstreamBaseUrl` の1つ）、`portal-stroke-exit.md` 23行目と `CONTEXT.md`「生成中」の「本家 MCP が接続した瞬間にできる」の句
- 却下: `contract.md` への追記、`portal-stroke-exit.md` の mermaid と「設定に足すもの」の書き換え、`session-workflow.md` の配線の表への行追加、`settings-reference.md` の図の注記——ユーザー指示「修正を過大に誇張するな。最小限の修正案に出し直せ」。いずれも記述を足す・言い換えるだけで、事実と食い違う記述の訂正ではない

## Risks / Trade-offs

- [起動のたびに本家への1往復が入る] → 本家が動いていれば数十 ms。落ちていれば接続拒否で即失敗し、起動せず `failed` → 巡回（60 秒ごと）が拾い、上限で `error`。本家が止まっている間の承認の決着の形は、これまで claude が空振りして同じ結末になっていたので変わらない
- [本家 MCP を外すと、dashboard 再起動後の登録が戻る道が P2 だけになる] → D2 で起動のたびに依頼する。生成中でも完成済みでも、次の起動で登録が戻る
- [本家がパスを git のトップレベルへ解決する（`upstream-observations.md`）] → `projectShareRoot` は git 管理下に無いので値は変わらない。変わる環境では引き当てが外れるが、`fix-project-id-lookup` で決めたとおり失敗として現れる。P2 はそれを吸収しない
- [後始末の手がかりをヘッダに載せる] → サーバーは読まないヘッダなので、意味は argv に cwd を残すことだけ。`reap-match.ts` の docblock にその目的を書き、テストで組み立てと照合を突き合わせる
- [`ai.ts` の `build` が非同期になる] → 呼び出しは `kick` の1箇所。`built` / `settled` の2つの完結点の意味は変わらない。`ai.test.ts` で組み立て失敗の記録が同じに働くことを見る
- [E2E スタブに登録が増えると `projects-update` の配信内容が変わる] → スタブは登録時に WS を配信しない（接続時だけ）。次の一覧取得で載る
- [P2 は認証を持たないので、画面からも叩ける] → 既存の A 系・P1 と同じ。入力は親の直下1階層に限っており、本家に登録できるのは承認で昇格したディレクトリだけ

## Open Questions

なし。
