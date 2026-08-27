# mcp/tools/submit Delta

## Purpose

文書の提出の一本口となるツール（`submit-document`）の契約を定める。どこへの提出かは引数の種別で決まる。

## ADDED Requirements

### Requirement: 文書を種別の引数で提出する

ツールの引数は、提出の種別（flontier / steering）と文書の文章とする SHALL。種別が steering の場合は文書名（product / tech / structure）を併せて取る SHALL。

提出先の振り分けは引数だけで決まる SHALL。引数に現れない内部状態を見て振り分けや可否を変えてはならない（MUST NOT）（docs/adr/0013 の原則に整合する）。ツール側で文章の検証を行って提出を止めてはならない（MUST NOT）——検証の正は提出先にある。結果は `mcp/server` の形式（status / errorCode）に従う SHALL。失敗は種別によらずすべてこのエラー形式で返り、本家 dashboard に到達できない場合の errorCode は `unreachable` とする SHALL。

#### Scenario: proposal の提出が画面に反映される

- **GIVEN** 対象のセッションで stroke が把握完了した
- **WHEN** claude が種別 flontier で proposal の文章を提出する
- **THEN** proposal 確認画面（`/strokes/<セッション id>/proposal`）に提出された文章が表示される（検証側がブラウザで開いて確かめる）

#### Scenario: steering 文書の提出が本家に反映される

- **GIVEN** 本家の dashboard が起動済みで、対象のプロジェクトの steering 工程が開始されている
- **WHEN** claude が種別 steering・文書名 product で文章を提出する
- **THEN** 本家 `GET /api/projects/:projectId/steering/product` の応答が、提出された文章と一致する（検証側が突き合わせる）

#### Scenario: 本家が停止中の提出はエラーになる

- **GIVEN** 対象のプロジェクトの steering 工程が開始された後、本家の dashboard が停止している
- **WHEN** claude が種別 steering で文章を提出する
- **THEN** 結果はエラーで、status と `errorCode: unreachable` を持つ
