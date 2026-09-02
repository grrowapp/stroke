## Why

**steering 工程には、プロジェクトの文脈を取る MCP ツールが1本も無い。** 公開しているのは `get-steering-guide` / `get-steering` / `submit-document` の3本だけである（`server/utils/mcp/exposed-tools.ts`）。

その結果、steering の claude は毎回ファイルを直接読んでいる。**実測 2026-09-01**（`yarn check:stroke --approve` を2周、`claude.debugLogDir` を一時設定して `tool_use` を数えた）:

| 実行 | `Read` | `Bash` | 読んだもの |
|---|---|---|---|
| 1周目 steering（`3bbb7ead`） | 5 | 2 | `overview.txt` / `docs/proposal.md` / `state.json` / `strokes.json` / `openspec/config.yaml`、`.spec-workflow` と `openspec` への `find` |
| 2周目 steering（`b3eaffdf`） | 5 | 1 | 同上 |

flontier 側は `Read` も `Bash` も 0 回である。文脈を `get-overview` / `get-strokes` から取れるためで、**差は道具の有無そのものにある。**

`docs/specs/api/mcp-tools.md` は「操作の入口はこれだけである。ファイルの直読み・直書きも、コマンドによる代行も採らない」と定めている。`adr0016-sub-fix-direct-write-allowance` が `Write` / `Edit` を外して**書き込み側は構造で閉じた**が、**読み取り側は開いたままである**。しかも `get-steering-guide` の案内は「ファイルを直接読み書きしない」と述べており、いま守られていない。

`Read` を単に外すことはできない。外すと steering の claude は何を書けばよいか知る手段を失い、工程が成立しない（実測のとおり、文脈は全部ファイルから取っている）。**道具を先に用意してから閉じる**必要がある。

## What Changes

- 追加: steering 工程が文脈を取るための MCP ツール。何を公開するかは design で決める（既存の `get-overview` / `get-strokes` を steering にも公開するのか、昇格後の対象を読む別のツールを足すのか）
- 変更: 用意できたら `--allowedTools` から `Read` を外し、`Bash(openspec *)` の要否も同じ実測で判定する
- 変更: 案内（`get-steering-guide`）の「ファイルを直接読み書きしない」が、許可の状態と一致するようにする

**順序を守る。** 道具を用意する前に `Read` を外すと steering が成立しなくなる（`adr0016-sub-fix-direct-write-allowance` が specs に置いた「手順が求める読み書きを残したまま道具だけを外してはならない」と同じ形）。

## Capabilities

### New Capabilities

なし。既存ツールの公開範囲を変えるだけで済む可能性があるため、新設かどうかは design で決める。

### Modified Capabilities

- `mcp/server`: 工程ごとの公開に、steering 側が文脈を取れることを規定に加える
- `agent/invocation`: 許可する道具が、MCP ツールを通さない**読み取り**の経路を作らないことを規定に加える

## Impact

- `server/utils/mcp/exposed-tools.ts` — steering の公開一覧
- `server/mcp/tools/` — 公開するツール（既存の再利用か新設かは design）
- `nuxt.config.ts` — `--allowedTools`（`Read` / `Bash(openspec *)`）
- `server/mcp/tools/get-steering-guide.ts` — 案内の文言
- `docs/specs/api/mcp-tools.md` / `docs/specs/core/settings-reference.md` — 整合反映（design で提案し、ユーザー承認を得てから）
