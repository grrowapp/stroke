## REMOVED Requirements

### Requirement: 概要の投稿を受理してセッションを作る

**Reason**: capability を endpoint 単位に分割し、ユーザー側の口を `api/session/*` に集める（承認済み requirements 2026-08-25）。path は `/api/sessions` に変わる。
**Migration**: `api/session/overview` の「U1 POST /api/sessions — 概要の投稿を受理してセッションを作る」が引き継ぐ。
