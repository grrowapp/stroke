# mcp/server Specification

## Purpose
stroke-board 自身が route `/mcp` で提供する MCP サーバーの、全ツール共通の契約を定める。個々のツールの引数・結果は `mcp/tools/**`、接続の担保は `server/session-management` にある。

## Requirements

### Requirement: MCP は stroke-board 自身の route で提供される

MCP サーバーは stroke-board の route `/mcp`（Streamable HTTP）で提供される SHALL。別プロセスを立ててはならない（MUST NOT）。

**既存 endpoint を代行するツールは `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document` / `get-steering` の6本とする SHALL。** 代行するツールをこれ以外に増やしてはならない（MUST NOT）——増やすなら代行先の endpoint から先に決める。代行先を持たないツール（工程の手順を返すものなど）はこの数に含めない。

#### Scenario: 代行するツールが6本である

- **GIVEN** invoke.ts が起動した claude が `/mcp` へ接続している
- **WHEN** flontier 工程と steering 工程それぞれの接続でツールの一覧を取る
- **THEN** 2つの一覧を合わせた中の代行ツールは `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document` / `get-steering` の6本で、これ以外の代行ツールは現れない

判定に Nuxt DevTools の MCP Inspector を使ってはならない（MUST NOT）——Inspector は token を持たないので `server/session-management` の要求どおり 401 で拒否される。有効な token を持つ接続からしか一覧は取れない。

### Requirement: 接続には工程で使うツールだけを見せる

ひとつの接続に公開するツールは、その起動の工程で使うものだけとする SHALL。flontier 工程は `get-guide` / `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document`、steering 工程は `get-steering-guide` / `get-steering` / `submit-document` とする SHALL。工程で使わないツールを、その接続のツール一覧に出してはならない（MUST NOT）。

**工程の案内は工程ごとに別のツールとする SHALL。** 1本のツールが接続の工程を見分けて本文を出し分けてはならない（MUST NOT）——それはツールの側で工程を判定する形であり、下の絞りの規定と矛盾する。

絞りは起動側が接続ごとに指定する SHALL——ツールの側で工程を判定して拒否する形にしてはならない（MUST NOT）。呼べないものを見せてから失敗させると、呼び手は失敗するまで判別できない。

この絞りが掛かるのは stroke-board 自身の MCP サーバーの一覧である SHALL。steering 工程に併せて配線される本家 spec-workflow の MCP（`agent/invocation` が定める。承認依頼のツール `approvals` を許可する）は別のサーバーであり、そのツールは上の一覧に数えず、`mcp/server` の結果の形にも従わない SHALL。

#### Scenario: flontier 工程に steering のツールが見えない

- **GIVEN** flontier 工程の claude が起動している
- **WHEN** その接続でツールの一覧を取る
- **THEN** `get-steering` も `get-steering-guide` も一覧に無い

#### Scenario: steering 工程に flontier 専用のツールが見えない

- **GIVEN** steering 工程の claude が起動している
- **WHEN** その接続でツールの一覧を取る
- **THEN** `get-guide` / `get-overview` / `get-strokes` / `get-send-back` / `send-question` がいずれも一覧に無い

#### Scenario: 文書の提出は両工程に見える

- **GIVEN** flontier 工程と steering 工程の claude がそれぞれ起動している
- **WHEN** それぞれの接続でツールの一覧を取る
- **THEN** どちらの一覧にも `submit-document` がある

#### Scenario: 工程の案内が同じ工程にだけ見える

- **GIVEN** steering 工程の接続で `/mcp` に繋いでいる
- **WHEN** ツールの一覧を取る
- **THEN** `get-steering-guide` が現れ、`get-guide` は現れない

#### Scenario: 本家のツールは stroke-board の一覧に数えない

- **GIVEN** steering 工程の claude が起動している
- **WHEN** stroke-board の MCP サーバーの接続でツールの一覧を取る
- **THEN** 一覧は `get-steering-guide` / `get-steering` / `submit-document` の3本で、本家の `approvals` はこの一覧に無い（本家の MCP は別のサーバーとして配線されている）

### Requirement: 結果は status と errorCode のフラットな形で返す

各ツールの結果は1階層とし、常に `status`（endpoint の応答の HTTP ステータスコード）を持つ SHALL。失敗時は `errorCode`（機械可読の失敗種別。本家 dashboard に到達できない場合は `unreachable`）と `error`（endpoint が返したエラー本文）を持ち、成功時はそのツールの結果スキーマの項目を持つ SHALL。エラー本文を書き換え・省略・追加してはならない（MUST NOT）。MCP サーバー独自の事前検証・状態分岐を足してはならない（MUST NOT）（docs/adr/0014 の原則に整合する）。

