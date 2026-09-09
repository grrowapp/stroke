# specs/agent-api — delta

## REMOVED Requirements

### Requirement: リクエストはセッション id を指定して行う

**Reason**: capability の畳み込み（承認済み requirements 2026-08-25）。
**Migration**: `api/stroke` の同名要件が引き継ぐ。

### Requirement: 入力は取得の endpoint で読める

**Reason**: capability の畳み込み。
**Migration**: `api/stroke` の同名要件が引き継ぐ。

### Requirement: 問いの提出を受ける endpoint を公開する

**Reason**: capability の畳み込み。
**Migration**: `api/stroke` の同名要件が引き継ぐ。

### Requirement: proposal の提出を受ける endpoint を公開する

**Reason**: capability の畳み込み。受理した proposal をサーバーがファイルへ保存する挙動は廃止される。
**Migration**: `api/stroke` の同名要件が引き継ぐ。ファイルは AI 自身が `docs/proposal.md` に書く（`project/generation`）。

### Requirement: 承認後のセッションは提出を受け付けない

**Reason**: capability の畳み込み。
**Migration**: `api/stroke` の同名要件が引き継ぐ。
