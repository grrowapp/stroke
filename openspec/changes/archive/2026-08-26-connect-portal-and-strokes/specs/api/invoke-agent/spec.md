## REMOVED Requirements

### Requirement: AI の起動を受け付ける endpoint を1つ公開する

**Reason**: capability を endpoint 単位に分割する（承認済み requirements 2026-08-25）。path は `/api/sessions/:id/invoke-agent` に変わり、起動要求は cwd を引数で受け取る形になる。
**Migration**: `api/session/invoke-agent` の「U13 GET /api/sessions/:id/invoke-agent — AI の起動を受け付ける」が引き継ぐ。

### Requirement: 同一セッションの多重起動を受け付けない

**Reason**: capability の分割。
**Migration**: `api/session/invoke-agent` の「同一対象の多重起動を受け付けない」が引き継ぐ。

### Requirement: 承認後のセッションへの起動は受け付けない

**Reason**: 承認済みセッションは昇格で id ごと消え、「phase が `approved` のセッション」への起動要求という状態が無くなった。昇格後のプロジェクトへの起動は次工程のために通す必要がある。
**Migration**: 昇格後の起動は `api/session/invoke-agent` の「昇格したプロジェクトに起動を要求する」のシナリオが扱う。

### Requirement: 前提が欠けている間は起動を受け付けない

**Reason**: capability の分割。
**Migration**: `api/session/invoke-agent` の同名要件が引き継ぐ。
