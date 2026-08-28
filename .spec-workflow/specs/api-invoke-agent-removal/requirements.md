# specs/api/invoke-agent — delta

## REMOVED Requirements

### Requirement: AI の起動を受け付ける endpoint を1つ公開する

**Reason**: capability の畳み込み（承認済み requirements 2026-08-25）。起動要求が cwd を引数で受け取る形に変わる。
**Migration**: `api/session` の同名要件が引き継ぐ。

### Requirement: 同一セッションの多重起動を受け付けない

**Reason**: capability の畳み込み。
**Migration**: `api/session` の「同一対象の多重起動を受け付けない」が引き継ぐ。

### Requirement: 承認後のセッションへの起動は受け付けない

**Reason**: 承認済みセッションは昇格で id ごと消え、「phase が `approved` のセッション」への起動要求という状態が無くなった。昇格後のプロジェクトへの起動は次工程のために通す必要がある。
**Migration**: 昇格後の起動は `api/session` の「AI の起動を受け付ける endpoint」（昇格したプロジェクトへの起動のシナリオ）が扱う。

### Requirement: 前提が欠けている間は起動を受け付けない

**Reason**: capability の畳み込み。
**Migration**: `api/session` の同名要件が引き継ぐ。
