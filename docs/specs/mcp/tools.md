# MCP ツールの契約

stroke-board 自身が提供する MCP サーバー（route `/mcp`、Streamable HTTP）の定義。**claude プロセスとサーバーの境界**を扱う。画面・エージェントとサーバーの境界は [contract.md](./contract.md) の側にある。

操作の入口はこれだけである。ファイルの直読み・直書きも、コマンドによる代行も採らない。

## 提供の形

| 項目 | 値 |
|---|---|
| route | `/mcp`（`@nuxtjs/mcp-toolkit` の既定） |
| transport | Streamable HTTP |
| ツール定義の置き場 | `server/mcp/tools/`（ファイル名 = ツール名） |
| claude 側の名前 | `mcp__stroke-board__<ツール名>` |

ツール定義は `defineStrokeTool`（`server/utils/mcp/define-tool.ts`）を通す。素の `defineMcpTool` を直に使うと `outputSchema` を宣言したツールが1本も動かない——モジュールが結果を `structuredContent` に包まないため、MCP SDK が弾く。

## ツール一覧

代行するもの6本と、代行先を持たない案内2本。

| ツール | 内容 | 代行先 |
|---|---|---|
| `get-guide` | flontier 工程の手順 | （無し。本文はツールの定数） |
| `get-overview` | 概要の取得 | `GET /api/strokes/:id/overview` |
| `get-strokes` | ストローク記録の取得 | `GET /api/sessions/:id/strokes` |
| `get-send-back` | 差し戻しの取得 | `GET /api/strokes/:id/send-back` |
| `send-question` | 問いの提出 | `POST /api/strokes/:id/question` |
| `submit-document` | 文書の提出（種別 `flontier` / `steering`） | `POST /api/strokes/:id/proposal` / 本家 `PUT /api/projects/:projectId/steering/:name` |
| `get-steering-guide` | steering 工程の手順 | （無し。本文はツールの定数） |
| `get-steering` | steering 文書の取得 | 本家 `GET /api/projects/:projectId/steering/:name` ＋ `GET /api/projects/:projectId/info` |

**代行するツールは、対応する endpoint の応答だけから結果を作る。** 検証も状態遷移も endpoint 側にあり、ツール側に第2の実装を置かない（[ADR 0014](../../adr/0014-api-has-no-implicit-state-branching.md)）。同一プロセスでも endpoint を経由するのは、busy ガードと前提チェックを通すためである。

案内の2本だけが代行先を持たない。手順の本文はどの endpoint も持っていないためで、ADR 0014 に反しない——どこにも第1の実装が無い。

## 結果の形

**すべてのツールが、成功でも失敗でも1階層の同じ形を返す。** 種類の列挙（成功/エラー/不達の排他形）にはしない。

| 項目 | いつ持つか | 意味 |
|---|---|---|
| `status` | 常に | HTTP ステータスコード。代行先が応答を返したならその値を保持する（定数を置かない） |
| `errorCode` | 失敗時のみ | 機械可読の失敗種別。下の表 |
| `error` | 失敗時のみ | 相手が返したエラー本文。書き換え・省略・追加をしない |
| 結果スキーマの項目 | 成功時のみ | 例: `get-overview` は `overview`、案内は `guide` |

**ハンドラは例外を投げない。** 投げるとモジュールが `isError` のテキストへ畳み、`status` を持たない結果になって上の形が崩れる。token の不一致も工程の食い違いも、平坦な失敗として返す。

引数の契約は `inputSchema` ではなくハンドラで担保する。MCP SDK は `inputSchema` を**ハンドラより前に**検証し、通らなければ例外を投げるので、必須項目や `enum` を宣言するとその経路でも形が崩れる。項目はすべて任意とし、長さ・件数の上限と許容値は `.describe()` に契約の説明として書く（正はそこ1箇所で、手順の本文には書き写さない）。

## `errorCode`

**同じ状況には全ツールで同じ値を使う。** 契約に載せた状況へ無理に寄せない——見覚えのない応答は `unexpected_status` とする。