**代行先の応答から結果を組み立てられなかった場合に限り**、ツールが `status` を組み立ててよい SHALL。該当するのは次の5つだけで、これ以外を足してはならない（MUST NOT）。

| 出せなかった理由 | `status` | `errorCode` |
|---|---|---|
| token が解けず、どこへ代行するかが決まらない | 401 | `unauthorized` |
| 引数が契約を満たさず、代行先の要求を組み立てられない | 400 | `validation_error` |
| 接続の工程と引数の種別が食い違い、代行先を決められない | 400 | `connection_mismatch` |
| 代行に要る projectId を本家の一覧から引き当てられない | 404 | `project_not_registered` |
| 代行先は応答したが、本文が想定の形と違い結果を組み立てられない | 502 | `upstream_malformed` |

上の4つは代行先の応答が存在しない。5つ目は応答はあるが**使える結果が無い**場合で、応答の `status`（2xx）を返すと成功と見分けがつかなくなるため例外とする。いずれも `error` は代行先の本文ではなくツールが書いた理由になる。

**`project_not_registered` の `error` は、引き当てに使ったパスと、そのとき本家の一覧が持っていたプロジェクト（名前とパス）を含む SHALL。** 一覧が空だったのか、一覧にプロジェクトはあるが照合が成立しなかったのかを、`error` だけから判別できる形にする SHALL。「登録されていない」としか読めない本文にしてはならない（MUST NOT）——実際には登録されていて照合だけが外れている場合があり、その本文は受け手を、存在しない原因（未登録）の解消へ向かわせる。

**この2つの状況に別々の `errorCode` を割り当ててはならない（MUST NOT）。** `errorCode` は受け手が分岐するための値であり、「一覧に候補が無い」と「一覧に候補はあるが照合が外れた」はどちらも受け手（呼び出した claude）には直せず、次の手が変わらない。分岐の増えない区別は `error` の本文で伝える。

1つ目（`unauthorized`）は、`server/session-management` が要求する **HTTP 401 の代わりではない**。HTTP 401 は route へ届く前の層が返す SHALL で、ツール側のこれは多重防御である。ツールの中で例外を投げると結果の形が崩れるので、到達しない経路でも平坦な形で返す SHALL。

これ以外で代行先が応答を返したなら、その `status` を保持する SHALL——応答があるのにツールが別の値へ組み替えてはならない（MUST NOT）。

**引数の契約は `inputSchema` ではなくハンドラで担保する SHALL。** `inputSchema` に必須項目・`.enum()`・`.min()` / `.max()` を置いてはならない（MUST NOT）——MCP SDK はハンドラを呼ぶ**前**に `inputSchema` を検証し、通らない呼び出しは `status` も `errorCode` も持たない `isError` のテキストになる。上の表の1行目（400 `validation_error`）はその経路では到達できない。許容値と上限は `.describe()` の説明にだけ書き、代行先の要求を組み立てられるかの判定はハンドラで行う。

**型（`z.string()` / `z.array()` など）だけは残す。** 型を外すと引数の形が呼び手に一切伝わらず、`.describe()` の説明を掛ける先も無くなる。その代わり、**型が違う引数だけは平坦な結果にならない**——SDK が手前で弾く。これは承知のうえで残した限界であり、無くすには MCP の外側に引数の記述を持つ仕組みが要る。

`errorCode` は `unreachable`（届かない）と `upstream_malformed`（届いたが形が違う）を必ず別の値にする SHALL。前者は環境の問題で出し直しても無駄、後者はこちらのスキーマを直す問題であり、受け手の次の手が変わる。

**同じ状況には全ツールで同じ `errorCode` を使う SHALL。** 対象のセッションが無い（代行先の 404）はすべて `session_not_found` とし、ツールごとに別の値を割り当ててはならない（MUST NOT）——受け手は同じ原因に対して1つの分岐しか持てない。

代行先が、そのツールの契約に無いステータスで応答したときの `errorCode` は、代行先によって次のとおりとする SHALL。契約に載せた状況へ無理に寄せてはならない（MUST NOT）——たとえば代行先の 500 を `session_not_found` と報告すると、受け手は存在しない原因を直そうとする。

