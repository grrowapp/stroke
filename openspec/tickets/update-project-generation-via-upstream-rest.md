---
change: update-project-generation-via-upstream-rest
origin: user
status: Planning
tags:
  - proposal
  - specs
  - design
  - tasks
---

# update-project-generation-via-upstream-rest

プロジェクト作成（承認で昇格したあと、本家 spec-workflow にプロジェクトを存在させること）を、claude プロセスの中で起きる本家 MCP の自己登録に乗せた生成から、**サーバーが本家 REST（`POST /api/projects/add`）をキックする生成**へ変更する。生成の endpoint が1本（P2 `POST /api/projects`、本文 `{ projectPath }`。プロジェクトのリソースの作成）増え、承認の後の実行が初回の起動の前にそれを依頼する。claude の起動定義・定型・`--mcp-config` には触れない。

## 経緯

ユーザー指示（2026-09-08）: 「プロジェクト作成を claude プロセスの起動経由による生成ではなく、本家 REST のキックを使っての生成に変更しろ」「プロジェクトの生成を、claude の起動というアクションと明確に分離し、プロジェクト生成の API が一つ増えるだけだ」「エンドポイントは、ユーザー操作でないなら stroke だ。UXX じゃない。id の指定も意味が不明」「UXX は、ユーザーが叩く API だ。UXX に持たせるな」「なぜ、project をつかわない」。

現状は承認（U10）→ 昇格（U14、rename）のあと、U13 が steering 用の claude を `--mcp-config`（本家 MCP + 自前 MCP）付きで spawn し、本家 MCP の自己登録で初めてプロジェクトが本家に現れる。本家 REST には `POST /api/projects/add`（body `{projectPath}`）があり、登録簿への登録と watcher の起動（`.spec-workflow/approvals/` の作成）を行う（本家 2.2.5 `dist/dashboard/project-manager.js` `addProjectByPath`、2026-09-08 読了）。

## 畳む方向

P2 が本家へ登録を依頼し、steering の起動の準備（`prepare`）がそれを叩くこと。接点層の書き込みが「決めた4つ」として固定され直していること。上位資料（`docs/specs/api/` の目録と契約、`portal-stroke-exit.md`、`settings-reference.md`、`session-workflow.md`）への整合反映を承認を経て済ませること。
