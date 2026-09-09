## Purpose

stroke-board 自身が route `/mcp` で提供する MCP ツールの全ツールに共通する責務の境界を定める。ツールは工程の中でだけ存在し、代行先へ要求を発行してその応答だけから結果を作る。作業の判定・phase の遷移・実行の記録・完成の記録・接続 token の発行と失効は invoke-agent の責務であり、ツールは受け持たない。結果の形と代行の方式は `mcp/server`、個々のツールは `mcp/tools/**`、invoke-agent の責務は `agent/invocation` にある。

## ADDED Requirements

### Requirement: ツールは工程の中でだけ存在する

MCP ツールは特定の工程（flontier / steering）の中でだけ存在する SHALL。ひとつの接続に公開されるのはその工程のツールだけとし、起動していない claude・画面・サーバー内部の別の処理から呼ばれてはならない（MUST NOT）。

ツールは自分がどの工程で呼ばれているかを判定して振る舞いを変えてはならない（MUST NOT）。工程は起動側が接続ごとに決め、ツールはその工程の接続文脈で代行するだけとする SHALL。接続の工程と引数が食い違うときは、代行先を決められない失敗として `mcp/server` の平坦な形で返す SHALL。

#### Scenario: 工程の外から呼ばれない

- **GIVEN** stroke-board が起動済みで、どの claude も起動していない
- **WHEN** サーバー内部の処理や画面が MCP ツールの結果を必要とする
- **THEN** ツールは呼ばれず、その処理は対応する endpoint を直接呼ぶ。ツールの呼び出しが発生する経路は起動中の claude の接続だけである

#### Scenario: ツールは工程を判定しない

- **GIVEN** steering 工程の接続である
- **WHEN** その接続で公開されているツールを実行する
- **THEN** ツールは接続表が解決した接続文脈（プロジェクトパス）で代行先を決め、工程を見て振る舞いを変えていない

### Requirement: 代行以外の固定の処理を受け持たない

ツールの責務は、対応する endpoint または本家 REST へ要求を発行し、その応答だけから結果を作ることに限る SHALL。ツールに固定の処理を持たせてはならない（MUST NOT）。次はいずれもツールが受け持ってはならない（MUST NOT）。受け持つのは invoke-agent、または画面と invoke-agent が呼ぶ endpoint（phase の遷移）である。

- 作業が行われたかの判定と、その材料の記録
- phase の遷移
- 実行の記録（`invocation`）への関与
- 完成の記録
- 起動・終了の検知

提出が受理されたという事実をサーバーのメモリやファイルに残すことも、この禁止に含まれる SHALL。受理の事実は代行先が持ち、要る側（invoke-agent）が代行先へ問い合わせて得る。ツールがコピーを持ってはならない（MUST NOT）。

#### Scenario: 提出が受理されてもツールは記録を残さない

- **GIVEN** steering 工程の接続である
- **WHEN** 種別 steering で文書を提出し、代行先（本家）が受理する
- **THEN** 結果は代行先の応答の `status` だけを持ち、サーバーのメモリにもファイルにも、その提出が受理されたことを表す記録は作られない

#### Scenario: ツールは phase も実行の記録も動かさない

- **GIVEN** 生成中（phase が `approved`）のプロジェクトで steering 工程の接続がある
- **WHEN** その接続のツールで3本の文書を提出し、いずれも受理される
- **THEN** ツールの呼び出しの間に phase も `invocation` も変わらない。変わるのは実行の終わりに invoke-agent が判定してからである

#### Scenario: 作業の判定は代行先への問い合わせで行われる

- **GIVEN** steering 工程の実行が終わった
- **WHEN** その実行で作業が行われたかを判定する
- **THEN** 判定の材料は代行先（本家 REST）への問い合わせの応答であり、ツールが残した記録は使われない（判定の内容は `agent/invocation` が定める）

### Requirement: 文書の提出は登録の代行のみ

`submit-document` の責務は、文書を代行先（flontier は proposal の endpoint、steering は本家の steering 文書の endpoint）へ登録することのみとする SHALL。結果は代行先の応答だけから作り、登録の成否以外を結果に載せてはならない（MUST NOT）。登録の後に続く処理（承認依頼の作成・判定・記録）をこのツールに持たせてはならない（MUST NOT）。

#### Scenario: 提出の結果は登録の成否だけを持つ

- **GIVEN** steering 工程の接続である
- **WHEN** 種別 steering・文書名 product で文書を提出する
- **THEN** 結果は本家の応答の `status`（失敗なら `errorCode` と `error`）だけを持ち、承認依頼や判定に関する項目を持たない

#### Scenario: 登録の後に続く処理はツールの外にある

- **GIVEN** steering 工程の接続で文書が受理された
- **WHEN** その文書の承認依頼を出す
- **THEN** 承認依頼は `submit-document` の中では作られず、手順（`mcp/tools/steering-guide`）が案内する別の手段で claude が出す

### Requirement: 接続 token はツールが発行しない

接続 token の発行・登録・失効は invoke-agent が担う SHALL（`server/session-management`）。ツールはヘッダの token を接続表で解決し、解決した接続文脈で代行先を決めるだけとする SHALL。ツールが token を発行すること、接続表に登録・削除すること、接続がまだ有効かを自分で調べて振る舞いを変えることを禁じる（MUST NOT）。

#### Scenario: ツールは token を解決するだけ

- **GIVEN** 起動中の claude の接続である
- **WHEN** いずれかのツールを実行する
- **THEN** ツールは `x-stroke-token` を接続表で解決して接続文脈を得ており、接続表への書き込みは行っていない

#### Scenario: 実行が終わった後に届いた応答で振る舞いを変えない

- **GIVEN** steering 工程の起動が代行先の応答を待っている間に、その実行が打ち切られて終わっている
- **WHEN** 代行先が受理の応答を返す
- **THEN** ツールは接続の有効・無効を調べ直さず、代行先の応答の `status` をそのまま結果に写す。記録も作らない
