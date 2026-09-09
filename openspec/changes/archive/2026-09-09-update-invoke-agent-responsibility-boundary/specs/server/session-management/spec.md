## ADDED Requirements

### Requirement: token の発行と失効は起動処理だけが行う

一時 token を発行・登録し、失効させるのは起動処理（invoke-agent）だけとする SHALL。token は起動ごとに1つ発行し、その実行の終了（正常・異常とも）で失効させる SHALL。MCP ツール・endpoint・画面のいずれも token を発行・登録・削除してはならない（MUST NOT）。

接続表は token と接続文脈（工程種別と、flontier 工程ではセッション、steering 工程ではプロジェクト）の対応だけを持つ SHALL。**接続表に、その起動で何が起きたかの記録を持たせてはならない（MUST NOT）**——起動の成果を知る手段は起動処理が持ち、接続表は誰の呼び出しかを答えるだけである。

#### Scenario: 実行の終了で token が失効する

- **GIVEN** 起動が実行中で、その token でツールの呼び出しが通っている
- **WHEN** その実行が終了する
- **THEN** 同じ token での呼び出しは HTTP 401 で拒否される

#### Scenario: 接続表は成果を持たない

- **GIVEN** steering 工程の起動が文書を提出して受理された
- **WHEN** 接続表のその token のエントリを見る
- **THEN** エントリには接続文脈だけが在り、提出の有無や数は記録されていない
