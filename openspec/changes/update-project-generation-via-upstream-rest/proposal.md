# update-project-generation-via-upstream-rest

## Why

承認で昇格したプロジェクトが本家 spec-workflow に**存在するようになる**（登録簿に載り、`.spec-workflow/` ができる）のは、いま **steering 用の claude が起動し、その `--mcp-config` に並べた本家 MCP が自己登録した瞬間**である。プロジェクトの生成が claude というプロセスの挙動に乗っており、サーバーは「生成した」というアクションを自分で持っていない。

この乗り合いは、生成の成否を claude プロセスの成否に縛る。claude が起きなければ（`Unknown command` で assistant のターンが無いまま終わる等）プロジェクトは本家に現れず、起きても登録簿の場所がずれていれば現れない（実測 2026-08-31、`SPEC_WORKFLOW_HOME` の食い違い）。生成が済んだかどうかを、claude のプロセスの中で何が起きたかを追わないと言えない。

本家には `POST /api/projects/add`（body `{ projectPath }`）が実在する。登録簿へ登録し、watcher を起こし、`.spec-workflow/approvals/` を作る（本家 2.2.5 `dist/dashboard/project-manager.js` の `addProjectByPath`、2026-09-08 読了。既に登録済みなら同じ `projectId` を返す）。**プロジェクトの生成は本家のこの REST をキックすれば済み、claude のプロセスに任せる必要が無い。**

ユーザー指示（2026-09-08）: 「プロジェクト作成を claude プロセスの起動経由による生成ではなく、本家 REST のキックを使っての生成に変更しろ」「プロジェクトの生成を、claude の起動というアクションと明確に分離し、プロジェクト生成の API が一つ増えるだけだ」「エンドポイントは、ユーザー操作でないなら stroke だ。UXX じゃない。id の指定も意味が不明」「UXX は、ユーザーが叩く API だ。UXX に持たせるな」「なぜ、project をつかわない」「プロジェクト生成していた specs からの remove delta を起こせ。tasks で、remove delta を対象にした、実行検証で project が生成されないことを tasks 内で確認しろ」。

## What Changes

- **追加**: プロジェクトの生成を受け持つ endpoint を1本足す——**P2 `POST /api/projects`**。昇格したプロジェクトはリソースとして `projects/` を既に持つ（P1 `DELETE /api/projects/:projectId`）ので、その作成として同じリソースに置く。ユーザーが叩く endpoint ではなく、`:id` を取らない（作成に id は無い）。本文は本家が要るものそのまま `{ projectPath }`。本家の `POST /api/projects/add` へ依頼し、受理は 204。AI を起動せず、改名せず、phase も `invocation` も書かず、配信もしない
- **追加**: 接点層の REST クライアント（`server/utils/upstream/rest.ts`）に、本家のプロジェクト登録を依頼する関数を1つ足す。**書き込みは「決めた3つ」から「決めた4つ」になる**。ファイルに触るのは本家であり、stroke-board が `.spec-workflow/` を書かない関係（ADR-0005）は変わらない。「3つだけ」を機械的に固定している `test/server/utils/upstream/read-only.test.ts` を4つに改める
- **変更**: 承認の後の実行（steering）は、**起動の材料を組み立てるたびに、AI を起動する前に P2 で生成を依頼する**。受理されなければ「起動の材料を組み立てられない」として起動せず `failed`（既存経路）。**サーバー内の呼び出しであり、画面（UXX）も昇格の受け口（U14）も生成に触れない**
- **削除**: **AI の起動に乗せた生成を外す。** steering 用 claude の `--mcp-config` から本家 spec-workflow の MCP（`specworkflow`。`npx @pimzino/spec-workflow-mcp@latest <cwd>` と `SPEC_WORKFLOW_HOME`）を外す。この配線の目的は起動時の登録簿への自己登録だけで、ツール呼び出しは1つも要らなかった（`docs/specs/core/settings-reference.md`「`--allowedTools`」）。外した後、claude はプロジェクトを本家に登録する手段を持たない。specs では、`.spec-workflow/` が「本家 MCP が接続した瞬間にできる」ことを前提にしていた Requirement（`project/directory`・`project/generation`・`api/project/delete`）から、その前提を外す
- **変更**: 起動時の後始末（`reap-match.ts`）が steering の claude を見分ける手がかりは、本家 MCP エントリの `npx` 引数に載っていた cwd だった。配線を外しても argv に cwd が載るよう、自前 MCP のエントリのヘッダで cwd を渡す。照合の規則（argv に cwd の JSON 文字列が含まれる）は変えない
- **変更なし**: claude の起動定義（`claude.args`）・`steeringPrompt`・自前 MCP の配線と公開ツール・U13 / U14 / U15 / P1・巡回・生成中の行・決着の器は触らない