| 代行先 | `errorCode` |
|---|---|
| stroke-board 自身の endpoint（セッション API） | `unexpected_status` |
| 本家 dashboard | `upstream_error` |

本家の 400 だけは例外で、経路によらず `validation_error` とする SHALL——引数が本家の検証に通らなかったという意味は、どの経路を通っても同じである。

代行先が契約に載せた status を返しても、**その status に複数の意味がある場合は本文で区別する SHALL**。区別できない本文（既知のどれでもない）は契約に載せた状況へ寄せてはならない（MUST NOT）——`unexpected_status` とする。

**分けるのは、受け手が直せる対象が違うから。** 前者はこのリポジトリの endpoint が返した想定外で、この change の側で追える。後者は別プロセスの都合で、こちらのコードを直しても変わらない。どちらも代行先の実ステータスを保持する。

代行先の呼び出しがステータスを伴わずに失敗したときは `status: 502` とする SHALL（保持すべき応答が無いため）。これはどのツールの契約にも無いステータスなので、`errorCode` は上の規定どおり `unexpected_status` になる。**この場合も例外を投げてはならない（MUST NOT）**——例外はモジュールが `isError` のテキストへ畳むため、`status` も `errorCode` も持たない結果になり、常に平坦な形で返すという上の SHALL を破る。

専用の `errorCode` を新設しないのは、失敗の運び手（代行先の呼び出しを包む層）が status しか持たず、`errorCode` の写像は各ツールが持つためである。新しい値をそこへ通すには全ツールが拾う必要があり、拾えないツールが1本でもあれば「同じ状況に2つの `errorCode`」を作り直すことになる。

#### Scenario: 代行先の応答がある失敗は、その status を保つ

- **GIVEN** 本家 dashboard が稼働しており、要求に対して 500 を返す
- **WHEN** 本家へ代行するツールを実行する
- **THEN** 結果の `status` は 500 で、`errorCode` は `unreachable` ではない

#### Scenario: 結果スキーマが形に従っている

- **GIVEN** invoke.ts が起動した claude が `/mcp` へ接続している
- **WHEN** その接続で各ツールの結果スキーマの定義を取る
- **THEN** すべてのツールで `status` が必須項目にあり、失敗時の `errorCode` / `error` が定義されている

#### Scenario: 照合が外れたことが error から読める

- **GIVEN** 本家の一覧に1件以上のプロジェクトがあり、そのいずれも steering 工程の接続が持つパスに対応しない
- **WHEN** projectId を要する代行ツールを実行する
- **THEN** 結果は `status: 404` / `errorCode: project_not_registered` で、`error` には引き当てに使ったパスと、一覧が持っていたプロジェクトの名前とパスが含まれる

#### Scenario: 一覧が空のときも同じ errorCode で、本文が空であることを述べる

- **GIVEN** 本家の一覧が空である
- **WHEN** projectId を要する代行ツールを実行する
- **THEN** 結果は `status: 404` / `errorCode: project_not_registered` で、`error` から一覧が空だったことが読み取れ、直前のシナリオの本文とは区別できる

### Requirement: 代行は確定した方式であり、ツール側に第2の実装を作らない

MCP ツールのハンドラは、対応する endpoint へ要求を発行してその応答だけから結果を作る SHALL。セッション・プロジェクトのファイルを読み書きしてはならない（MUST NOT）。検証・状態遷移をツール側で行ってはならない（MUST NOT。ADR-0014）。

これは**暫定の段ではない**。次の段として実処理へ置き換えることを想定してはならない（MUST NOT）。置き換えの動機とされていた2つは、いずれも成り立たない。

- 「自プロセスへの HTTP 往復を外す」——**往復は存在しない**。Nitro の `$fetch` は先頭が `/` のパスをソケットを開かずにハンドラへ直接渡す（`nitropack` の `localFetch`）
- 「transport を載せ替える」——**既に** Nitro の Streamable HTTP（route `/mcp`）である

#### Scenario: ハンドラが状態を直接触らない

- **WHEN** ツールが対象の状態を必要とする
- **THEN** 対応する endpoint への要求で得ており、ファイルからも内部実装の直接呼び出しからも得ていない

#### Scenario: 同じ検証が2箇所に無い

- **WHEN** 引数が endpoint の受け入れ条件を満たさない
- **THEN** 弾くのは endpoint であり、ツール側は endpoint の応答をそのまま結果に写している
