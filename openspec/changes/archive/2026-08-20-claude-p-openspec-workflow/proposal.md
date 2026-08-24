# claude-p-openspec-workflow

## Why

セッションを進める claude プロセスへの指示は、コード内の固定テンプレート（`server/utils/prompt.ts`）に直書きされており、ワークフローの段構成や指示内容を変えるにはコードの変更が要る。openspec には schema.yaml / config.yaml / template 群からワークフローを定義し、各段の instructions を生成する機構が既にある。指示の置き場所をここへ移せば、openspec のルールに沿ったワークフローカスタマイズが、コードに手を入れずに定義ファイルの編集だけで実現できる。

## What Changes

- openspec のカスタムスキーマ機構で、セッション専用のワークフローを定義する。artifact は **stroke → proposal** の2本とし、schema.yaml / config.yaml / template 群で構成する
- 各 artifact の instruction は openspec 方式（schema の instruction / template）で持ち、「何をするか」の案内中心とする。`grilling` / `domain-modeling` の呼び出しの指示もこの instruction 内にインクルードし、prompt には載せない
- agent-api との受け渡し（取得・提出の URL・JSON の組み立て）は、新設するセッション API スキル群（get-overview / get-strokes / get-send-back / question / proposal / guidance）に出す。instruction はスキルの呼び出しで流れを示す
- claude プロセスへ渡す prompt は、コマンド／スキルの実行指示（例: `claude -p "/opsx:proposal <引数>"`）と最低限の固定指示のみの固定文とする。動的値は prompt に載せない（セッション id は cwd／`${CLAUDE_SESSION_ID}`、接続先は spawn 時の環境変数で届く）。ワークフローの指示本文も prompt に載せず、claude プロセスがワークフロー定義から自分で取得して従う
- ワークフローの変更（段の追加・指示の修正・テンプレートの差し替え）は、openspec のルールに沿った定義ファイルの編集だけで次回の呼び出しから反映され、コード変更を要しない

**進行中 change との関係**: `migrate-claude-p-to-api-endpoint` が「prompt を固定テンプレート化し、差し込みはセッション URL の1点のみ」と規定している。本 change はその固定テンプレートの置き場所をコードから openspec スキーマへ移すものであり、agent-api での受け渡し・起動方式・リトライ規定は覆さない。prompt の形は「指示全文の固定テンプレート」から「コマンド実行指示＋動的値の添え書き」へ変わるが、ユーザー入力を埋め込まない原則と、差し込みをシステム側の動的値に限る趣旨は維持する。

**確定済み決定との関係**: `.scratch/stroke-board-frontier/decisions.md` の「grilling と domain-modeling を模倣せず、実際のスキルとして走らせる」は維持する。スキーマに載せる instruction は現行の指示の転記であり、振る舞いを補う指示を足さない（specs/ai-invocation）。

## Capabilities

### New Capabilities

- `workflow-definition`: セッションを進めるワークフローを openspec の schema.yaml / config.yaml / template 群による定義ファイルとして持ち、その変更がコード変更・再ビルドなしで次回の呼び出しから反映される規定。定義の構成（stroke → proposal の2段、instruction の内容、claude プロセスへの供給方法）は観測可能な振る舞いではないため design で扱う

### Modified Capabilities

なし。prompt の構成（コマンド／スキルの実行指示＋動的値のみ）は AI の観測可能な振る舞いを変えない実装の制約であり、spec ではなく本 change の design.md で規定する。`ai-invocation` の既存要件（スキルとして走らせる・リトライ・起動設定の外出し）は変えない。

## Impact

- `openspec/schemas/` 配下（またはセッション側の解決元）— 専用スキーマの新設（schema.yaml と stroke / proposal のテンプレート）
- `assets/.claude/skills/` — セッション API スキル群の新設（agent-api との受け渡しを担う）
- config.yaml — セッションワークフロー用の context・rules の記載
- `server/utils/prompt.ts` — コマンド実行指示＋動的値の添え書きの組み立てへの置換
- `server/utils/ai.ts` / `claude-config.ts` — 実行するコマンドの指定、spawn 時の環境変数（接続先）、claude プロセスからワークフロー定義が見える実行構成（`--add-dir` 等。確定は design）
- 進行中 change `migrate-claude-p-to-api-endpoint` — prompt 規定が重なるため、先行の実装状況と突き合わせて進める
