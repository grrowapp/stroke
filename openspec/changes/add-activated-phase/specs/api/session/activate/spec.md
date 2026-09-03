## Purpose

昇格したプロジェクトの完成——steering が初回の承認依頼を出したこと——を記録する endpoint（U15 `POST /api/sessions/:id/activate`）を規定する。承認の判断（U10）・昇格（U14）・起動（U13）と同じく、承認の流れの1段を1つの endpoint が受け持つ。起動も判断も昇格も受け持たない。

## ADDED Requirements

### Requirement: U15 POST /api/sessions/:id/activate — 完成を記録する

システムは `POST /api/sessions/:id/activate` を公開する SHALL。`:id` は昇格後のプロジェクト名とする。本文は取らず、成功は受理だけを返す SHALL。

受理したとき、システムは対象の phase を `approved` から `activated` に変える SHALL。`activated` は `approved` の後にだけ来る局面であり、`stroking → proposed → approved → activated` の順で一方向に進む SHALL。`activated` から前の局面へ戻す口を持ってはならない（MUST NOT）。

この endpoint は AI を起動してはならず（MUST NOT）、対象を改名してはならず（MUST NOT）、`invocation` を書いてはならない（MUST NOT）。

存在しない id への要求は受理しない SHALL。

#### Scenario: 完成を記録する

- **WHEN** phase が `approved` で、承認依頼を1件以上持つプロジェクトの id に `POST /api/sessions/:id/activate` が届く
- **THEN** システムは受理し、phase は `activated` になる。ディレクトリ名も `invocation` も変わらず、AI は起動されない

#### Scenario: 存在しない id で要求する

- **WHEN** 存在しない id で完成の記録が要求される
- **THEN** システムは受理せず、存在しないことを伝える。何も書かれない

### Requirement: 完成の根拠は承認依頼の存在とする

システムは、対象のプロジェクトの `.spec-workflow/approvals/` 配下に承認依頼のファイルが1件以上在ることを、完成の唯一の根拠としなければならない（SHALL）。承認依頼のファイルとは、本家が category ごとのディレクトリ（`approvals/<category>/`）の直下に置く JSON ファイルを指し、category は問わない（SHALL）。隠しファイル・ディレクトリ（本家の `.snapshots/` など）や `approvals/` 直下のファイルは数えない（SHALL NOT）。承認依頼の状態（保留・承認済み・却下済み）は問わない（SHALL）。

システムは、この判定のために本家 spec-workflow-mcp の REST を呼んではならない（MUST NOT）。本家が動いていなくても判定できなければならない。

システムは、AI の実行状態（`invocation`）や、steering 文書の提出の有無を、この判定の材料にしてはならない（MUST NOT）。文書を書いても承認依頼を出さずに終わった実行は、完成ではない。

#### Scenario: 承認依頼が無い

- **WHEN** phase が `approved` だが承認依頼のファイルが1件も無いプロジェクトに完成の記録が要求される
- **THEN** システムは受理せず、まだ完成していないことを伝える。phase は `approved` のまま残る

#### Scenario: 却下済みの承認依頼だけが在る

- **WHEN** 承認依頼のファイルが在るが、そのすべてが却下済みであるプロジェクトに完成の記録が要求される
- **THEN** システムは受理し、phase は `activated` になる

#### Scenario: 本家が動いていない

- **WHEN** 本家 spec-workflow-mcp が起動していない状態で、承認依頼のファイルを持つプロジェクトに完成の記録が要求される
- **THEN** システムは受理し、phase は `activated` になる

### Requirement: 承認より前の局面と、既に完成した対象には記録しない

システムは、phase が `stroking` または `proposed` の対象——まだ昇格していないもの——への要求を受理してはならない（MUST NOT）。phase が既に `activated` の対象への要求も受理してはならない（MUST NOT）——完成は一度だけ起こる出来事であり、記録し直す意味は無い。

いずれも、状況が変わるまで通らない要求として断る SHALL。

#### Scenario: 昇格していないセッションに要求する

- **WHEN** phase が `proposed` のセッションの id で完成の記録が要求される
- **THEN** システムは受理せず、まだ昇格していないことを伝える。phase は変わらない

#### Scenario: 既に完成した対象に要求する

- **WHEN** phase が `activated` のプロジェクトに完成の記録が要求される
- **THEN** システムは受理せず、既に完成していることを伝える。phase は `activated` のまま変わらない

### Requirement: 完成の記録は決着として上層へ届く

システムは、phase を `activated` に変えた直後に、そのプロジェクトの生成が成功で決着したことを、開いている一覧へ届けなければならない（SHALL）。届け方は `ws/delivery` の規約に従う。

**成功の決着**の合図を出すのはこの endpoint だけとする SHALL。実行の完了（`invocation` が `idle` になること）を成功の決着として届けてはならない（MUST NOT）。実行の記録の口（`api/stroke/submission`、A8）が成功の決着を流す形を残してはならない（MUST NOT）。

失敗の決着はこの endpoint が出すものではない。失敗は実行の記録が `error` に達したことから届く（`project/generation`「決着したら、知らせてから次を選ばせる」）。

#### Scenario: 一覧を開いたまま完成する

- **WHEN** プロジェクト一覧を開いている状態で、生成中のプロジェクトに完成が記録される
- **THEN** 一覧を再読み込みしなくても、その行から生成中の表現が外れ、完了を知らせる面が出る

#### Scenario: 実行が終わっただけでは届かない

- **WHEN** 生成中のプロジェクトで steering の実行が正常終了し、`invocation` が `idle` になったが、完成は記録されていない
- **THEN** 成功の決着は届かず、行は生成中のまま出ている
