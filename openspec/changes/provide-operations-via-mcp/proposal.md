# provide-operations-via-mcp

## Why

claude プロセスが stroke-board と本家へアクションする操作系一式は、現在 curl スキル（`!` フェンス + `STROKE_BASEURL` / dashboard REST）で提供されている。この方式はスキル・curl・jq の組み合わせに依存し、契約（引数の形・件数上限・エラー）が案内スキル（/guidance）の散文でしか表現できない。セッション id の解決もスキルの `!` フェンス内でしか効かない実測制約に縛られている。操作を MCP ツールとして提供し、名前・引数スキーマ・説明をツール契約として一等市民にする。まずは**現行操作の代行**（既存 REST への薄いプロキシ）で方式を固め、MCP ツール自体が実処理を持つ実装は次のステップとする。

## What Changes

- **新規**: stroke-board 自身が `@nuxtjs/mcp-toolkit` により MCP サーバー（route `/mcp`、Streamable HTTP）を提供し、claude プロセスの現行操作を MCP ツールとして提供する（ユーザー指示 2026-08-27: モジュール採用。別プロセス・stdio は採らない）。代行先は既存 REST endpoint とし、対応は次のとおり

  **stroke-board 向け**（セッション工程。`STROKE_BASEURL` のセッション API へ代行）:

  | 現行操作 | 代行先 endpoint |
  |---|---|
  | 概要の取得 | `GET /api/strokes/:id/overview` |
  | ストローク記録の取得 | `GET /api/strokes/:id/strokes` |
  | 差し戻しの取得 | `GET /api/strokes/:id/send-back` |
  | 問いの提出 | `POST /api/strokes/:id/question` |
  | proposal の提出 | `POST /api/strokes/:id/proposal` |

  **本家向け**（steering 工程。本家 dashboard REST へ代行）:

  | 操作 | 代行先 endpoint |
  |---|---|
  | steering 文書（product / tech / structure）の取得（有無はステータスで告知） | `GET /api/projects/:projectId/steering/:name` |
  | steering 文書（product / tech / structure）の書き込み | `PUT /api/projects/:projectId/steering/:name` |

  projectId の解決はツールの引数にせず、MCP サーバー内部で行う（接続情報の解決の一部）。

  全操作を endpoint への代行に統一する。**ファイル直読み・直書きの経路は採らない**（MCP サーバーはセッション・プロジェクトのファイルに触れない。現行のファイル直書き・`.mcp.json` からの解決はすべて endpoint 経由に置き換わる）。ツールの粒度（endpoint 1:1 か操作単位でまとめるか）と命名は specs / design で定める。現行スキル名は引き継がない
  - ツール名は現行スキル名を引き継がない。MCP ツールとしての命名は specs / design で定める
- **新規**: サーバー内にセッション管理の層を追加する。claude の spawn 直前に一時 token を発行し、メモリ上の対応表（token → 工程種別・セッション id / プロジェクトパス・claude の session-id）に登録する。MCP のツール呼び出しはこの token の照合で接続文脈を解決し、invoke.ts が起動した claude 以外の接続を拒否する
- **変更**: claude の spawn（セッション工程・steering 工程）の `--mcp-config` にこのサーバーを加える。url（`<apiBaseUrl>/mcp`）と一時 token（ヘッダ）は呼び出し側が埋める（スキルの `!` フェンス依存を持ち込まない）。あわせて MCP ツール分の `--allowedTools` も呼び出し側のコード内で組み立てて足す。これが無いと claude はツールを呼びたくても呼べず、「提供した」ことにならない
- **変更**: `nuxt.config.ts` の既存 allowedTools から `Bash(curl -X POST *)` と `Bash(jq -n *)` を落とす（ユーザー指示 2026-08-27）。取得・提出を MCP ツール以外の手段で真似できる余地を残さない
- **変更**: `nuxt.config.ts` の prompt 3件（`firstPrompt` / `continuePrompt` / `steeringPrompt`）の向き先を MCP ツールへ改める。`assets/.claude/skills/` が無い現状では prompt が指す「取得スキル」が存在せず、指し先が無いままでは提供したツールで往復が成立せず、本 change の受け入れ判定ができない
- **範囲外（明示）**:
  - ワークフロースキーマ側の instruction の作り直し・スキル相当の手順書の整備は**別 change**（`switch-workflow-to-mcp-tools`）で行う。本 change では、提供した MCP ツールで往復が成立する状態までを担う
  - stroke の工程（セッション・steering）が見ないスコープの endpoint（spec 文書・タスク状態・実装ログ・承認・プロジェクト追加削除・jobs）は対象外
  - 承認依頼の**作成**は dashboard REST に口が無い（本家 MCP ツール `approvals` のみ）ため対象外。steering 工程での本家 MCP の併用を続ける
  - MCP ツールが自ら実処理を行う実装（代行の先）は次のステップの change とする

