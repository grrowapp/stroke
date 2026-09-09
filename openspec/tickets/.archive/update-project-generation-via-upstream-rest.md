---
change: update-project-generation-via-upstream-rest
origin: user
status: Wait-for-archive
tags:
  - proposal
  - specs
  - design
  - tasks
  - pre6/e44bd78b-49c2-4374-a0a0-abdd2f840ff8
---

# update-project-generation-via-upstream-rest

プロジェクト作成（承認で昇格したあと、本家 spec-workflow にプロジェクトを存在させること）を、claude プロセスの中で起きる本家 MCP の自己登録に乗せた生成から、**サーバーが本家 REST（`POST /api/projects/add`）をキックする生成**へ変更する。生成の endpoint が1本（P2 `POST /api/projects`、本文 `{ projectPath }`。プロジェクトのリソースの作成）増え、承認の後の実行が起動の材料を組み立てるたびにそれを依頼する。**AI の起動に乗せた生成（steering の `--mcp-config` の本家 MCP）は外す**。claude の起動定義・定型・自前 MCP の配線には触れない。

## 経緯

ユーザー指示（2026-09-08）: 「プロジェクト作成を claude プロセスの起動経由による生成ではなく、本家 REST のキックを使っての生成に変更しろ」「プロジェクトの生成を、claude の起動というアクションと明確に分離し、プロジェクト生成の API が一つ増えるだけだ」「エンドポイントは、ユーザー操作でないなら stroke だ。UXX じゃない。id の指定も意味が不明」「UXX は、ユーザーが叩く API だ。UXX に持たせるな」「なぜ、project をつかわない」「プロジェクト生成していた specs からの remove delta を起こせ。tasks で、remove delta を対象にした、実行検証で project が生成されないことを tasks 内で確認しろ」。

現状は承認（U10）→ 昇格（U14、rename）のあと、U13 が steering 用の claude を `--mcp-config`（本家 MCP + 自前 MCP）付きで spawn し、本家 MCP の自己登録で初めてプロジェクトが本家に現れる。本家 REST には `POST /api/projects/add`（body `{projectPath}`）があり、登録簿への登録と watcher の起動（`.spec-workflow/approvals/` の作成）を行う（本家 2.2.5 `dist/dashboard/project-manager.js` `addProjectByPath`、2026-09-08 読了）。

メインの specs には「本家 MCP の配線で生成する」と定めた Requirement は無く、「`.spec-workflow/` は本家 MCP が接続した瞬間にできる」という前提が `project/directory`・`project/generation`・`api/project/delete` の7つの Requirement の本文と Scenario に散っている。delta はその前提を外す MODIFIED と、生成を P2 だけにする ADDED（`project/generation`・`agent/invocation`）で構成した。

## 実機検証（2026-09-08、tasks 7.3 / 7.4）

**P2 の手動検証（7.3）。** `yarn dev --port 3599` を起こし、本家に登録済みの `/opt/projects/stroke-board` で `POST /api/projects` → 204。本家 `GET /api/projects/list` は前後とも 2 件・`instances` 不変（登録済みのパスは本家が同じ id を返す）。親そのもの（`/opt/projects`）と親の外（`/home/vagrant/work/x`）は 400。

**AI の起動はプロジェクトを生成しない（7.4）。** 本家 dashboard（pid 3662079、`--dashboard --port 5000`）を動かしたまま `npx tsx --tsconfig .nuxt/tsconfig.server.json scripts/stroke-check.ts --approve` を1周（往復 1 → proposal → 承認 `claude-settings-editor` → steering 3本 → `activated`。記録 `.stroke-check/a2bf160b-….html`）。承認直後の観測:

- `activeProjects.json` の `claude-settings-editor` の `instances` は `[3662079]`（dashboard 自身）**の1件だけ**。steering 終了後も同じ
- 走っている claude（pid 1528045）の argv の `--mcp-config` は `{"mcpServers":{"stroke-board":{…"x-stroke-cwd":"/opt/projects/claude-settings-editor"}}}` のみ。`specworkflow` / `spec-workflow-mcp` の文字列は 0 件
- そのプロジェクトのパスを引数に持つ `spec-workflow-mcp` プロセスは 0
- `.spec-workflow/approvals/` は登録（09:34:07）の時点で本家が作成済み（AI の起動前）

**付随して見つかった既存の不具合（本 change の範囲外）。** `yarn check:stroke` は root の `tsconfig.json`（references だけで `paths` を持たない）を tsx が読むため、`server/utils/stroke/session-core.ts` の `#shared/stroke` を解決できず起動前に落ちる（`ERR_PACKAGE_IMPORT_NOT_DEFINED`。import は `2aa3df6d` から）。上の検証は `--tsconfig .nuxt/tsconfig.server.json` を渡して回避した。

検証で作ったプロジェクト `/opt/projects/claude-settings-editor`（`activated`。本家に登録済み）は残してある。二重起動で作ってしまった `stroking` のセッション2本は U11 で消した。dev サーバーは停止し、3599 の解放を確認した。

## レビュー（santa-method、2026-09-08）

独立レビュー2本を3周。1周目: E2E の件数固定が巡回（60秒ごと）と競合する・`settings-reference.md` の「も同じく」が隣と矛盾・design と実装（`buildRun` を async にせず `kick` の閉包で依頼）の食い違い。2周目: 基準を取る前に断る状態にしていない窓が残る・本家の 404 を「対象が無い」で返していた（spec は本家のエラー応答を一律 503）。3周目で両方 PASS。

残した指摘（docs の変更をユーザーが最小限に絞ったため。別途）: `docs/specs/api/contract.md`「502 は無い」は P2 の形違い 502 と食い違う。`docs/specs/plan/portal-stroke-exit.md` の mermaid「本家 spec-workflow MCP で steering 文書を作成して提出する」は本 change 以前から実態（自前 MCP ツール）と違う。

## 畳む方向

P2 が本家へ登録を依頼し、steering の起動の材料の組み立てが起動のたびにそれを叩くこと。steering の `--mcp-config` に本家 MCP が無く、単体・E2E・実機で「AI の起動ではプロジェクトが生成されない」が確かめられていること（tasks 2.2(c)・6.3・7.4）。接点層の書き込みが「決めた4つ」として固定され直していること。上位資料（`docs/specs/api/` の目録と契約、`portal-stroke-exit.md`、`settings-reference.md`、`session-workflow.md`、`CONTEXT.md`「生成中」）への整合反映を承認を経て済ませること。
