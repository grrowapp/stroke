---
tags:
  - bug
status: Tasks
---

# adr0016-sub-fix-project-id-lookup

`server/utils/mcp/resolve-project-id.ts` は接続表の `projectPath` と本家の一覧の
`projectPath` を `resolve()` で突き合わせるが、**本家は渡されたパスを
`git rev-parse --show-toplevel` で解決してから登録する**（本家 2.2.5 `core/git-utils.js`）。

いまは `projectShareRoot` が `/opt/projects` で git リポジトリではないため一致している
（実測 2026-08-31）。**`projectShareRoot` が git 管理下へ動いた瞬間、本家の `projectPath` は
git のトップレベルへ化けて照合が外れる。** 登録簿には既にその形の例が在る（`agent-messanger`）。

失敗の出方も悪い。登録はあるのに `project_not_registered` になり、原因を取り違える。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 8・9周目（2026-08-31）。
ADR-0016 の委譲（後続）。

対応する change: `adr0016-sub-fix-project-id-lookup`
