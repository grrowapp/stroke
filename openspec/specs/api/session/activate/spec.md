# api/session/activate Specification

## Purpose
昇格したプロジェクトの完成——呼び手が完成と判定したこと——を記録する endpoint（U15 `POST /api/sessions/:id/activate`）を規定する。承認の判断（U10）・昇格（U14）・起動（U13）と同じく、承認の流れの1段を1つの endpoint が受け持つ。起動も判断も昇格も受け持たない。**完成したかの判定も受け持たない。**

## Requirements

### Requirement: U15 POST /api/sessions/:id/activate — 完成を記録する

システムは `POST /api/sessions/:id/activate` を公開する SHALL。`:id` は昇格後のプロジェクト名とする。本文は取らず、成功は受理だけを返す SHALL。

受理したとき、システムは対象の phase を `approved` から `activated` に変える SHALL。`activated` は `approved` の後にだけ来る局面であり、`stroking → proposed → approved → activated` の順で一方向に進む SHALL。`activated` から前の局面へ戻す口を持ってはならない（MUST NOT）。

この endpoint は AI を起動してはならず（MUST NOT）、対象を改名してはならず（MUST NOT）、`invocation` を書いてはならない（MUST NOT）。

存在しない id への要求は受理しない SHALL。

#### Scenario: 完成を記録する

- **WHEN** phase が `approved` のプロジェクトの id に `POST /api/sessions/:id/activate` が届く
- **THEN** システムは受理し、phase は `activated` になる。ディレクトリ名も `invocation` も変わらず、AI は起動されない

#### Scenario: 存在しない id で要求する

- **WHEN** 存在しない id で完成の記録が要求される
- **THEN** システムは受理せず、存在しないことを伝える。何も書かれない

### Requirement: 完成の判定を持たない

システムは、この endpoint に完成したかの判定を持たせてはならない（MUST NOT）。**完成したかを決めるのは呼び手であり**、この endpoint は `approved` から `activated` への一方向の遷移を記録するだけとする SHALL。呼び手がどう決めるかは `agent/invocation`（実行ごとの判定。起動処理が実行の終了後に本家 REST へ問い合わせ、3本の steering 文書とそれぞれの承認依頼が在ることを確かめる）と `project/generation`（起動時の書き上げ）が定める。

システムは、対象の成果物——`.spec-workflow/` 配下のファイル、steering 文書、承認依頼、その他の生成物——の有無や数を、受理の可否の材料にしてはならない（MUST NOT）。**成果物を探してファイルシステムを読んではならず**（MUST NOT）、本家 spec-workflow-mcp の REST を呼んでもならない（MUST NOT）。本家への問い合わせは呼び手（起動処理）が記録を要求する前に済ませるものであり、この endpoint が重ねて問い合わせてはならない（MUST NOT）。AI の実行状態（`invocation`）も材料にしてはならない（MUST NOT）。

対象の存在の確認と `state.json` の読み出しは、これに含まれない（SHALL）——どちらも下の「責務が成立するか」を見るためのもので、成果物を数えるものではない。

受理の可否を決めてよいのは、受け取った id に対して**この責務が成立しないこと**だけとする SHALL——対象が存在しない、`state.json` を読めない、phase が `approved` でない、の3つである。呼び出し側が渡していない内部状態を見て振る舞いを変えないためで、これは ADR-0014「API は暗黙の状態分岐を持たない」が対象外とする「責務の不成立」の分岐にあたる。

#### Scenario: 成果物の有無を見ない

- **WHEN** phase が `approved` で、`.spec-workflow/` を1つも持たないプロジェクトに完成の記録が要求される
- **THEN** システムは受理し、phase は `activated` になる

#### Scenario: 本家が動いていない

- **WHEN** 本家 spec-workflow-mcp が起動していない状態で完成の記録が要求される
- **THEN** システムは受理し、phase は `activated` になる。本家に問い合わせない

#### Scenario: 呼び手の確認とは独立に受理する

- **WHEN** 起動処理が本家で3本の文書と承認依頼を確かめた後に完成の記録を要求する
- **THEN** システムはその確認の結果を受け取らず、phase が `approved` であることだけを見て受理する

#### Scenario: 実行中の対象に記録する

- **WHEN** `invocation` が `running` のまま——実行がまだ `idle` を書く前——の生成中のプロジェクトに完成の記録が要求される
- **THEN** システムは受理し、phase は `activated` になる。実行の記録を受理の可否に使わない

#### Scenario: 局面を読み取れない

- **WHEN** 対象は在るが `state.json` を読み取れないプロジェクトに完成の記録が要求される
- **THEN** システムは受理せず、局面が分からないことを伝える。壊れた `state.json` を書き換えない

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
