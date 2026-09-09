# specs/api/send-back — delta

## REMOVED Requirements

### Requirement: 差し戻しを受理して記録する

**Reason**: capability の畳み込み（承認済み requirements 2026-08-25）。ユーザー側の口は `api/session` に集める。
**Migration**: `api/session` の同名要件が引き継ぐ。

### Requirement: 差し戻しは同じ内容を複数の形で AI へ渡るよう整える

**Reason**: capability の畳み込み。
**Migration**: `api/session` の同名要件が引き継ぐ。

### Requirement: 差し戻しに対応方法を指示しない

**Reason**: capability の畳み込み。
**Migration**: `api/session` の同名要件が引き継ぐ。
