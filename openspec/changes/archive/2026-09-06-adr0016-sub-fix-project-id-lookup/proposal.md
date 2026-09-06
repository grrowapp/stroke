## Why

**症状**: projectId の引き当てに失敗したとき、`error` が「登録されていない」としか読めない。実際には登録されているのに照合が外れている場合があり、受け手（steering 工程の claude）とその後を追う人を、存在しない原因の解消へ向かわせる。

`server/utils/mcp/resolve-project-id.ts` は、接続表の `projectPath` と本家の一覧の `projectPath` を `resolve()` で正規化して突き合わせる。引き当てられないと `project_not_registered` になるが、本文は一言だけで、一覧に何があったのかが分からない。

**もう1つ、引き当ての手順が規定として書かれていない。** 本家は渡されたパスを `git rev-parse --show-toplevel` で解決してから登録する（本家 2.2.5 の `core/git-utils.js`）。いまは `projectShareRoot` が `/opt/projects` で git リポジトリではないので、渡した cwd がそのまま登録され、照合は成立する（実測 2026-08-31）。

この事実がどこにも規定されていないため、**解決でパスが変わったときに「差を吸収して引き当てる」実装が入りうる。** それは入れてはならない。差が出る場面では本家自身が複数のセッションを1つの `projectId` にまとめており、吸収して引き当てると別のセッションと共有の id を返して、steering 文書を取り違えて書く。引き当てを外して `project_not_registered` で止まるほうが正しい。

共有ルートを git 管理下に置かないという運用上の前提は、前提のまま残る（`docs/specs/reference/upstream-observations.md`「登録されるパスは git のトップレベルへ解決される」）。その前提が崩れる場面は本家自身がセッションを区別できないので、引き当て側では直せない。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）ので change を立てる。ADR-0016 の委譲に「後続」として1本足す。

## What Changes

- 変更: 引き当てられなかったときの `error` に、引き当てに使ったパスと、そのとき一覧が持っていたプロジェクトの名前・パスを載せる。一覧が空だったのか、一覧にプロジェクトはあるが対応しないのかを本文だけで区別できるようにする
- 追加（規定のみ）: 引き当ての手順を規定に書く——一覧の応答だけを手掛かりにする／完全一致で照合する／本家の解決でパスが変わった差を吸収しない／本家のパス解決手続きを再実行しない／登録簿ファイルを読まない
- **`errorCode` は増やさない。** `project_not_registered` のまま、`status` も 404 のままとする

**取り下げたもの**: 起票時の「`projectPath` の一致だけに頼らず、本家が持つ別の手掛かり（`workflowRootPath` など）も見る」。`workflowRootPath` は一覧が返さず、手掛かりにならない（design D2）。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `mcp/server`: `project_not_registered` の `error` 本文の中身を規定に加える。新しい `errorCode` を割り当てないことを明示する
- `upstream-connection`: パスから projectId を引き当てる手順を規定に加える

## Impact

- `server/utils/mcp/resolve-project-id.ts` — `error` 本文の組み立て。照合そのものは完全一致のまま変えない
- `test/server/utils/mcp/resolve-project-id.test.ts` — `error` 本文のケースを追加
- `docs/specs/reference/upstream-observations.md` — 本家の正規化についての事実（`git rev-parse --show-toplevel`）を記録する。**`update-docs-for-runtime-fixes` へ委譲し反映済み**（同 change の `U1`）
- `docs/specs/mcp/tools.md` の `errorCode` 表 — 同じく委譲したが**ユーザー判断で見送り**（同 change の `M2`）
- `docs/adr/0016-delegate-provide-operations-via-mcp.md` — 当該節の「対処」が古い。承認を得てから直す（design 提案3）
