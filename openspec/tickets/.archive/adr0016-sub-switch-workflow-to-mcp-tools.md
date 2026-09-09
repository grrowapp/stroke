---
tags:
  - enhancement
status: ready-for-agent
order: 0.0
---

# adr0016-sub-switch-workflow-to-mcp-tools

ワークフロースキーマの instruction が、存在しないスキルを指したままになっている。入口を MCP ツールへ切り替える。

触るファイル:
- 更新 `~/.local/share/openspec/schemas/flontier-strokeflow/`（配置されるワークフロースキーマの実体。配置手順は README）

## 事実

`flontier-strokeflow` の instruction は `/get-overview` `/get-strokes` `/get-send-back` というスラッシュコマンド形式で書かれている。**指す実体はもう無い。** 操作系スキルは `--add-dir` から外してあり、ロードされない（`provide-operations-via-mcp` の tasks 4.9）。

それでも往復が成立しているのは、**MCP ツール名がスキル名とたまたま一致しているためである**。エージェントは名前の一致で偶然ツールに当たっている。実測 2026-08-29（セッション `d823166d-…`）では往復6回・proposal 提出・差し戻しからの出し直しまで通っており、現時点で実害は出ていない。

ただしこれは偶然に依存している。ツール名を変えた瞬間に壊れる。

## 求めるもの

- instruction を、スキル呼び出しから MCP ツールの利用指示へ書き換える
- 名前の一致に依存しない形にする

## proposal から落とす項目（2026-08-29 時点で不要）

元の proposal は4項目を挙げているが、2項目は既に済み、1項目は方針変更で不要になった。**残るのは instruction の書き換えだけである。**

- ~~`--allowedTools` から curl 系（`Bash(curl -X POST *)` / `Bash(jq -n *)` / `Bash(printenv *)`）を外し、MCP ツールの許可へ置き換える~~
  → **実施済み**。`provide-operations-via-mcp` の tasks 4.5 / 4.6。現在の値は `Skill Bash(openspec *) Read Edit Write` で、MCP 分は `server/utils/mcp/allowed-tools.ts` の `withMcpToolsAllowed` が `mcp__stroke-board` を追記する
- ~~curl スキル一式を `assets/.claude/skills/` から撤去する~~
  → **不要**。ファイルは残す方針に変わった（ユーザー 2026-08-29:「スキルを残したのは基本的には guidance の作成のため」）。ロードさせない制御は `--add-dir` 側で行っており（tasks 4.9）、ファイルの撤去は要らない

## 切り分けが要る点

`adr0016-sub-create-flontier-guidance-mcp-tool` と担当範囲が重なる。案内の手順そのものを MCP ツール（`get-guide`）が返すなら、instruction 側は「まずそのツールを呼べ」と述べるだけで足りる可能性がある。

- **instruction が手順を持つのか、ツールが持つのか**を先に決める
- 決めてから、どちらの change が何を書くかを分ける

`adr0016-sub-create-flontier-guidance-mcp-tool` の ticket にも同じ論点を記載済み。

## 前提

- `provide-operations-via-mcp` の完了（MCP ツールが提供済みであること）
- ワークフロースキーマの実体はリポジトリ外（`~/.local/share/openspec/schemas/`）にある。配置手順は README を参照
- 設定値の記述を伴う場合は ADR-0004 の手続きに従う。`docs/specs/core/settings-reference.md` は `adr0016-sub-document-mcp-operations` も触るため、順序の調整が要る
