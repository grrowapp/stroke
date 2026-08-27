## Purpose

feature を構成する構造の定義。本家 `.spec-workflow/specs/` 上の器の形と、openspec 側に必ず存在する対応物（change・ticket）を定める。

## ADDED Requirements

### Requirement: feature は本家のフラットな器に置かれる

feature は `.spec-workflow/specs/<spec名>/` 直下の文書（proposal.md / requirements.md / design.md / tasks.md）で構成される SHALL。spec 名は `feature/naming` の規約に従う SHALL。本家が spec として扱うのは requirements / design / tasks の3文書のみであり、proposal.md は本家からは見えないが置いてあっても害はない。

#### Scenario: feature の器の形

- **WHEN** `openspec/specs/api/session/` に対応する feature が存在する
- **THEN** その文書は `.spec-workflow/specs/api__session/` 直下にある

### Requirement: 本家の specs 配下に入れ子ディレクトリを持たない

feature の器は `.spec-workflow/specs/` 配下の入れ子ディレクトリを持たない SHALL。入れ子は本家の一覧に現れず、本家のファイル監視が親 spec に存在しない文書の更新イベントを飛ばす（実測 2026-08-26、`docs/specs/reference/upstream-observations.md`）。

#### Scenario: 階層は入れ子ではなくフラット名で表れる

- **WHEN** 階層を持つ openspec 側のパス（例: `openspec/specs/api/session/`）に対応する feature が存在する
- **THEN** その器は入れ子ディレクトリではなく、`__` エンコードのフラット名の1ディレクトリである

### Requirement: feature には必ず対応する change が存在する

feature には必ず対応する change が `openspec/changes/` に存在する SHALL。feature の proposal / requirements / design / tasks は、change の成果物（proposal / spec / design / tasks）に対応する。

#### Scenario: change の存在

- **WHEN** feature `api__session` が存在する
- **THEN** 対応する change が `openspec/changes/` に存在する

### Requirement: change には ticket が存在する

change の中に作られる `.openspec.yaml` には概要の情報が入らないため、change には `openspec/tickets/<change名>.md` の **ticket** が存在する SHALL。ticket は起票時に作られ、一番初めに change が何を意図したものかの簡単な概要のみを持つ SHALL。起票の後に情報を書き足さない SHALL。

#### Scenario: ticket の置き場と名前

- **WHEN** change `add-session-api` が起票された
- **THEN** その概要は `openspec/tickets/add-session-api.md` にある

#### Scenario: ticket は起票の後に書き足されない

- **WHEN** change `add-session-api` の proposal で capability が確定した
- **THEN** `openspec/tickets/add-session-api.md` は起票時の概要のまま変わらない（capability 等の追記はされない）
