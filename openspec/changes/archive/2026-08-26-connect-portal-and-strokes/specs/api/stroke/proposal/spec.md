## Purpose

エージェントが proposal の全文を提出する endpoint（A7）を規定する。ユーザーに表示するための本文とプロジェクト名の候補の受け取りを担う。

## ADDED Requirements

### Requirement: A7 POST /api/strokes/:id/proposal — proposal の提出を受ける

システムは `POST /api/strokes/:id/proposal` を公開する SHALL。エージェントは proposal の全文を提出し、`projectName`（kebab-case のプロジェクト名の提案）を添えられる。名前の確定はユーザーの決定であり、`projectName` は画面2に当てる候補にすぎない。

添えられた `projectName` が kebab-case でない場合、システムはその名前を候補として採用してはならない（MUST NOT）が、proposal 自体の受理は妨げない。本文が空または空白のみの提出は受理せず、エラーを返す SHALL。存在しないセッション id への提出は受理せず、エラーを返す SHALL。

#### Scenario: proposal を提出する

- **WHEN** エージェントが proposal の全文を `POST /api/strokes/:id/proposal` へ提出する
- **THEN** システムはそれを受け取り、ユーザーに proposal として表示する

#### Scenario: プロジェクト名の提案を添える

- **WHEN** 提出に kebab-case の `projectName` が添えられている
- **THEN** システムはそれを、ユーザーが画面2で編集して確定する候補として受け取る

#### Scenario: kebab-case でない projectName を添える

- **WHEN** 添えられた `projectName` が kebab-case でない
- **THEN** システムはその名前を候補として採用しない。proposal 自体の受理は妨げない

#### Scenario: 存在しないセッション id で提出する

- **WHEN** 存在しないセッション id に proposal が提出される
- **THEN** システムは受理せず、エラーを返す

#### Scenario: 本文が空の proposal を提出する

- **WHEN** 提出された proposal の本文が空または空白のみである
- **THEN** システムは提出を受理せず、エラーを返す
