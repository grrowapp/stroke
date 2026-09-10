## 1. 着手

- [x] 1.1 `openspec/tickets/update-invoke-agent-responsibility-boundary.md` の `status` を `Doing` にする
- [x] 1.2 同ファイルの `tags` に `update-invoke-agent-responsibility-boundary/a04d91b2-fbab-4863-92d4-b9784e170ec7` を追記する（既に同じ物があれば追記しない。既存の項目は消さない）

## 2. docs（規範）

- [x] 2.1 `docs/specs/mcp/contract.md` を確定する（design D4・D5・D6 と食い違いが無いことを読み合わせる）
- [x] 2.2 `docs/specs/architecture/invoke-agent.md` を確定する（design D1〜D3・D6 と食い合わせる。判定の条件表が D3 と一致する）
- [x] 2.3 集約元5箇所（`api/contract.md`・`api/sessions/invoke-agent.md`・`api/sessions/activate.md`・`architecture/session-workflow.md`・`plan/portal-stroke-exit.md`）の参照の付け替えを確認し、`session-workflow.md`「配線」に本家 MCP（steering のみ）の行を足す
- [x] 2.4 `docs/specs/core/settings-reference.md`「`--allowedTools`」「ポータル側」の反転箇所を design「docs・ADR への反映」の表と一致させる

## 3. specs（delta）

- [x] 3.1 `openspec validate update-invoke-agent-responsibility-boundary --store stroke --strict` が通る
- [x] 3.2 `agent/invocation` の delta が `mcp/contract` と `mcp/server` から参照されている本家 MCP の配線の記述（承認の後の実行に本家 MCP を含め、`approvals` を許可する）を実際に持っている

## 4. 実装 — 判定を invoke-agent へ移す

- [x] 4.1 `server/utils/stroke/ai.ts`: `AiRun.didWork` を `() => Promise<boolean>` にし、`runBuiltInvocation` で `await` する
- [x] 4.2 `server/utils/stroke/invoke.ts`: `steeringCompletedUpstream(cwd, phase)` を置く（`resolveProjectId` → `getProjectInfo` の3値 → `approved` のときだけ `listPendingApprovals` の `filePath` 照合（かつ `category` が `steering`）。届かない・未設定・形違いは false）。steering 分岐の `didWork` をこれに替え、`submittedByLaunch` を削除する
- [x] 4.3 `server/utils/stroke/submission-signal.ts`: `launchSubmissions` と `recordLaunchSubmission` / `hasLaunchSubmission` / `forgetLaunchSubmission` を削除する。冒頭の docblock を flontier の `counts` だけの説明に書き直す
- [x] 4.4 `server/utils/mcp/connection-table.ts`: `isConnectionActive` を削除する
- [x] 4.5 `server/mcp/tools/submit-document.ts`: steering 分岐から記録の呼び出しを外し、本家 PUT の `status` を返すだけにする。docblock を「登録の代行のみ」に合わせる
- [x] 4.6 `server/utils/stroke/invoke.ts` の `kick`: `.finally` を `removeConnection` だけにする。token の発行・登録・失効が invoke-agent の責務であることを docblock に書く

## 5. 実装 — 承認依頼の配線

- [x] 5.1 `server/utils/stroke/invoke.ts` の `mcpConfigFor`: 本家 MCP のエントリ（`type: stdio`・`npx -y @pimzino/spec-workflow-mcp@latest <cwd>`・`env.SPEC_WORKFLOW_HOME = readServerConfig().specWorkflowHome`）を steering 工程にだけ並べる。flontier の `mcpToolConfigFor` は変えない
- [x] 5.2 `server/utils/mcp/allowed-tools.ts`: 本家 MCP のサーバー名と `mcp__specworkflow__approvals` の定数を置き、steering 工程の `withMcpToolsAllowed` にだけ足す。「第三者の MCP のツールは足さない」の docblock を新しい規定に書き直す
- [x] 5.3 `server/mcp/tools/get-steering-guide.ts`: 手順に承認依頼の提出（`approvals` の `request`。`filePath: .spec-workflow/steering/<name>.md`・`type: document`・`category: steering`・`categoryName: steering`・承認を待たない）と終わりの条件（3本の受理と3件の承認依頼）を書く。「本家 MCP は配線されていない」の節を「本家 MCP で使うのは `approvals`」に改める
- [x] 5.4 `server/utils/stroke/reap-match.ts` の照合が本家 MCP のエントリ追加後も steering を cwd で見分けられることを確認する（argv に cwd の JSON 文字列が残る）

## 6. テスト

- [x] 6.1 `test/server/utils/stroke/invoke.test.ts`: `didWork` の試験を本家の応答（`upstreamClient` の差し替え）で書き直す。`approved` で3本＋3件 → true、3本だが承認依頼が2件 → false、`activated` で3本のみ → true、解決の失敗・不達 → false。`kick` の後始末は `removeConnection` だけを見る
- [x] 6.2 `test/server/utils/stroke/ai.test.ts`: `didWork` が非同期になったことに合わせる（`async () => true/false`）
- [x] 6.3 `test/server/mcp/tools/submit-document.test.ts`: steering の受理で記録が起きないこと（記録の関数が存在しない）と、応答の `status` だけを返すことに直す
- [x] 6.4 `test/server/utils/mcp/connection-table.test.ts`: `isConnectionActive` の試験を消す
- [x] 6.5 `test/server/utils/mcp/allowed-tools.test.ts`・`test/server/mcp/tools/get-steering-guide.test.ts`: 本家 `approvals` の許可と手順の文言を固定する
- [x] 6.6 `test/e2e/fixtures/upstream-stub.mjs`: `info` の `steering.documents` を `savedSteeringDocuments` から導く
- [x] 6.7 `yarn typecheck`・`yarn test` が通る（`lint` script はこのリポジトリに無い）。E2E は `workspace.spec.ts`・`upstream-style.spec.ts`・`stroke-exit.spec.ts` の 90 件が通る

## 7. レビュー

- [x] 7.1 'typescript-reviewer' エージェントに '/santa-method' でレビューを実行させ、指摘が無くなるまで直して繰り返す（4周目で PASS。1〜3周目の should-fix はすべて反映。scenario 題名1件は validate の制約で据え置き、design に記録）

## 8. 完了

- [x] 8.1 change の成果物を commit する（ブランチ `update-invoke-agent-responsibility-boundary` へ docs・実装・テスト `046a4ac5`・`2de6491a`・`55209f26`、openspec の artifact と ticket `f9810d0e`。PR: http://192.168.1.202/gitea/grrowapp/stroke/pulls/24、base は `develop`）
- [x] 8.2 ユーザーから完了承認を得て、`openspec/tickets/update-invoke-agent-responsibility-boundary.md` の `status` を `Wait-for-archive` にする（2026-09-09）
