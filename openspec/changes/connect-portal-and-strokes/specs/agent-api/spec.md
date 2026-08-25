## ADDED Requirements

### Requirement: steering の提出の告知を受ける endpoint を公開する

システムは、steering 文書を提出し終えたエージェントが**提出を告知する** endpoint を1つ公開する SHALL。この口は告知を受理したこと以外の意味を持たず、文書の中身を受け取ってはならない（MUST NOT）。

受理したとき、システムはそのセッション id の実行の記録を消す SHALL（＝完了。`steering-stage` が規定する）。

この口は、そのセッションの phase を判定の材料にしてはならない（MUST NOT）。steering は承認の後に走るため、phase は常に `approved` である。

#### Scenario: steering の提出を告知する

- **WHEN** steering 文書を提出し終えたエージェントが、自分のセッション id で提出を告知する
- **THEN** システムは受理し、そのセッション id の実行の記録が消える

#### Scenario: 承認済みのセッションから告知する

- **WHEN** phase が `approved` のセッション id で提出が告知される
- **THEN** システムは受理する

#### Scenario: 記録の無いセッション id で告知する

- **WHEN** 実行の記録に無いセッション id で提出が告知される
- **THEN** システムは何も消さず、エラーを返す

### Requirement: リトライ対象の一覧を返す endpoint を公開する

システムは、**失敗として記録されているセッション id の一覧**を返す endpoint を1つ公開する SHALL。この口は一覧を返すだけで、起動・記録の更新を行ってはならない（MUST NOT）。

#### Scenario: 失敗した実行がある

- **WHEN** 失敗として記録されたセッション id がある状態でリトライ対象を取得する
- **THEN** そのセッション id が一覧に入って返る

#### Scenario: 失敗した実行が無い

- **WHEN** 失敗の記録が1件も無い状態でリトライ対象を取得する
- **THEN** 空の一覧が返る

#### Scenario: 取得しても状態は変わらない

- **WHEN** リトライ対象を続けて2回取得する
- **THEN** 2回とも同じ一覧が返り、記録は取得によって変化しない

## MODIFIED Requirements

### Requirement: proposal の提出を受ける endpoint を公開する

システムはエージェントが proposal の全文を提出する endpoint を公開する SHALL。提出には `projectName`（kebab-case のプロジェクト名の提案）を添えられる。名前の確定はユーザーの決定であり、`projectName` は画面2に当てる候補にすぎない。

システムは、受理した proposal をファイルへ書き出してはならない（MUST NOT）。proposal のファイル（セッションディレクトリの `docs/proposal.md`）はエージェント自身が書く（`project-generation` が規定する）。この口が受け取るのは、ユーザーに表示するための本文である。

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

システムは、受信した時点で phase が `approved` のセッションへの**問いと proposal の提出**を受理せず、エラーを返す SHALL。判定は受信時点の phase だけで行い、時刻・順序・どの呼び出しに属する提出かは見ない。

この規定は steering の提出の告知には適用しない。告知の口は承認後にしか使われないため、phase を判定の材料にしない。

#### Scenario: 承認後のセッションへ提出する

- **WHEN** phase が `approved` のセッションへ問いまたは proposal が提出される
- **THEN** システムは受理せず、エラーを返す

#### Scenario: 承認後のセッションへ steering の提出を告知する

- **WHEN** phase が `approved` のセッションから steering の提出が告知される
- **THEN** システムは受理する
