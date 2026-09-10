# api/stroke/proposal Specification

> **この capability の存在自体が未確定である（2026-09-02）。** ユーザーが承認したのは「提出は `submission` へ寄せ、**`proposal`（A7）は無くなる**」形である。この spec が在ること自体がそれと食い違う。エージェントが archive 済みの design.md を承認の証拠として扱い、ユーザーの判断を捻じ曲げた結果である（`docs/adr/0019-approval-is-not-inferred-from-archive.md`）。**以下を正として扱わないこと。**

## Purpose
エージェントが proposal の全文を提出する endpoint（A7）を規定する。ユーザーに表示するための本文とプロジェクト名の候補の受け取りを担う。

## Requirements

### Requirement: A7 POST /api/strokes/:id/proposal — proposal の提出を受ける

システムは `POST /api/strokes/:id/proposal` を公開する SHALL。エージェントは proposal の全文を提出し、`projectName`（kebab-case のプロジェクト名の提案）を添えられる。名前の確定はユーザーの決定であり、`projectName` は画面2に当てる候補にすぎない。

**この endpoint の責務は提出を記録することだけである。** phase を切り替えてはならず（MUST NOT）、画面へ配信してもならない（MUST NOT）。局面の切り替えと配信は、この提出を行った実行の決着として invokeAi が行う（`agent/invocation`「完了は output stream で検知して idle に変える」）。endpoint が切り替えると、claude の実行がまだ終わっていないのに承認できる局面が立つ。

添えられた `projectName` が kebab-case でない場合、システムはその名前を候補として採用してはならない（MUST NOT）が、proposal 自体の受理は妨げない。本文が空または空白のみの提出は受理せず、エラーを返す SHALL。存在しないセッション id への提出は受理せず、エラーを返す SHALL。

#### Scenario: proposal を提出する

- **WHEN** エージェントが proposal の全文を `POST /api/strokes/:id/proposal` へ提出する
- **THEN** システムはそれを記録して受理を返す。phase は変わらず、画面への配信はこの時点では起こらない

#### Scenario: 実行の決着で画面に届く

- **WHEN** proposal を提出した実行が完了し、invokeAi が決着する
- **THEN** phase が `proposed` になり、記録された proposal が画面へ届く

#### Scenario: プロジェクト名の提案を添える

- **WHEN** 提出に kebab-case の `projectName` が添えられている
- **THEN** システムはそれを、ユーザーが画面2で編集して確定する候補として記録する

#### Scenario: kebab-case でない projectName を添える

- **WHEN** 添えられた `projectName` が kebab-case でない
- **THEN** システムはその名前を候補として採用しない。proposal 自体の受理は妨げない

#### Scenario: 存在しないセッション id で提出する

- **WHEN** 存在しないセッション id に proposal が提出される
- **THEN** システムは受理せず、エラーを返す

#### Scenario: 本文が空の proposal を提出する

- **WHEN** 提出された proposal の本文が空または空白のみである
- **THEN** システムは提出を受理せず、エラーを返す

### Requirement: 受理した proposal は残る

システムは受理した proposal を残す SHALL。受理が成立した後は、提出の瞬間に繋いでいたかどうかによらず、同じ proposal が得られなければならない。繋ぎ直した画面でも、承認の時点でも同じものが得られる。

残せなかった場合、システムは受理を成立させてはならない（MUST NOT）。提出は失敗として返す。受理したのに残っていない状態を作らない。

出し直された proposal は前のものに取って代わる。得られるのは常に最後に受理された1件とする。

#### Scenario: 提出した後に繋ぎ直す

- **WHEN** proposal が受理され、その実行が決着した後、画面が繋ぎ直す
- **THEN** 受理された proposal がその画面に届く

#### Scenario: 提出の瞬間に誰も繋いでいない

- **WHEN** proposal を受け取る接続が1つも無い状態で proposal が受理され、実行が決着する
- **THEN** その後に繋いだ画面へ、受理された proposal が届く

#### Scenario: 承認の時点で proposal が要る

- **WHEN** 受理された proposal を持つセッションが承認される
- **THEN** 承認は proposal が無いことを理由に拒まない

#### Scenario: 出し直す

- **WHEN** 差し戻しの後に proposal が出し直されて受理される
- **THEN** 以後に得られるのは出し直された方だけで、前のものは得られない

#### Scenario: 残せない

- **WHEN** 受理しようとした proposal を残せない
- **THEN** システムは提出を失敗として返す。以後もその proposal は得られない
