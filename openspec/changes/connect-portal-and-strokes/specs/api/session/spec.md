## REMOVED Requirements

### Requirement: セッションを消す endpoint を1つ公開する

**Reason**: capability を endpoint 単位に分割する（承認済み requirements 2026-08-25）。削除の口は `api/session/delete` になる。
**Migration**: `api/session/delete` の「U11 DELETE /api/sessions/:id — セッションを消す」が引き継ぐ。

### Requirement: 実行中の呼び出しを持つセッションの削除は受理しない

**Reason**: capability の分割。busy 中の削除拒否は削除の口の要件として持つ。
**Migration**: `api/session/delete` の busy 拒否の要件が引き継ぐ。

### Requirement: 残っているセッションを一覧する endpoint を1つ公開する

**Reason**: capability の分割。一覧の口は `api/session/list` になり、応答の各件に path と `invocation` が加わる。
**Migration**: `api/session/list` の「U12 GET /api/sessions — 残っているセッションを一覧する」が引き継ぐ。
