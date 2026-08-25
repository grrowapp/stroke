## REMOVED Requirements

### Requirement: リクエストはセッション id を指定して行う

**Reason**: capability を endpoint 単位に分割する（承認済み requirements 2026-08-25）。横断の規定は各 endpoint の spec が個別に持つ。
**Migration**: `api/stroke/overview`・`api/stroke/send-back`・`api/stroke/question`・`api/stroke/proposal`・`api/stroke/submission` の各 spec が、存在しないセッション id の拒否を個別に規定する。

### Requirement: 入力は取得の endpoint で読める

**Reason**: capability の分割。取得の口は入力の種類ごとの capability になる。
**Migration**: 概要の取得は `api/stroke/overview`（A1）、差し戻しの指摘一式の取得は `api/stroke/send-back`（A4）が引き継ぐ。

### Requirement: 問いの提出を受ける endpoint を公開する

**Reason**: capability の分割。
**Migration**: `api/stroke/question` の「A5 POST /api/strokes/:id/question — 問いの提出を受ける」が引き継ぐ。

### Requirement: proposal の提出を受ける endpoint を公開する

**Reason**: capability の分割。受理した proposal をサーバーがファイルへ保存する挙動は廃止される。
**Migration**: `api/stroke/proposal` の「A7 POST /api/strokes/:id/proposal — proposal の提出を受ける」が引き継ぐ。ファイルは AI 自身が `docs/proposal.md` に書く（`project/generation`）。

### Requirement: 承認後のセッションは提出を受け付けない

**Reason**: capability の分割。承認後の提出拒否は提出の口ごとの要件として持つ。
**Migration**: `api/stroke/question` の「承認後のセッションは問いの提出を受け付けない」と `api/stroke/proposal` の「承認後のセッションは proposal の提出を受け付けない」が引き継ぐ。
