## MODIFIED Requirements

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
