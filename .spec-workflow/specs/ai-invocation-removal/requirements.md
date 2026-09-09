# specs/ai-invocation — delta

## REMOVED Requirements

### Requirement: AI は実際のスキルとして走る

**Reason**: capability の畳み込み（承認済み requirements 2026-08-25）。
**Migration**: `agent/invocation` の同名要件が引き継ぐ。

### Requirement: 起動設定は再ビルドなしで変更できる

**Reason**: capability の畳み込み。呼び出し側がフラグを足せる形に広がる。
**Migration**: `agent/invocation` の同名要件が引き継ぐ。

### Requirement: 同一セッションの往復は会話として継続する

**Reason**: capability の畳み込み。
**Migration**: `agent/invocation` の同名要件が引き継ぐ。

### Requirement: 失敗はサーバ側でリトライし、ユーザーに見せない

**Reason**: capability の畳み込み。
**Migration**: `agent/invocation` の同名要件が引き継ぐ。

### Requirement: リトライで入力を再送しない

**Reason**: capability の畳み込み。
**Migration**: `agent/invocation` の同名要件が引き継ぐ。

### Requirement: リトライしても進めない場合だけエラーを表示する

**Reason**: リトライの扱いが「`failed` の記録→巡回の再キック→上限到達で `error` 終端→ユーザーに引き渡す」へ変わった。
**Migration**: `agent/invocation` の「リトライ上限に達したら error に変える」と `portal/batch` が引き継ぐ。

### Requirement: 起動後タイムアウト時間内に提出が無ければ失敗として扱う

**Reason**: 完了の判定が「endpoint への提出」から「invokeAi による output stream の検知」に変わった。
**Migration**: `agent/invocation` の「完了は output stream で検知して idle に変える」「タイムアウトで failed に変える」が引き継ぐ。

### Requirement: 初回か継続かはセッション一覧との符合から導く

**Reason**: capability の畳み込み。定型の候補を呼び出し側から受け取る形に変わる。
**Migration**: `agent/invocation` の同名要件が引き継ぐ。

### Requirement: 定型は設定値として外に出す

**Reason**: capability の畳み込み。定型を引くのが呼び出し側になる。
**Migration**: `agent/invocation` の同名要件が引き継ぐ。
