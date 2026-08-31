---
tags:
  - enhancement
status: Doing
order: 0.0
---

# provide-operations-via-mcp

claude プロセスの操作系一式（取得・提出）を、curl スキルから MCP ツールへ移す。
まずは**現行操作の代行**（既存 REST への薄いプロキシ）で方式を固め、MCP ツール自体が実処理を持つ実装は次のステップ（`adr0016-sub-implement-mcp-operations`）とする。

触るファイル:
- 新規 server/mcp/tools/（代行ツール6本。`get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document` / `get-steering`）
- 新規 server/utils/mcp/（接続表・token 照合・allowedTools の組み立て・代行先への fetch）
- 更新 server/utils/stroke/invoke.ts（spawn 直前の token 発行と `--mcp-config` / `--allowedTools` の組み立て）
- 更新 nuxt.config.ts（モジュール追加、allowedTools から curl / jq を落とす、prompt 3件の向き先、`--add-dir` から assets を外す）
- 新規依存 @nuxtjs/mcp-toolkit（0.x のため lockfile で固定）

`docs/` は触らない（`adr0016-sub-document-mcp-operations` で扱う）。

## 現況（2026-08-29）

実装（1〜4章）とレビュー（6.1）は完了。**残るのは検証（5章）と、その後の承認である。**

- **5.1 取得・提出が MCP ツール経由で往復が成立する** — 未了。同日の実測で条件は満たしたが、ユーザーのレビューを経ていない
  - セッション `d823166d-…`: 往復6 / proposal 到達 / 差し戻し → 出し直しまで完走。取得・提出は MCP のみ（Skill / Bash / Write による取得・提出は0件）
  - `get-send-back` の**成功経路（200）を初めて通した**。tasks.md が「一度も通っていない」としていた項目
- **5.2 ツール6本の正常系** — steering 側2本（`get-steering` / `submit-document` の steering 種別）が未了。`adr0016-sub-add-stroke-check-approval-option` 待ち
- **5.3 並走の非混在** — 未了
- **6.2 santa-method の再実施 / 6.3 承認** — 未了

## 完了の前提となる change

tasks.md の6章に明記（ユーザー指示 2026-08-29）。いずれかが未了のうちは承認依頼へ進まない。

| change | 理由 |
|---|---|
| `adr0016-sub-add-stroke-check-approval-option` | 5.2 の steering 2本を通すのに要る |
| `adr0016-sub-define-request-validation-messages` | 違反箇所が届かないと問いが通らない。実装 47%（A5 のみ先行） |
| `adr0016-sub-update-debug-log-per-session` | 5章の証跡（`tool_use` の抽出）がこのログ形式に依存。実装 78% |
| `adr0016-sub-fix-busy-response-handling` | 画面が 409 から回復できず往復が止まる |
| `adr0016-sub-create-steering-guidance-mcp-tool` | steering 工程の案内の足場が無い |
| `adr0016-sub-create-flontier-guidance-mcp-tool` | flontier 工程の案内。tasks 3.13 から切り出した |

## 検証で判明した別件（この change が作ったものではない）

いずれも ticket 起票済み。

- `restrict-agent-add-dir-scope` — エージェントが stroke-board のリポジトリを読める。自分の検証ログまで探索する
- `isolate-stroke-check-llm-context` — `yarn check:stroke` が呼ぶ haiku に作業文脈が混ざる
- `stabilize-dev-module-delivery` — dev のモジュール取り落としで画面が固まり、サーバー側が完走していても検証が落ちる

## 前提

- **操作系スキルはロードさせない。** `--add-dir` から `${dirname}/assets` を外してある（tasks 4.9）。ファイル自体は `64a2cdc` の git 操作で HEAD に復元されているが、ロードはさせない。5.1 の合格根拠がこの状態に依存する
- 検証は `yarn check:stroke`（`scripts/stroke-check.ts`）で行う。操作はブラウザのみ。`claude` の直接呼び出し・curl・MCP の直叩きは使わない
- **往復の回数は道具側の答え方に依存する**（実測 2026-08-29）。選択肢から選ぶと1〜2往復、自由記述（haiku 生成）だと6往復。合否を測るときは答え方を明示すること
- `projectShareRoot`（`/opt/projects`）は worktree 間で共有される。複数の dev を同時に動かすと巡回が相手のセッションを再キックする。検証時は一方だけを動かす
