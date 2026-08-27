## Purpose

openspec の `openspec/specs/` 配下のパス（階層あり）と、本家 `.spec-workflow/specs/` 直下のディレクトリ名 = **spec 名**（本家の制約によりフラット）を対応付ける命名の規約と変換ルール。作成（`create-feature`）と sync はこの1つの規約に従う。

## ADDED Requirements

### Requirement: spec 名は openspec 側のパスの `__` 連結である

feature の spec 名は、openspec 側の対応するパス（`openspec/specs/` からの相対）のセグメントを `__`（2重アンダーバー）で連結したフラット名である SHALL。パスから spec 名へ、spec 名からパスへの両方向の変換が定まる SHALL。

#### Scenario: パスから spec 名へ

- **WHEN** `openspec/specs/api/session/` に対応する spec 名を求める
- **THEN** `.spec-workflow/specs/api__session/` になる

#### Scenario: spec 名からパスへ

- **WHEN** `.spec-workflow/specs/api__session/` に対応する openspec 側のパスを求める
- **THEN** `openspec/specs/api/session/` になる

#### Scenario: 階層を持たない場合

- **WHEN** `openspec/specs/portal/` に対応する spec 名を求める
- **THEN** `.spec-workflow/specs/portal/` になる（名前はそのまま）

### Requirement: セグメントはアンダースコアを含まない kebab-case である

パスの各セグメント（ディレクトリ名）は kebab-case（英小文字・数字・ハイフン）である SHALL。セグメントはアンダースコアを含んではならない MUST NOT。これにより spec 名の中の `__` は常に区切りとしてのみ現れ、変換は可逆になる。

#### Scenario: 規約に適合しないセグメント

- **WHEN** セグメント `api_v2` を規約に照らす
- **THEN** アンダースコアを含むため適合しない

#### Scenario: 変換の可逆性

- **WHEN** 規約に適合するパスを spec 名に変換し、その spec 名をパスに戻す
- **THEN** 元のパスに一致する

### Requirement: パスと spec 名は1対1に対応する

openspec 側のパスと spec 名は1対1に対応する SHALL。同名の feature は存在しない。

#### Scenario: 対応先はただ1つ

- **WHEN** `.spec-workflow/specs/api__session/` の対応先を求める
- **THEN** `openspec/specs/api/session/` ただ1つに定まる
