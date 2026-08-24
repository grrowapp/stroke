# proposal-review Delta

## MODIFIED Requirements

### Requirement: 差し戻すと proposal が出し直される

システムは積まれた指摘を1回の差し戻しとして送り、出し直された proposal で表示を更新する SHALL。差し戻しの受理と AI へ渡る内容の用意は `api/send-back` が、AI の起動は `api/invoke-agent` が規定する。

#### Scenario: 指摘を積んで差し戻す

- **WHEN** ユーザーが1件以上の指摘を積んで差し戻す
- **THEN** システムは全ての指摘を1回の差し戻しとして送り、出し直された proposal で表示を更新する。phase は `proposed` のまま変わらない

#### Scenario: 指摘が1件も無いまま差し戻す

- **WHEN** 指摘が1件も積まれていない状態で差し戻し操作が行われる
- **THEN** システムは差し戻さず、指摘が必要であることとその付け方を示す

#### Scenario: 差し戻した後

- **WHEN** 差し戻しが送られる
- **THEN** 積まれていた指摘は消え、更新された proposal に対して新しく積み直せる

#### Scenario: 何度でも差し戻す

- **WHEN** ユーザーが更新された proposal に対してさらに差し戻す
- **THEN** 回数の上限なく同じ手順で差し戻せる

## REMOVED Requirements

### Requirement: 差し戻しは同じ内容を複数の形で AI へ渡す

**Reason**: 差し戻しの受理挙動として `api/send-back` へ移した。規定の内容（4つの形・対応方法を指示しない制限）は変えず、2つの Requirement に分けて移設した。
**Migration**: `specs/api/send-back` の Requirement「差し戻しは同じ内容を複数の形で AI へ渡るよう整える」および「差し戻しに対応方法を指示しない」を参照。
