## REMOVED Requirements

### Requirement: 下層は4つの画面を持つ

**Reason**: capability を `project/` 名前空間へ揃える。承認画面に差し戻しと注釈が入る構造変更にあわせて、下層の画面仕様を `project/ui` として立て直す。
**Migration**: `project/ui` の同名要件が引き継ぐ。

### Requirement: 下層のナビゲーションは上層と形を変える

**Reason**: capability を `project/ui` へ移す。
**Migration**: `project/ui` の同名要件が引き継ぐ。

### Requirement: 下層から上層へ戻る導線を持つ

**Reason**: capability を `project/ui` へ移す。
**Migration**: `project/ui` の同名要件が引き継ぐ。

### Requirement: 下層は今いるプロジェクトを示す

**Reason**: capability を `project/ui` へ移す。
**Migration**: `project/ui` の同名要件が引き継ぐ。

### Requirement: 通知の対象を下層の画面で開く

**Reason**: capability を `project/ui` へ移す。
**Migration**: `project/ui` の同名要件が引き継ぐ。

### Requirement: 対象が既に存在しない場合を示す

**Reason**: capability を `project/ui` へ移す。
**Migration**: `project/ui` の同名要件が引き継ぐ。

### Requirement: 下層で状態を変えられるのは承認への応答だけ

**Reason**: capability を `project/ui` へ移すとともに、差し戻し（`needs-revision`）を持たないという規定を撤回する。本家の差し戻しは注釈コメントを前提にした流れで、その注釈をこの change で持つようになったため。
**Migration**: `project/ui` の同名要件が引き継ぐ。差し戻しは注釈コメントを運ぶ操作として加わり、注釈を承認・却下に付けて送ることは禁じる。

### Requirement: 本家が停止している間の下層を示す

**Reason**: capability を `project/ui` へ移す。
**Migration**: `project/ui` の同名要件が引き継ぐ。
