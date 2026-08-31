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
- **変更**: `nuxt.config.ts` から **`--add-dir` を丸ごと外す**。allowedTools から curl / jq を落とすだけでは足りず、`assets/.claude/skills/` の操作系スキル（get-* / question / proposal）が読める限り、取得・提出を真似る余地は残る。当初は「スキルは worktree 上で削除された状態」を前提にしていたが、ファイルは `64a2cdc`（`chore: live 系統を撤去し、スキルを戻して ADR の番号衝突を解く`）の git 操作で HEAD に復元されており、この前提は既に成立していない（実測 2026-08-29）。スキルのファイル自体には触れず、**ロードさせないのは `--add-dir` の側で制御する**。
  - 当初は2つ目だけを外し、1つ目（リポジトリのルート）は案内スキルと opsx コマンドの置き場として残す計画だったが、**ルートを渡す根拠が実在しなかった**——実運用ログの `slash_commands` 67件に `grilling` / `write-steering-v2` / `opsx` は1件も現れない。実際に届いていたのは、リポジトリ配下の `claude.debugLogDir` に残る**他人のセッションの全文**と、`.claude/settings.json` 経由の**開発者の権限**（`Agent` / `Bash(claude *)`・ソースツリーへの書き込み）だけで、どちらも渡したくないものである（実測 2026-08-30。design の Migration Plan 6）
- **変更**: `nuxt.config.ts` の prompt 3件（`firstPrompt` / `continuePrompt` / `steeringPrompt`）から、**取得・提出の操作を Skill に投げている記述**と**実体の無いスラッシュコマンドの起動**を外し、MCP ツールへ向ける。役割分担は「操作系＝MCP ツール / 案内・instruction＝Skill」であり、案内を MCP ツールへ寄せることはしない。prompt が「取得スキル」を指したままでは、提供したツールで往復が成立せず、本 change の受け入れ判定ができない
  - 当初は `steeringPrompt` を「案内・手順の Skill を指すもの」として対象外にしていたが、そこに載っていた `/write-steering-v2` は `firstPrompt` の `/openspec-ff-change` と同じく**リポジトリに実体が無く**、prompt の先頭に置くと `Unknown command` で起動が assistant のターンをひとつも持たずに終わる。**steering 工程が空振りしていた直接の原因**なので、起動を外して対象に含めた（実測 2026-08-30）
- **範囲外（明示）**:
  - ワークフロースキーマ側の instruction の作り直し・スキル相当の手順書の整備は**別 change**（`adr0016-sub-switch-workflow-to-mcp-tools`）で行う。本 change では、提供した MCP ツールで往復が成立する状態までを担う
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
（`mcp/tools/guide` は本 change から外した。案内を配るツールは `adr0016-sub-create-flontier-guidance-mcp-tool` と `adr0016-sub-create-steering-guidance-mcp-tool` で扱う。ユーザー判断 2026-08-29。本 change は既存 REST への代行ツール6本の提供に留める）

各ツールの契約は、入出力スキーマ・代行先 endpoint への渡し方・エラー処理（種別・ステータス・内容の構造化）の規約を定める。

### Modified Capabilities

なし。`--mcp-config` の追加は `agent/invocation` の既存 Requirement「呼び出し側は、引いた起動フラグをそのまま渡すか、その実行に要るフラグを足して渡す SHALL」の範囲内の利用であり、Requirement 自体の変更を伴わない（実装時に確認。santa-method レビュー指摘）。

## Impact

- **影響コード**: `server/utils/stroke/invoke.ts`（token の発行・登録と `--mcp-config` の組み立て。steering の本家 MCP と並べて自前サーバーを追加。MCP ツール分の `--allowedTools` も同じ場所で組み立てる）、`nuxt.config.ts`（モジュールの追加。url は既存値 `runtimeConfig.claude.apiBaseUrl` から組み立て、新しい設定は増やさない。既存 `--allowedTools` から curl / jq を落とし、`--add-dir` を丸ごと外し、`--strict-mcp-config` を足し、prompt 3件（`firstPrompt` / `continuePrompt` / `steeringPrompt`）の向き先を改める）
  - `--allowedTools` は `Bash(printenv *)` も併せて落ち、現在の値は `Skill Bash(openspec *) Read Edit Write`（実測 2026-08-29。`Write` は develop 側の追加で、proposal を `docs/proposal.md` に書くのに要る）
- **新規コード**: ツール定義一式（`server/mcp/tools/`）とセッション管理の層（`server/utils/`）
- **新規依存**: `@nuxtjs/mcp-toolkit`（0.x のため lockfile で固定）
- **docs**: 本 change では `docs/` を触らない。MCP 操作系の定義資料・`settings-reference.md` への追記・ADR の記録は、別 change `adr0016-sub-document-mcp-operations` で行う
- **後続 change（proposal まで起こし済み・本 change に含めない)**:
  - `adr0016-sub-switch-workflow-to-mcp-tools`: ワークフロースキーマ側の instruction の作り直し・スキル相当の手順書の整備
  - `adr0016-sub-implement-mcp-operations`: MCP ツールの実処理化（代行の先）
  - `adr0016-sub-document-mcp-operations`: MCP 操作系のドキュメント作成
- **動作互換**: 既存の API・ワークフロースキーマには手を入れない。ただし操作系の curl スキル（`assets/.claude/skills/`）はファイルとしては在るものの `--add-dir` から外してロードさせないため、併存による互換維持は成立しない（実測 2026-08-29: スキルのファイルは `64a2cdc` の git 操作で HEAD に復元済み。上記「`--add-dir` を丸ごと外す」の項）。取得・提出は MCP ツールで成立させる。案内・instruction は引き続き Skill が担う（役割分担であって Skill の廃止ではない）
