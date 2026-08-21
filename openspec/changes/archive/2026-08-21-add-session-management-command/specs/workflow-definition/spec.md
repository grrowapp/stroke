# workflow-definition Delta

## ADDED Requirements

### Requirement: ワークフロー参照は登録簿に依存しない

セッションのワークフロー参照（change の作成・instructions の取得）は、マシン共有の登録簿（store）を参照せずに成立する SHALL。セッションは、claude プロセスが呼び出し時の cwd から解決できる自前の openspec ルートを持つ SHALL。

#### Scenario: 登録なしで動く

- **WHEN** store が1つも登録されていないマシンでセッションを作成し、ストロークの呼び出しが起こる
- **THEN** ワークフロー定義が読まれ、呼び出しは成立する

#### Scenario: 残置登録の影響を受けない

- **WHEN** 登録簿に別のワークツリーを指す登録が残っている状態でセッションの呼び出しが起こる
- **THEN** 読まれる定義はセッションの openspec ルートから解決されたものであり、登録簿の内容は参照されない
