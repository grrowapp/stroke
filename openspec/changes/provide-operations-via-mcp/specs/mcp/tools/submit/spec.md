# mcp/tools/submit Delta

## Purpose

文書の提出の一本口となるツールの契約を定める。どこへの提出かは引数の種別で決まる。

## ADDED Requirements

### Requirement: 文書を種別の引数で提出する

ツールの引数は、提出の種別（flontier / steering）と文書の文章とする SHALL。種別が steering の場合は文書名（product / tech / structure）を併せて取る SHALL。

ツールは、種別が flontier の場合は文章を自セッションの proposal として提出し、種別が steering の場合は指定された文書名の steering 文書として書き込む SHALL。提出先の振り分けは引数だけで決まる SHALL。引数に現れない内部状態を見て振り分けや可否を変えてはならない（MUST NOT）（docs/adr/0013 の原則に整合する）。ツール側で文章の検証を行って提出を止めてはならない（MUST NOT）——検証の正は提出先にある。

結果は次のいずれか1つを返す SHALL。

- **受理**: 提出が受け付けられたこと
- **エラー**: ステータスとエラー内容
- **不達**: 提出先に到達できなかったこと

#### Scenario: proposal を提出する

- **GIVEN** 対象のセッションで stroke が把握完了した
- **WHEN** 種別に flontier を指定し、proposal の文章を渡してツールを実行し、受理を受領する
- **THEN** そのセッションの proposal 確認画面に、提出した文章が表示されていることが確認できる

#### Scenario: product の steering 文書を提出する

- **GIVEN** 対象のプロジェクトが存在する
- **WHEN** 種別に steering、文書名に product を指定し、文章を渡してツールを実行し、受理を受領する
- **THEN** steering の取得ツールで product を読み取ると、提出した文章が返る

#### Scenario: tech の steering 文書を提出する

- **GIVEN** 対象のプロジェクトが存在する
- **WHEN** 種別に steering、文書名に tech を指定し、文章を渡してツールを実行し、受理を受領する
- **THEN** steering の取得ツールで tech を読み取ると、提出した文章が返る

#### Scenario: structure の steering 文書を提出する

- **GIVEN** 対象のプロジェクトが存在する
- **WHEN** 種別に steering、文書名に structure を指定し、文章を渡してツールを実行し、受理を受領する
- **THEN** steering の取得ツールで structure を読み取ると、提出した文章が返る

#### Scenario: 提出先の検証に通らない

- **GIVEN** 対象のセッションで stroke が把握完了した
- **WHEN** 種別に flontier を指定し、提出先の検証に通らない文章で提出する
- **THEN** エラーが返り、ステータスとエラー内容を持つ

#### Scenario: 検証エラーの後に出し直す

- **GIVEN** 対象のセッションで stroke が把握完了し、直前の提出が検証エラーで受理されていない
- **WHEN** 内容を直した文章を同じツールで提出し、受理を受領する
- **THEN** そのセッションの proposal 確認画面に、提出した文章が表示されていることが確認できる

#### Scenario: 本家の dashboard が停止している

- **GIVEN** 対象のプロジェクトが存在し、本家の dashboard が停止している
- **WHEN** 種別に steering を指定して提出する
- **THEN** 不達が返る
