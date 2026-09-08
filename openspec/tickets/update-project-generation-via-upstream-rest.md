---
change: update-project-generation-via-upstream-rest
origin: user
status: Doing
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

## 畳む方向

P2 が本家へ登録を依頼し、steering の起動の材料の組み立てが起動のたびにそれを叩くこと。steering の `--mcp-config` に本家 MCP が無く、単体・E2E・実機で「AI の起動ではプロジェクトが生成されない」が確かめられていること（tasks 2.2(c)・6.3・7.4）。接点層の書き込みが「決めた4つ」として固定され直していること。上位資料（`docs/specs/api/` の目録と契約、`portal-stroke-exit.md`、`settings-reference.md`、`session-workflow.md`、`CONTEXT.md`「生成中」）への整合反映を承認を経て済ませること。
