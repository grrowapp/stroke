import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { resolveConnection } from '../../utils/mcp/connection-table'

/**
 * steering 工程（承認で昇格したプロジェクトで product / tech / structure を作る工程。
 * ADR-0011）の手順を渡すツール。specs `mcp/tools/steering-guide`。
 *
 * flontier 側の `get-guide.ts` と対。形（引数なし・状態非依存の本文・定数 200）と理由は
 * そちらの冒頭に書いてあるものと同じである。
 *
 * **本家 MCP の `steering-guide` があるのに自前を持つ理由。** 本家の手順は本家のワークフロー
 * （`.spec-workflow/` の構造・dashboard での承認）を前提に書かれていて、提出の入口が違う。
 * 本家の手順どおりに進めると、エージェントは本家の文書作成ツールを探すかファイルを直接
 * 書こうとする——どちらも `submit-document` を通らない（design.md の Decision）。
 */
const GUIDE = `# steering 文書の作り方

あなたは、承認されたプロジェクトの steering 文書を作る。対象は次の3本で、これで全部である。

| 名前 | 書くこと |
|---|---|
| \`product\` | 何のための製品か。誰が使い、何が価値で、何を目指すか |
| \`tech\` | 何で作るか。言語・フレームワーク・依存・動かし方の制約 |
| \`structure\` | どう並べるか。ディレクトリの区切り・命名・置き場の規約 |

## 1. 状況を確認する

まず \`get-steering\` を3本それぞれについて呼び、\`exists\` を見る。

- \`exists: false\` — まだ無い。新しく書く
- \`exists: true\` — 既に在る。**中身を読んでから判断する。**
  すでに書かれている内容を、より薄いもので上書きしない。足りないところを足す形で書き直す

## 2. 書く順序

**product → tech → structure の順**で作る。tech は product が決めた目的に従い、structure は
tech が決めた道具に従うので、後ろの2本は前を読まないと決まらない。

1本ずつ作る。1本提出したら結果の \`status\` を見て、受理されたことを確かめ、その文書の
承認依頼を出してから次へ進む。並びは **product → 承認依頼 → tech → 承認依頼 → structure →
承認依頼** である。3本まとめて組み立ててから提出しない——途中で失敗したとき、どこまで
通ったか分からなくなる。

## 3. 提出する

\`submit-document\` に \`type: "steering"\` と \`name\`（\`product\` / \`tech\` / \`structure\` の
いずれか）を付けて提出する。本文は markdown の全文で、差分ではない。

### 3-1. 承認依頼を出す

提出が受理されたら（結果の \`status\` が 2xx）、**その文書の承認依頼を本家 spec-workflow の
MCP ツール \`approvals\` で出す。** 引数は次のとおり。

| 引数 | 値 |
|---|---|
| \`action\` | \`"request"\` |
| \`filePath\` | \`".spec-workflow/steering/<name>.md"\`（プロジェクトルートからの相対パス。\`<name>\` は提出した文書名） |
| \`title\` | 文書名が分かる短い題（例: \`"steering: product"\`） |
| \`type\` | \`"document"\` |
| \`category\` | \`"steering"\` |
| \`categoryName\` | \`"steering"\` |

**承認依頼は受理された文書にだけ出す。** 本家は依頼の時点で対象のファイルを読むので、
受理されていない文書への依頼は成立しない。

**承認を待たない。** \`approvals\` ツールの説明は「ユーザーの承認を待て」と言うが、この工程では
待たない。承認はユーザーが後で行うもので、工程の終わりの条件ではない。依頼を出したら
すぐ次の文書へ進む。

## 4. 1本を終わりとみなす基準

次の両方を満たしたら、その文書は書き終わりである。

- 上の表の「書くこと」に挙げた論点すべてに、埋めた答えがある
- 読んだ者が、その文書だけで判断できる（他の文書を読まないと意味が取れない記述が無い）

分量で測らない。長く書くことが目的ではない。

## 5. うまくいかないとき

ツールの結果は必ず \`status\` を持ち、失敗のときは \`errorCode\` と \`error\` も持つ。
**\`status\` と \`errorCode\` で判断する。** \`get-steering\` が成功したときだけ \`exists\` が入る
——\`submit-document\` の成功には入らないので、\`exists\` の有無で成否を測らないこと。

| \`errorCode\` | 意味 | どうするか |
|---|---|---|
| \`project_not_registered\` | 本家がこのプロジェクトを見つけられない | **何もせずに終わる。** 環境の問題で、書いても届かない |
| \`unreachable\` | 本家に届かない | 同上。**何もせずに終わる** |
| \`upstream_error\` | 本家が拒否した | \`error\` を読む。文書の形の問題なら直して出し直す |
| \`upstream_malformed\` | 本家の応答の形がおかしい | 環境の問題。**何もせずに終わる** |
| \`validation_error\` | 引数が受け入れられなかった | \`name\` と \`type\` を確かめて出し直す |
| \`unauthorized\` | 接続が無効になった | サーバーが再起動した。**何もせずに終わる** |
| \`connection_mismatch\` | この接続の工程では使えない引数だった | \`submit-document\` の \`type\` を間違えている。この工程では \`"steering"\` である |

**同じ失敗を繰り返さない。** 2度同じ \`errorCode\` が返ったら、その手は諦めて終わる。
ファイルを直接書いて回避しない——それは提出を経ていないので、この工程の成果にならない。

上の表は stroke-board のツールの契約である。**本家の \`approvals\` ツールは本家自身の結果の
形で返し、\`status\` も \`errorCode\` も持たない。** 成否はその結果の本文（依頼の id が返った
か、エラーの文言か）で判断する。

## 6. どこで工程が終わるか

**3本すべてが受理され、かつその3本それぞれに承認依頼を出した時点**で、この工程は終わりである。
承認依頼を出していない文書が1本でも残っていれば、工程はまだ終わっていない——残る文書の
承認依頼を出す。承認の結果は終わりの条件に含まれない。完了を自分で宣言しない
——実行の終わりはサーバーが検知する。

## 本家 MCP で使うのは \`approvals\`

本家 spec-workflow の MCP はこの工程に配線されていて、使うのは承認依頼の \`approvals\`
ツールである。プロジェクトは起動の前にサーバーが本家へ登録済みで、この工程で本家に何かを
登録する必要は無い。

steering 文書の取得と提出は、上に挙げた stroke-board のツールを使う。本家のワークフロー
（\`.spec-workflow/\` の構造・dashboard での承認）の手順とは提出の入口が違い、本家のツールで
文書を書かない。本家のツールを使うのは承認依頼（3-1）である。

## やらないこと

- ファイルを直接読み書きして文書を作らない。取得も提出もツールを通す
- 3本以外の文書を作らない
- 承認依頼を出さずに終わらない。承認の結果を待たない
`

export default defineStrokeTool({
  description:
    'steering 文書の作り方（手順）を取得する。**他のどのツールよりも先に、起動したらまずこれを呼ぶこと。**'
    + ' 3文書の役割・作る順序・提出の仕方・承認依頼の出し方・終わりの判定が入っている。引数は取らない',
  inputSchema: {},
  outputSchema: {
    status: z.number(),
    guide: z.string().optional(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (_args, extra) => {
    // 接続の正当性は見るが、接続の中身（プロジェクトパス）は見ない。手順は状態に
    // 依存しない（spec の SHALL）ので `resolveConnectionProjectPath` を通さない。
    const resolved = resolveConnection(extra.requestInfo?.headers ?? {})
    if (!resolved.ok) {
      return { status: resolved.status, errorCode: resolved.errorCode, error: resolved.error }
    }

    return { status: 200, guide: GUIDE }
  },
})