「出どころ」が**ツール自身**になるのは、代行先へ要求を出せないときだけである。`submit-document` の `type` の欠落・規定外（振り分け先が決まらない）と、`get-steering` / `submit-document` の届かない `name`（`''` / `.` / `..`。URL を組み立てられない）がこれにあたる。値そのものの妥当性は代行先が判定する（ADR 0014）。寄せると、受け手は存在しない原因を直そうとする。

| 値 | status | 意味 | 出どころ |
|---|---|---|---|
| `unauthorized` | 401 | token が無い、または接続表に無い | 接続表 |
| `connection_mismatch` | 400 | その工程の接続文脈を持たない接続から呼ばれた | 接続表 |
| `validation_error` | 400 | 引数が受け入れ条件を満たさない | 代行先／ツール自身 |
| `session_not_found` | 404 | 対象のセッションが無い | セッション API |
| `no_overview` | 404 | 概要がまだ無い | セッション API |
| `no_send_back` | 404 | 差し戻しがまだ無い（正常な状態） | セッション API |
| `phase_conflict` | 409 | いまの `phase` では受け付けられない | セッション API |
| `unexpected_status` | 代行先の値 | 契約に載せていない応答 | どちらも |
| `project_not_registered` | 404 | 本家の一覧に対象のプロジェクトが無い | 本家 |
| `upstream_error` | 本家の値 | 本家が拒否した | 本家 |
| `upstream_malformed` | 502 | 本家が 2xx を返したが形が違う | 本家 |
| `unreachable` | 502 | 本家に届かない | 本家 |

**「相手が拒否した」と「相手に届かない」を分ける。** 前者は内容を直して出し直せるが、後者は出し直しても無駄で環境の問題である。`unreachable` は本家向けにだけ定める——stroke-board 自身は spawn 元なので、停止中にツールが実行される状況が成立しない。

**本家の応答だけは形を検証する。** 2xx でも形が違えば `upstream_malformed` を返す。自前の endpoint は同じリポジトリにあり応答が zod を通っているので検証しない——両方に検証を置くと同じ形の定義が2箇所になる。

## 工程ごとの公開

**接続ごとに、その工程で使うツールだけを見せる。** 一覧は `server/utils/mcp/exposed-tools.ts` の1箇所が持つ。

| 工程 | 公開されるツール |
|---|---|
| flontier | `get-guide` / `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document` |
| steering | `get-steering-guide` / `get-steering` / `submit-document` |

絞りは `--mcp-config` の `headers` に載せる `x-mcp-tools`（`,` 区切り）で行う。モジュールは request ごとにこのヘッダを読み、名前集合に含まれるツールだけで MCP サーバーを組み立てるので、`tools/list` にも `tools/call` にも効く。**一覧に無い名前が1つでもあると 400 で落ちる**ので、名前は `server/mcp/tools/` の実体と厳密に揃える。

全部を見せてツール側で工程を判定して拒否する形は採らない。呼べないものが一覧に出ていれば呼び手は呼ぶし、判別できるのは失敗した後になる（実測: 絞る前は `get-steering` が 51 回中 48 回失敗していた）。

## 接続の担保

| 項目 | 内容 |
|---|---|
| ヘッダ | `x-stroke-token` |
| 発行 | claude の spawn の直前。暗号学的に推測困難な乱数 |
| 持ち方 | Nitro プロセス内のメモリのみ。永続化しない |
| 失効 | その実行の終了時（正常・異常とも）。stroke-board の再起動で全エントリが失効する |
| 内容 | セッション id（flontier）またはプロジェクトパス（steering） |

**token の欠落・表に無い token は 401 で拒否し、既定値で補わない。** これにより、`/mcp` が route として外から見えていても、起動した claude 以外の呼び出しは通らない。

token は `--mcp-config` の JSON に載るので、**同一ホストの他ユーザーからは argv で読める**。単一ユーザーのマシンを前提に承知のうえで採っている。運用環境がそうでなくなったら見直す。

## 関連

- 起動フラグと定型 — [settings-reference.md](../core/settings-reference.md)
- セッション API の契約 — [contract.md](./contract.md)
- 決めの記録 — [ADR 0016](../../adr/0016-delegate-provide-operations-via-mcp.md)・[ADR 0014](../../adr/0014-api-has-no-implicit-state-branching.md)
