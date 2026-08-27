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
- **変更**: claude の spawn（セッション工程・steering 工程）の `--mcp-config` にこのサーバーを加える。url（`<apiBaseUrl>/mcp`）と一時 token（ヘッダ）は呼び出し側が埋める（スキルの `!` フェンス依存を持ち込まない）
- **範囲外（明示）**:
  - ワークフロースキーマの instruction・`--allowedTools`・現行スキル群の切り替えは**別 change** で行う。本 change ではツールを「提供」するまでで、既存の入口はそのまま動き続ける
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

各ツールの契約は、入出力スキーマ・代行先 endpoint への渡し方・エラー処理（種別・ステータス・内容の構造化）の規約を定める。

### Modified Capabilities

- `agent/invocation`: 呼び出しの起動定義に MCP サーバーの提供が加わる（セッション工程・steering 工程の `--mcp-config` への追加と、サーバーへ渡す env の組み立て）。

## Impact

- **影響コード**: `server/utils/stroke/invoke.ts`（token の発行・登録と `--mcp-config` の組み立て。steering の本家 MCP と並べて自前サーバーを追加）、`nuxt.config.ts`（モジュールの追加。url は既存値 `runtimeConfig.claude.apiBaseUrl` から組み立て、新しい設定は増やさない）
- **新規コード**: ツール定義一式（`server/mcp/tools/`）とセッション管理の層（`server/utils/`）
- **新規依存**: `@nuxtjs/mcp-toolkit`（0.x のため lockfile で固定）
- **docs**: 本 change では `docs/` を触らない。MCP 操作系の定義資料・`settings-reference.md` への追記・ADR の記録は、別 change `document-mcp-operations` で行う
- **後続 change（proposal まで起こし済み・本 change に含めない)**:
  - `switch-workflow-to-mcp-tools`: スキーマ instruction・allowedTools・スキル群を MCP ツールへ向ける切り替え
  - `implement-mcp-operations`: MCP ツールの実処理化（代行の先）
  - `document-mcp-operations`: MCP 操作系のドキュメント作成
- **動作互換**: 既存の curl スキル・API・ワークフロースキーマには手を入れないため、提供期間中の挙動は現行のまま
