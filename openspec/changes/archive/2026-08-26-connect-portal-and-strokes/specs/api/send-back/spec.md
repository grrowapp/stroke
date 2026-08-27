## REMOVED Requirements

### Requirement: 差し戻しを受理して記録する

**Reason**: capability を endpoint 単位に分割し、ユーザー側の口を `api/session/*` に集める（承認済み requirements 2026-08-25）。path は `/api/sessions/:id/send-back` に変わる。
**Migration**: `api/session/send-back` の「U9 POST /api/sessions/:id/send-back — 差し戻しを受理して記録する」が引き継ぐ。

### Requirement: 差し戻しは同じ内容を複数の形で AI へ渡るよう整える

**Reason**: capability の分割。整えは受理の口の要件として持つ。
**Migration**: `api/session/send-back` の同名要件が引き継ぐ。

### Requirement: 差し戻しに対応方法を指示しない

**Reason**: capability の分割。
**Migration**: `api/session/send-back` の同名要件が引き継ぐ。
