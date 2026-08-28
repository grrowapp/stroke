# specs/api/stroke — delta

## Purpose

エージェント（`claude -p`）とシステムの間のやり取りを担う API endpoint 群（A 系）を定める。エージェントが読む入力の取得口、エージェントが書く成果（問い・proposal）の提出口とそのスキーマ検証、および `invocation` の操作口がこの capability の責務である。agent-api を畳んだもの。

## ADDED Requirements

### Requirement: リクエストはセッション id を指定して行う

エージェントの取得と提出はセッション id を指定して行う SHALL。存在しないセッション id へのリクエストは受理しない。

#### Scenario: 存在するセッション id へリクエストする

- **WHEN** エージェントが存在するセッションの id を指定してリクエストする
- **THEN** システムはそのリクエストを受け付ける

#### Scenario: 存在しないセッション id へリクエストする

- **WHEN** エージェントが存在しないセッション id を指定してリクエストする
- **THEN** システムは受理せず、エラーを返す

### Requirement: 入力は取得の endpoint で読める

システムは、エージェントが読む入力——概要、済んだストロークの記録（末尾が直前の回答）、差し戻しの指摘一式——を取得する endpoint を、入力の種類ごとに公開する SHALL。取得は保存済みのものを返すだけで、状況による判定を行わない。

#### Scenario: 保存済みの入力を取得する

- **WHEN** エージェントが、保存済みの入力を取得する
- **THEN** システムはその内容を返す

#### Scenario: まだ無い入力を取得する

- **WHEN** エージェントが、まだ保存されていない入力を取得する
- **THEN** システムはエラーを返す

#### Scenario: 同じ入力をもう一度取得する

- **WHEN** エージェントが同じ入力をもう一度取得する
- **THEN** 前回と同じ内容が返る

### Requirement: 問いの提出を受ける endpoint を公開する

システムはエージェントが問いを提出する endpoint を1つ公開する SHALL。ストロークの問いも差し戻しへの問い返しも同じ口で受け、エージェントに区別を求めない。提出される問いは次の構造に従う。

- `header`（12字以内）— 話題タグ
- `detail`（300字以内）— 問いに関する詳細な説明
- `question`（20字以内）— 問い本文
- `options`（1件以上5件以内）— 選択肢。各要素は `label`（見出し、1〜5語）と `description`（50字以内。それを選ぶと何がどうなるかの説明）を持つ
- `recommended` — 推奨の印。`true` の選択肢は多くとも1つ

スキーマを満たさない提出は受理しない。`label` の「1〜5語」は形式の規定として文言で伝えるものとし、語数による機械的な検証は行わない。

#### Scenario: 問いを提出する

- **WHEN** エージェントが構造を満たす問いを endpoint へ提出する
- **THEN** システムはそれを受け取り、ユーザーに問いとして表示する

#### Scenario: スキーマを満たさない問いを提出する

- **WHEN** 提出が構造を満たさない（規定の長さ・件数の超過を含む）
- **THEN** システムは提出を受理せず、スキーマを満たさないことをエージェントへ返す

### Requirement: proposal の提出を受ける endpoint を公開する

システムはエージェントが proposal の全文を提出する endpoint を公開する SHALL。提出には `projectName`（kebab-case のプロジェクト名の提案）を添えられる。名前の確定はユーザーの決定であり、`projectName` は画面2に当てる候補にすぎない。

システムは、受理した proposal をファイルへ書き出してはならない（MUST NOT）。proposal のファイル（セッションディレクトリの `docs/proposal.md`）はエージェント自身が書く（`project/generation` が規定する）。この口が受け取るのは、ユーザーに表示するための本文である。

#### Scenario: proposal を提出する

- **WHEN** エージェントが proposal の全文を endpoint へ提出する
- **THEN** システムはそれを受け取り、ユーザーに proposal として表示する。ファイルへの書き出しは行わない

#### Scenario: プロジェクト名の提案を添える

- **WHEN** 提出に kebab-case の `projectName` が添えられている
- **THEN** システムはそれを、ユーザーが画面2で編集して確定する候補として受け取る

#### Scenario: kebab-case でない projectName を添える

- **WHEN** 添えられた `projectName` が kebab-case でない
- **THEN** システムはその名前を候補として採用しない。proposal 自体の受理は妨げない

#### Scenario: 本文が空の proposal を提出する

- **WHEN** 提出された proposal の本文が空または空白のみである
- **THEN** システムは提出を受理せず、エラーを返す

### Requirement: 承認後のセッションは提出を受け付けない

システムは、受信した時点で phase が `approved` のセッションへの提出を受理せず、エラーを返す SHALL。判定は受信時点の phase だけで行い、時刻・順序・どの呼び出しに属する提出かは見ない。

#### Scenario: 承認後のセッションへ提出する

- **WHEN** phase が `approved` のセッションへ問いまたは proposal が提出される
- **THEN** システムは受理せず、エラーを返す

### Requirement: invocation を操作する endpoint を公開する

システムは `invocation` を操作する endpoint（A8）を1つ公開する SHALL。操作は値（`running` / `idle` / `failed` / `error`）を指定して行い、どの値も同じ口・同じ形式で変える。

この口を叩くのは invokeAi だけとする SHALL。claude（エージェント）と画面に叩かせてはならない（MUST NOT）。

#### Scenario: invokeAi が値を指定して変える

- **WHEN** invokeAi が対象の id と値を指定して A8 を叩く
- **THEN** その対象の `invocation` が指定された値に変わる

#### Scenario: 存在しない対象を操作する

- **WHEN** 存在しない id で A8 が叩かれる
- **THEN** システムは受理せず、エラーを返し、何も変えない
