# mcp/server Delta

## MODIFIED Requirements

### Requirement: 接続には工程で使うツールだけを見せる

ひとつの接続に公開するツールは、その起動の工程で使うものだけとする SHALL。flontier 工程は `get-guide` / `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document`、steering 工程は `get-steering-guide` / `get-steering` / `submit-document` とする SHALL。工程で使わないツールを、その接続のツール一覧に出してはならない（MUST NOT）。

**工程の案内は工程ごとに別のツールとする SHALL。** 1本のツールが接続の工程を見分けて本文を出し分けてはならない（MUST NOT）——それはツールの側で工程を判定する形であり、下の絞りの規定と矛盾する。

絞りは起動側が接続ごとに指定する SHALL——ツールの側で工程を判定して拒否する形にしてはならない（MUST NOT）。呼べないものを見せてから失敗させると、呼び手は失敗するまで判別できない。

#### Scenario: flontier 工程に steering のツールが見えない

- **GIVEN** flontier 工程の claude が起動している
- **WHEN** その接続でツールの一覧を取る
- **THEN** `get-steering` も `get-steering-guide` も一覧に無い

#### Scenario: steering 工程に flontier 専用のツールが見えない

- **GIVEN** steering 工程の claude が起動している
- **WHEN** その接続でツールの一覧を取る
- **THEN** `get-guide` / `get-overview` / `get-strokes` / `get-send-back` / `send-question` がいずれも一覧に無い

#### Scenario: 文書の提出は両工程に見える

- **GIVEN** flontier 工程と steering 工程の claude がそれぞれ起動している
- **WHEN** それぞれの接続でツールの一覧を取る
- **THEN** どちらの一覧にも `submit-document` がある

#### Scenario: 工程の案内が同じ工程にだけ見える

- **GIVEN** steering 工程の接続で `/mcp` に繋いでいる
- **WHEN** ツールの一覧を取る
- **THEN** `get-steering-guide` が現れ、`get-guide` は現れない
