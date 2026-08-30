---
tags:
  - document
status: ready-for-agent
order: 0.0
---

# adr0016-sub-document-mcp-operations

MCP 操作系の定義資料が `docs/` に無い。`provide-operations-via-mcp` が「docs は触らない」と決めた分を、独立した change として書く。

触るファイル:
- 新規 docs/specs/（MCP 操作系の定義資料。ツール一覧・各ツールの契約・配線。構成は design / tasks で確定）
- 更新 docs/specs/core/settings-reference.md（起動定義に増えた設定の追記。ADR-0004 の手続きに従う）
- 新規 docs/adr/（「操作系は endpoint 代行の MCP ツールで提供し、ファイル直読み・直書きを採らない」の決定）

アプリのコード・既存 spec には触らない（`skip_specs: true`）。

## 既存ドキュメントの誤り（2026-08-29 に判明。追記だけでなく修正が要る）

新規作成の前に、既に食い違っている記述が2箇所ある。どちらも `docs/specs/core/settings-reference.md`。

- **`claude.debugLogDir` の説明（90行目付近）** が「`--output-format json` の stdout 全文」のまま。実装は `stream-json` に変わっている（`adr0016-sub-update-debug-log-per-session`、コミット `e4fc81f`）。この形式変更があって初めて `tool_use` / `tool_result` が記録され、`provide-operations-via-mcp` の 5章の証跡が取れるようになった
- **`write-steering-v2` を「このリポジトリの `.claude/skills/` に在り」と書いているが、実体がどこにも無い。** `.claude/` には `settings.json` しかなく、`assets/.claude/skills/` にも無い。`nuxt.config.ts` の `steeringPrompt` がこの存在しないスキルを指している（`adr0016-sub-create-steering-guidance-mcp-tool` を参照）

## 記述対象（2026-08-29 時点の実装）

- MCP サーバー: `@nuxtjs/mcp-toolkit`（nuxt-modules 公式 v0.19.0）。route `/mcp`、Streamable HTTP。ツール定義は規定配置 `server/mcp/tools/`
- ツール6本: `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document` / `get-steering`。いずれも既存 REST への代行で、ファイルには触れない
- 結果の形: 1階層のフラット。常に `status`（HTTP ステータス）、失敗時に `errorCode` と `error`。本家 dashboard へ到達できない場合は `unreachable`
- 接続の担保: spawn 直前に発行する一時 token をメモリ上の接続表で照合。`x-stroke-token` ヘッダ。永続化しないので再起動で全失効
- 起動配線: `invoke.ts` が `--mcp-config` と `--allowedTools`（`mcp__stroke-board`）を組み立てる。`--allowedTools` は既存の値に追記して指定を1本に保つ

## 前提

- `provide-operations-via-mcp` の設計確定が前提（記述対象の確定）。実装とレビューは完了しており、残るのは検証と承認
- 設定値の記述は ADR-0004 の手続きに従う（`settings-reference.md` が設定の正）
- `adr0016-sub-switch-workflow-to-mcp-tools` が `settings-reference.md` の同じ節に触れる。順序の調整が要る
