## REMOVED Requirements

### Requirement: proposal を Markdown プレビューで示す

**Reason**: capability の畳み込み（承認済み requirements 2026-08-25）。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: proposal の見せ方を切り替えられる

**Reason**: capability の畳み込み。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: 指摘は proposal の本文に紐づけて積める

**Reason**: capability の畳み込み。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: 積んだ指摘を見直し、直し、取り消せる

**Reason**: capability の畳み込み。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: 差し戻すと proposal が出し直される

**Reason**: capability の畳み込み。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: 差し戻しの応答待ちは修正中と分かる待ち受け画面で示す

**Reason**: capability の畳み込み。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: 差し戻しに対して AI が問い返せる

**Reason**: capability の畳み込み。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: 問い返しは1問1答を繰り返す

**Reason**: capability の畳み込み。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: プロジェクト名を提案し、ユーザーが確定する

**Reason**: capability の畳み込み。生成の失敗は昇格の失敗として `project/generation` が扱う。
**Migration**: `stroke/frontier` の同名要件が引き継ぐ。

### Requirement: 承認はプロジェクト生成の唯一の引き金

**Reason**: capability の畳み込み。プロジェクトの作り方が rename 昇格に変わる。
**Migration**: `stroke/frontier` の「承認はプロジェクト昇格の唯一の引き金」が引き継ぐ。

### Requirement: 承認後は承認と差し戻しを提供しない

**Reason**: 承認がセッションディレクトリの改名による昇格になり、承認後のセッションは同じ id では存在しなくなった。「phase が `approved` のセッションで画面2を開く」という状態が起こらない。
**Migration**: `stroke/frontier` の「承認の成功で画面2を離れてプロジェクト一覧へ戻る」が引き継ぐ。
