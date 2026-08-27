## ADDED Requirements

### Requirement: 承認後の steering の起動は proposal の在り処を伝える

システムは、承認で昇格した直後に steering 文書を作らせるために AI へ渡す定型に、proposal のファイルの在り処を含める SHALL。在り処はプロジェクトのルートからの相対位置で示す。

steering の起動で AI に与えるツールには、ファイルを探す手段（一覧・検索）を含めない。在り処が定型で示されなければ、AI は承認された proposal に辿り着けないまま steering を書き始めることになる。

在り処を含む定型そのものは設定値として外に出す（「定型は設定値として外に出す」に従う）。

#### Scenario: steering の起動で定型が渡る

- **WHEN** 承認で昇格した直後に steering の起動が起こる
- **THEN** AI へ渡される定型に、proposal のファイルの在り処が含まれている

#### Scenario: AI が proposal を読む

- **WHEN** steering の起動を受けた AI が、定型で示された在り処のファイルを読む
- **THEN** 承認された proposal の全文が読める
