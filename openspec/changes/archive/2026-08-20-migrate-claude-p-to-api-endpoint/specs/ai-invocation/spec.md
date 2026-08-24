# ai-invocation Delta Specification

## ADDED Requirements

### Requirement: 起動後タイムアウト時間内に提出が無ければ失敗として扱う

システムは `claude -p` の起動後、タイムアウト時間以内に endpoint への提出が無い場合、その呼び出しを失敗として扱う SHALL。タイムアウト時間は設定値とする。

#### Scenario: タイムアウト時間を過ぎても提出が無い

- **GIVEN** タイムアウト時間が設定されている
- **WHEN** 起動後、その時間を過ぎても endpoint への提出が無い
- **THEN** システムはその呼び出しを失敗として扱う

## REMOVED Requirements

### Requirement: 問いは規定の構造で返す

**Reason**: 問いの構造とその検証は agent-api の「問いの提出を受ける endpoint を公開する」が規定する。この capability に残すと同じ規定が二重になる。
**Migration**: agent-api の「問いの提出を受ける endpoint を公開する」に従う。

### Requirement: CLI のセッションログに触れない

**Reason**: 外からの刺激に対する振る舞いではなく、実装への制約。Requirement として置く内容ではない。
**Migration**: 制約として本 change の design.md に記載する。
