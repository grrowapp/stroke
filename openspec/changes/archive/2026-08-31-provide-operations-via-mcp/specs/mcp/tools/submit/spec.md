# mcp/tools/submit Delta

## Purpose

文書の提出の一本口となるツール（`submit-document`）の契約を定める。どこへの提出かは引数の種別で決まる。

## ADDED Requirements

### Requirement: 文書を種別の引数で提出する

ツールの引数は、提出の種別（flontier / steering）と文書の文章とする SHALL。種別が steering の場合は文書名（product / tech / structure）を併せて取る SHALL。種別が flontier の場合は、承認画面に出すプロジェクト名の候補を任意で取る SHALL——省略できる SHALL で、省略したときは提出先へ項目ごと渡さない SHALL（既にある値を空で上書きしないため）。

文書名が**代行先のルートに届かない形**（空文字・`.`・`..`）のときは、代行先へ発行せず `status: 400` / `errorCode: validation_error` で返す SHALL。届かない形をそのまま発行すると URL のパスセグメントが潰れ、代行先の名前の検査に到達しないまま素の 404 が返るためである。**弾くのは届くかどうかだけで、名前の妥当性（product / tech / structure か）を判定してはならない（MUST NOT）**——そちらの正は代行先にある。

種別が規定の2値（flontier / steering）でないときは、代行先へ発行せず `status: 400` / `errorCode: validation_error` で返す SHALL——振り分け先が決まらないためである。この判定はハンドラで行う SHALL（`inputSchema` の `.enum()` で弾いてはならない。理由は `mcp/server`）。

提出先の振り分けは引数だけで決まる SHALL。引数に現れない内部状態を見て振り分けや可否を変えてはならない（MUST NOT）（docs/adr/0014 の原則に整合する）。ツール側で文章の検証を行って提出を止めてはならない（MUST NOT）——検証の正は提出先にある。結果は `mcp/server` の形式（status / errorCode）に従う SHALL。失敗は種別によらずすべてこのエラー形式で返り、本家 dashboard に到達できない場合の errorCode は `unreachable` とする SHALL。

このツールは両工程に公開されるため、接続の工程と引数の種別が食い違う呼び出しが起こりうる SHALL。その場合も他の失敗と同じエラー形式で返す SHALL——代行先の要求を組み立てられないので `status: 400` / `errorCode: connection_mismatch` とし、例外を投げて結果の形を崩してはならない（MUST NOT）。`errorCode` を代行先の検証エラー（`validation_error`）と同じ値にしてはならない（MUST NOT）——呼び手の次の手が違う。工程の食い違いは `type` を直す話で、文書を直しても通らない。

#### Scenario: プロジェクト名の候補を添えて提出する

- **GIVEN** 対象のセッションで stroke が把握完了した
- **WHEN** claude が種別 flontier で、proposal の文章とプロジェクト名の候補を提出する
- **THEN** 承認画面のプロジェクト名欄に、その候補が初期値として入っている

#### Scenario: 接続の工程と種別が食い違う

- **GIVEN** flontier 工程の接続である
- **WHEN** 種別 steering で提出する
- **THEN** 結果はエラーで、`status: 400`・`errorCode: connection_mismatch` と、工程が違う旨の理由（`error`）を持つ。例外にはならない

#### Scenario: proposal の提出が画面に反映される

- **GIVEN** 対象のセッションで stroke が把握完了した
- **WHEN** claude が種別 flontier で proposal の文章を提出する
- **THEN** proposal 確認画面（`/strokes/<セッション id>/proposal`）に提出された文章が表示される（検証側がブラウザで開いて確かめる）

#### Scenario: steering 文書の提出が本家に反映される

- **GIVEN** 本家の dashboard が起動済みで、対象のプロジェクトの steering 工程が開始されている
- **WHEN** claude が種別 steering・文書名 product で文章を提出する
- **THEN** 本家 `GET /api/projects/:projectId/steering/product` の応答が、提出された文章と一致する（検証側が突き合わせる）

#### Scenario: 本家が停止中の提出はエラーになる

- **GIVEN** 対象のプロジェクトの steering 工程が開始された後、本家の dashboard が停止している
- **WHEN** claude が種別 steering で文章を提出する
- **THEN** 結果はエラーで、status と `errorCode: unreachable` を持つ
