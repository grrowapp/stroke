## REMOVED Requirements

### Requirement: 回答を受理して記録する

**Reason**: capability を endpoint 単位に分割し、ユーザー側の口を `api/session/*` に集める（承認済み requirements 2026-08-25）。path は `/api/sessions/:id/answer` に変わる。
**Migration**: `api/session/answer` の「U7 POST /api/sessions/:id/answer — 回答を受理して記録する」が引き継ぐ。
