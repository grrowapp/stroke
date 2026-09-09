---
status: ready-for-agent
tags:
  - enhancement
---

# adr0016-sub-create-flontier-guidance-mcp-tool

flontier 工程の進め方をエージェントへ渡す手段が無い。案内を MCP ツールとして配る。

## 事実

`provide-operations-via-mcp` の tasks 3.13 から切り出した（ユーザー判断 2026-08-29）。本 change は代行ツール6本の提供に留め、案内を配るツールは別に扱う。steering 側の `adr0016-sub-create-steering-guidance-mcp-tool` と対になり、両工程で案内の届け方を揃える。

**出典の訂正**: 3.13 と proposal は「ユーザー指示 2026-08-27」と記録していたが、これは**エージェントの提案**だった（ユーザー指摘 2026-08-29）。

いま案内は存在しない。

- ワークフロースキーマ（`flontier-strokeflow`）の instruction は `/get-overview` `/get-strokes` `/get-send-back` というスラッシュコマンド形式で、**指す実体が無い**。エージェントは名前の一致で偶然 MCP ツールに当たっているだけである
- `assets/.claude/skills/guidance/SKILL.md` は残っているが、中身は旧スキル方式（`/get-overview` の呼び方、`STROKE_BASEURL` と `CLAUDE_SESSION_ID` での解決）で、MCP には対応していない。かつ `--add-dir` から外したのでロードされない（tasks 4.9）

案内が無いことの実害は実測で出ている（2026-08-29、セッション `167cb9d2-…` / `d823166d-…`）。差し戻しで「Why が弱い」と指摘された直後、エージェントは **proposal の書き方の見本を自力で探し始めた**。

```
Read: .../.spec-workflow/approvals/provide-operations-via-mcp/.snapshots/proposal.md
Bash: find ... -iname "proposal*.md" -not -path "*/node_modules/*"
Read: .../docs/specs/architecture/question-flow.md
```

**往復の回数については、案内の不足を根拠にできない。** 同日の実測で、往復数は道具側の答え方に依存することが分かった。

| 答え方 | 往復 |
|---|---|
| 選択肢から選ぶ（`--policy recommended` / `last`） | 1〜2 |
| 自由記述（`--policy free`。haiku が中身のある回答を書く） | 6 |

選択肢のどれかが返る限り、エージェントは答えが確定したと扱う。往復が短かったのは道具が選択肢を選んでいたためで、案内の有無とは別の話である。

## 求めるもの

- flontier 工程の手順をエージェントへ渡すツール（`get-guide`）
- 引数を取らず、`status` と `guide`（手順の本文）を返す
- 手順の本文はセッションの状態に依存しない。状態は既存の取得ツールが返す
- ツールの説明（description）は、他のツールより先に呼ぶべきことを述べる
- 手順に含めるもの: 状態の確認から提出までの順序 / 問いを立てる単位と各項目の上限 / 把握完了の判定 / proposal を提出する条件と形式 / 差し戻しを受けたときの進め方

## 前提

- spec は `provide-operations-via-mcp` から移設済み（`specs/mcp/tools/guide/spec.md`。Requirement 3件・Scenario 3件）
- **代行先を持たない唯一のツールになる。** 他の6本は既存 REST への薄いプロキシで、実処理は endpoint 側にある（ADR-0014）
- 役割分担は「操作系＝MCP ツール / 案内・instruction＝Skill」と決めてあった。案内を MCP ツールへ寄せるのはこの分担の変更にあたる。steering 側を MCP ツールにする決定（2026-08-29）と揃える判断である
- ワークフロースキーマ側の instruction の作り直しは `adr0016-sub-switch-workflow-to-mcp-tools` の担当。本件と重なる部分の切り分けが要る
