## MODIFIED Requirements

### Requirement: proposal の提出を受ける endpoint を公開する

システムはエージェントが proposal の全文を提出する endpoint を公開する SHALL。提出には `projectName`（kebab-case のプロジェクト名の提案）を添えられる。名前の確定はユーザーの決定であり、`projectName` は画面2に当てる候補にすぎない。

システムは受理した proposal の全文を、セッションディレクトリの `docs/proposal.md` へ保存する SHALL。差し戻し後の再提出も同じ場所へ上書きし、常に最新の1つだけが在る状態にする。保存先のディレクトリが無ければ作る SHALL。

システムは、保存できなかった提出を受理してはならない（MUST NOT）。保存に失敗した場合は phase を進めず、ユーザーへの配信も行わず、失敗をエージェントへ返す。proposal が保存されないまま「提出済み」になる状態を作らない。

#### Scenario: proposal を提出する

- **WHEN** エージェントが proposal の全文を endpoint へ提出する
- **THEN** システムはそれを受け取り、セッションディレクトリの `docs/proposal.md` へ全文を保存し、ユーザーに proposal として表示する

#### Scenario: 保存先のディレクトリがまだ無い

- **WHEN** セッションディレクトリに `docs` がまだ無い状態で proposal が提出される
- **THEN** システムは `docs` を作った上で `docs/proposal.md` を保存する

#### Scenario: 差し戻しの後に出し直す

- **WHEN** 差し戻しを受けたエージェントが proposal を再提出する
- **THEN** `docs/proposal.md` は新しい全文で置き換わり、前の版は残らない

#### Scenario: 保存に失敗する

- **WHEN** 受理した proposal を保存できない
- **THEN** システムは提出を受理せず、phase を進めず、失敗をエージェントへ返す

#### Scenario: 保存された proposal を後から読む

- **WHEN** 提出の後に、画面が改めて現在の proposal を求める
- **THEN** システムは保存された `docs/proposal.md` の内容を返す

#### Scenario: プロジェクト名の提案を添える

- **WHEN** 提出に kebab-case の `projectName` が添えられている
- **THEN** システムはそれを、ユーザーが画面2で編集して確定する候補として受け取る

#### Scenario: kebab-case でない projectName を添える

- **WHEN** 添えられた `projectName` が kebab-case でない
- **THEN** システムはその名前を候補として採用しない。proposal 自体の受理は妨げない

#### Scenario: 本文が空の proposal を提出する

- **WHEN** 提出された proposal の本文が空または空白のみである
- **THEN** システムは提出を受理せず、エラーを返す