## Capabilities

### New Capabilities

- `mcp/server`: MCP サーバー本体。stroke-board 自身の route `/mcp`（Streamable HTTP）での提供、接続情報（base URL・projectId）の解決、セッション・プロジェクトのファイルに触れないこと（全操作が endpoint 代行であること）。
- `server/session-management`: セッション管理。spawn 直前の一時 token の発行とメモリ上の対応表（token → 工程種別・セッション id / プロジェクトパス・claude の session-id）への登録、ツール呼び出し時の照合による接続文脈の解決、invoke.ts が起動した claude 以外の拒否、invokeAi 終了時の削除・再起動での失効（永続化しない）。
- `mcp/tools/overview`: 概要の取得ツールの契約（代行先 `GET /api/strokes/:id/overview`）。
- `mcp/tools/strokes`: ストローク記録の取得ツールの契約（代行先 `GET /api/strokes/:id/strokes`）。
- `mcp/tools/send-back`: 差し戻しの取得ツールの契約（代行先 `GET /api/strokes/:id/send-back`）。
- `mcp/tools/question`: 問いの提出ツールの契約。問いは構造化データ（header / detail / question / options）のため専用の引数スキーマを持つ（代行先 `POST /api/strokes/:id/question`）。
- `mcp/tools/submit`: 文書の提出ツールの契約。種別を引数で受け、proposal（`POST /api/strokes/:id/proposal`）・steering 文書（`PUT /api/projects/:projectId/steering/:name`）へ振り分ける。
- `mcp/tools/steering`: steering 文書の取得ツールの契約。文書の有無はステータスとして結果に含める（代行先 `GET /api/projects/:projectId/steering/:name`。projectId はサーバー内部で解決）。
- `mcp/tools/guide`: セッション工程の進め方をエージェントへ渡すツールの契約。本家 `spec-workflow-mcp` の `spec-workflow-guide` / `steering-guide` と同じ役割で、手順そのものを本文として返す（ユーザー指示 2026-08-27）。操作系のツールは「何ができるか」しか伝えられず、どの順で何をするか・いつ把握完了とみなすか・いつ proposal を出すかは手順を読まないと決まらない。代行先を持たない唯一のツールである。

各ツールの契約は、入出力スキーマ・代行先 endpoint への渡し方・エラー処理（種別・ステータス・内容の構造化）の規約を定める。

### Modified Capabilities

なし。`--mcp-config` の追加は `agent/invocation` の既存 Requirement「呼び出し側は、引いた起動フラグをそのまま渡すか、その実行に要るフラグを足して渡す SHALL」の範囲内の利用であり、Requirement 自体の変更を伴わない（実装時に確認。santa-method レビュー指摘）。

## Impact

- **影響コード**: `server/utils/stroke/invoke.ts`（token の発行・登録と `--mcp-config` の組み立て。steering の本家 MCP と並べて自前サーバーを追加。MCP ツール分の `--allowedTools` も同じ場所で組み立てる）、`nuxt.config.ts`（モジュールの追加。url は既存値 `runtimeConfig.claude.apiBaseUrl` から組み立て、新しい設定は増やさない。既存 `--allowedTools` から curl / jq を落とし、prompt 3件の向き先を改める）
- **新規コード**: ツール定義一式（`server/mcp/tools/`）とセッション管理の層（`server/utils/`）
- **新規依存**: `@nuxtjs/mcp-toolkit`（0.x のため lockfile で固定）
- **docs**: 本 change では `docs/` を触らない。MCP 操作系の定義資料・`settings-reference.md` への追記・ADR の記録は、別 change `document-mcp-operations` で行う
- **後続 change（proposal まで起こし済み・本 change に含めない)**:
  - `switch-workflow-to-mcp-tools`: ワークフロースキーマ側の instruction の作り直し・スキル相当の手順書の整備
  - `implement-mcp-operations`: MCP ツールの実処理化（代行の先）
  - `document-mcp-operations`: MCP 操作系のドキュメント作成
- **動作互換**: 既存の API・ワークフロースキーマには手を入れない。ただし操作系の curl スキル（`assets/.claude/skills/`）が無い現状では、併存による互換維持は成立しない。取得・提出は MCP ツールで成立させる。案内・instruction は引き続き Skill が担う（役割分担であって Skill の廃止ではない）
