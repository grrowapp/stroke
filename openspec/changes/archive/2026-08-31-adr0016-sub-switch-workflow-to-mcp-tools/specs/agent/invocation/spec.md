# agent/invocation Delta

## REMOVED Requirements

### Requirement: AI は実際のスキルとして走る

**Reason**: 成り立たなくなった。`provide-operations-via-mcp` が `--add-dir` を丸ごと外したので、`grilling` も `domain-modeling` も**ロードされない**。作業場所はセッションの cwd だけで、そこに `.claude/` は無い。実運用ログの `slash_commands` 67件にも1件も現れない（実測 2026-08-30）。要件として残すと、次の担当者は「ロードされているはず」を前提に読む。

**Migration**: 下の ADDED「AI は手順を MCP ツールから受け取って走る」が引き継ぐ。「振る舞いを補うための追加指示をプロンプトに入れない」の趣旨はそちらでも守る——手順の本文は prompt ではなくツールが返す。

## ADDED Requirements

### Requirement: AI は手順を MCP ツールから受け取って走る

システムは、工程の手順を MCP ツール（flontier は `get-guide`、steering は `get-steering-guide`）として渡す SHALL。手順の本文を prompt に載せてはならない（MUST NOT）。prompt が指してよいのは、**実在するツールの名前**だけである。

実体の無いスラッシュコマンドを prompt の先頭に置いてはならない（MUST NOT）。`claude -p` は `Unknown command` で起動を終え、assistant のターンをひとつも持たない（実測 2026-08-27 の `/openspec-ff-change`、2026-08-30 の `/write-steering-v2`）。

#### Scenario: ストロークを実行する

- **WHEN** システムが AI を呼んで次の問いを得る
- **THEN** 手順は `get-guide` の結果として渡っており、prompt には手順の本文が入っていない

#### Scenario: 差し戻しを渡す

- **WHEN** システムが差し戻しの指摘を AI に渡す
- **THEN** 指摘のほかに対応方法を指示する文言は渡されない

#### Scenario: 指す先が実在する

- **WHEN** prompt が操作または手順の入口を名前で指す
- **THEN** その名前は起動時に公開される MCP ツールの一覧に在る

## MODIFIED Requirements

### Requirement: 起動設定は再ビルドなしで変更できる

AI の起動フラグは設定値として外に出す SHALL。既定値は `--setting-sources project` と `--strict-mcp-config` を含む（docs/adr/0001-claude-p-invocation.md）。

`--add-dir` は既定値に**含まない**（MUST NOT）。渡すとリポジトリ配下がまるごと作業場所になり、デバッグログに残る他人のセッションの全文と、`.claude/settings.json` 経由の開発者権限が届く（実測 2026-08-30）。作業場所はその実行の対象（セッションのディレクトリ、または昇格先のプロジェクト）だけとする。

呼び出し側は、引いた起動フラグをそのまま渡すか、その実行に要るフラグを足して渡す SHALL。足すことができるのは呼び出し側だけで、起動処理は渡されたフラグを解釈・補正してはならない（MUST NOT）。

#### Scenario: 起動フラグを変更する

- **WHEN** 運用者が設定値の起動フラグを変更する
- **THEN** 再ビルドなしに、次回の呼び出しから新しい値が使われる

#### Scenario: 既定の設定で実行する

- **WHEN** 既定の設定で AI を呼ぶ
- **THEN** 開発者個人の設定（`~/.claude/CLAUDE.md`・個人の MCP 設定）はセッションに適用されない

#### Scenario: 対象の外へ出られない

- **WHEN** 既定の設定で AI を呼ぶ
- **THEN** その実行が読み書きできるのは渡された cwd の配下だけで、リポジトリの他のセッションのログには届かない

#### Scenario: 呼び出し側がフラグを足す

- **WHEN** 呼び出し側が設定値の起動フラグに、その実行に要るフラグを足して渡す
- **THEN** 起動には設定値のフラグと足されたフラグの両方が使われる