## Capabilities

### New Capabilities

- `api/project/generate`: プロジェクトの生成を受け持つ endpoint（P2 `POST /api/projects`）。渡されたパスのプロジェクトを本家へ登録するよう依頼し、受理だけを返す。AI の起動・改名・phase・`invocation`・配信に触れない。本家に届かない・本家が断ったときの応答の形

### Modified Capabilities

- `project/generation`: 昇格したプロジェクトを本家に存在させる手段が「claude が並べた本家 MCP の自己登録」から「生成の endpoint による本家 REST への依頼」**だけ**になる。AI のプロセスにプロジェクトを生成させない（本家 MCP を起動定義に含めない）。`.spec-workflow/` ができる契機を前提にしていた2つの Requirement の前提を改める
- `agent/invocation`: 承認の後の実行では、起動の材料を組み立てるたびに生成を依頼し、受理されなければ起動しない。起動定義に本家 MCP を含めない
- `project/directory`: `.spec-workflow` ができる契機を前提にしていた4つの Requirement の前提を改める（規定は変えない）
- `api/project/delete`: 同上、1つの Requirement
- `api/contract`: 受理で完結する操作（204 を返すもの）に生成（P2）が加わる

## Impact

- **影響コード**
  - `server/api/projects/index.post.ts`（新規。`docs/specs/api/server.md` の置き方）
  - `server/utils/upstream/rest.ts`・`schema.ts`（登録の関数と応答の形を追加）と `test/server/utils/upstream/read-only.test.ts`（固定している数と一覧を改める）
  - `server/utils/stroke/invoke.ts`（steering の `buildRun` が P2 を依頼してから材料を返す。`mcpConfigFor` から本家 MCP のエントリを外す。自前 MCP のエントリに cwd のヘッダを足す）
  - `server/utils/stroke/ai.ts`（`build` が Promise を返せるようにするだけ。判定は足さない）
  - `server/utils/mcp/allowed-tools.ts`（`UPSTREAM_MCP_SERVER_NAME` を外す）
  - `server/mcp/tools/get-steering-guide.ts`（案内の「本家 MCP は使わない」の節を「配線されていない」に改める）と `test/server/mcp/tools/get-steering-guide.test.ts`
  - `server/utils/stroke/reap-match.ts`（docblock。照合の規則は変えない）と `test/server/utils/stroke/reap-match.test.ts`（argv の見本を新しい配線に合わせる）
  - `test/server/utils/stroke/invoke.test.ts`（本家 MCP の配線を見ていた3件を「配線しない」に改める）
  - `test/e2e/fixtures/upstream-stub.mjs`（本家の `POST /api/projects/add` を模す）
  - 「本家 MCP が接続した瞬間に `.spec-workflow/` ができる」と書いたコメント（`activate-approved.ts`・`directory.ts`・`creating.ts`・`project.ts`・`projects/[projectId]/index.delete.ts` とそのテスト）
- **影響しないもの**: `claude.ts`、`nuxt.config.ts`（`claude.args` も設定も変えない。使う `upstreamBaseUrl` は既存）、画面（`useProposalReview.ts`）、U13・U14・U15・P1 の各 endpoint、巡回、自前 MCP ツール
- **本家との関係**: 本家が登録に使う PID は dashboard 自身のもの（`addProjectByPath` は `process.pid` で登録する）。dashboard を再起動すると登録は消える（`cleanupStaleProjects()`）が、`.spec-workflow/` は残るので一覧の母集合（`project/directory` の走査）からは消えない。続きの起動でも P2 を依頼するので、再起動後の起動で登録は戻る
- **上位資料への整合反映**（design で提案し、承認を得てから書く。issue-tracker「更新対応」）: `docs/specs/api/overview.md`（`projects/` 2本）、`docs/specs/api/projects/generate.md`（新規）、`docs/specs/api/contract.md`（受理系の一覧）、`docs/specs/plan/portal-stroke-exit.md`（本家 MCP を与えて起こす記述と `.spec-workflow/` ができる契機）、`docs/specs/core/settings-reference.md`（本家 MCP の配線に関する記述の削除・`upstreamBaseUrl` が効く先）、`docs/specs/architecture/session-workflow.md`（配線の表・「steering 工程はポータル側の設定を2つ使う」）、`docs/specs/mcp/tools.md`（本家 MCP に触れる記述があれば）
