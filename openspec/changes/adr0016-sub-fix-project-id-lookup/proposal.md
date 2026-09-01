## Why

**症状**: projectId の引き当てが、本家がパスをどう正規化するかに暗黙で依存している。昇格先が git 管理下に来た瞬間、steering 工程が静かに壊れる。

`server/utils/mcp/resolve-project-id.ts` は、接続表の `projectPath` と本家の一覧の `projectPath` を `resolve()` で正規化して突き合わせる。**本家の側は渡されたパスを `git rev-parse --show-toplevel` で解決してから登録する**（本家 2.2.5 の `core/git-utils.js`。`provide-operations-via-mcp` の santa-method レビュー 8周目にレビュアーB が読んで確認）。

いまは `projectShareRoot` が `/opt/projects` で git リポジトリではないので、両者は一致する（実測 2026-08-31。`setai-3` が引き当てられた）。**`projectShareRoot` を git リポジトリの内側へ動かすと、本家の `projectPath` は git のトップレベルへ化けて照合が外れる**。既存の登録簿にもその形の例が在る（`agent-messanger` は `projectPath` と `workflowRootPath` が食い違っている）。

失敗の出方が悪い。引き当てられないと `project_not_registered` になり、原因が「登録されていない」ように見えるが、実際は登録されている。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）ので change を立てる。ADR-0016 の委譲に「後続」として1本足す。

## What Changes

- 変更: 引き当てを、本家のパス正規化の実装に依存しない形にする。`projectPath` の一致だけに頼らず、本家が持つ別の手掛かり（`workflowRootPath` など）も見る
- 変更: 引き当てられなかったときに、「登録されていない」と「登録はあるが照合が外れた」を区別できるようにする

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `mcp/server`: projectId の引き当てが本家のパス正規化に依存しないことを規定に加える
- `upstream-connection`: 本家の一覧から projectId を引き当てる手順を規定に加える

## Impact

- `server/utils/mcp/resolve-project-id.ts` — 照合の仕方
- `docs/specs/reference/upstream-observations.md` — 本家の正規化についての事実（`git rev-parse --show-toplevel`）を記録する
- `errorCode` の一覧に足す場合は `docs/specs/api/mcp-tools.md` の整合反映が要る（ADR-0004 の手続き）
