# mcp/server Delta

## Purpose

claude プロセスへ操作系ツールを提供する MCP サーバー本体の挙動を定める。transport・接続情報の解決・入出力スキーマ・エラー処理という、全ツールに共通する契約を持つ。本書で「MCP サーバー」は本 change で追加する stdio のツールサーバーだけを指す（claude を spawn する stroke-board、本家の dashboard とは区別する）。

## ADDED Requirements

### Requirement: MCP サーバーは stdio transport で提供される

MCP サーバーは stdio transport の別プロセスとして起動し、呼び出し側が組み立てる MCP 設定から登録される SHALL。

#### Scenario: 起動した claude からツールが見える

- **GIVEN** stroke-board が起動済みである
- **WHEN** この MCP サーバーを MCP 設定に指定して claude を起動し、使えるツールの報告を指示する
- **THEN** claude の報告に、概要の取得・ストローク記録の取得・差し戻しの取得・問いの提出・文書の提出・steering 文書の取得の6ツールがすべて明示されている

### Requirement: ツールは入出力スキーマで契約する

各ツールは引数と結果のスキーマを定義する SHALL。結果は endpoint の応答をそのスキーマに整形して返す SHALL。endpoint の生応答を無加工のまま返してはならない（MUST NOT）。整形で応答の情報を欠落させてはならない（MUST NOT）。

#### Scenario: 結果はスキーマに従う

- **GIVEN** stroke-board が起動済みで、概要を受理したセッションが存在する
- **WHEN** この MCP サーバーを MCP 設定に指定して claude を起動し、概要の取得ツールの実行と結果の報告を指示する
- **THEN** 報告されたツール結果が概要の取得ツールの結果スキーマの項目で読め、そのセッションの概要の本文が欠けずに含まれている

### Requirement: 接続情報は MCP サーバーが解決する

接続先（stroke-board・本家それぞれの base URL）とセッション id は、起動時に呼び出し側から渡された値で MCP サーバーが解決する SHALL。本家向け操作に要る projectId は、MCP サーバーが本家への問い合わせで解決する SHALL。ツールの引数に接続情報を要求してはならない（MUST NOT）。

#### Scenario: 引数なしで自セッションに届く

- **GIVEN** stroke-board が起動済みで、概要を受理したセッションが存在する
- **WHEN** そのセッションの接続情報を MCP 設定に指定して claude を起動し、概要の取得ツールを引数なしで実行して結果を報告するよう指示する
- **THEN** 報告されたツール結果に、そのセッションの概要の本文が含まれている

#### Scenario: projectId を引数に取らない

- **GIVEN** stroke-board と本家の dashboard が起動済みで、対象のプロジェクトに product の steering 文書が存在する
- **WHEN** そのプロジェクトの接続情報を MCP 設定に指定して claude を起動し、projectId を渡さずに steering 文書の取得ツールで product を読んで結果を報告するよう指示する
- **THEN** 報告されたツール結果に、そのプロジェクトの product の文章が含まれている

### Requirement: エラーを処理して返す

endpoint がエラーを返した場合、ツールはエラーを返し、ステータスとエラー内容を保つ SHALL。本家の dashboard に到達できない場合は、エラーとは区別して不達を返す SHALL（stroke-board 向け操作では、stroke-board 停止中にツールが実行されることは無いため不達は定めない）。エラーの扱いに MCP サーバー独自の判定・状態分岐を足してはならない（MUST NOT）（docs/adr/0013 の原則に整合する）。

#### Scenario: 検証エラーが読める

- **GIVEN** stroke-board が起動済みで、対象のセッションで stroke が把握完了した
- **WHEN** この MCP サーバーを MCP 設定に指定して claude を起動し、提出先の検証に通らない文章での文書の提出ツールの実行と結果の報告を指示する
- **THEN** 報告されたツール結果がエラーであり、ステータスとエラー内容が読める

#### Scenario: 不達が区別できる

- **GIVEN** stroke-board が起動済みで、本家の dashboard が停止している
- **WHEN** この MCP サーバーを MCP 設定に指定して claude を起動し、steering 文書の取得ツールの実行と結果の報告を指示する
- **THEN** 報告されたツール結果が不達であり、エラーと区別して読める
