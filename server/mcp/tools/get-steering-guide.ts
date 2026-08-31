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

1本ずつ作る。1本提出したら結果の \`status\` を見て、受理されたことを確かめてから次へ進む。
3本まとめて組み立ててから提出しない——途中で失敗したとき、どこまで通ったか分からなくなる。

## 3. 提出する

\`submit-document\` に \`type: "steering"\` と \`name\`（\`product\` / \`tech\` / \`structure\` の
いずれか）を付けて提出する。本文は markdown の全文で、差分ではない。

## 4. 1本を終わりとみなす基準

次の両方を満たしたら、その文書は書き終わりである。

- 上の表の「書くこと」に挙げた論点すべてに、埋めた答えがある
- 読んだ者が、その文書だけで判断できる（他の文書を読まないと意味が取れない記述が無い）

分量で測らない。長く書くことが目的ではない。

## 5. うまくいかないとき

ツールの結果は必ず \`status\` を持ち、失敗のときは \`errorCode\` と \`error\` も持つ。
**\`exists\` が入っていない結果は失敗である。** \`status\` を見ずに次へ進まないこと。

| \`errorCode\` | 意味 | どうするか |
|---|---|---|
| \`project_not_registered\` | 本家がこのプロジェクトを見つけられない | **何もせずに終わる。** 環境の問題で、書いても届かない |
| \`unreachable\` | 本家に届かない | 同上。**何もせずに終わる** |
| \`upstream_error\` | 本家が拒否した | \`error\` を読む。文書の形の問題なら直して出し直す |
| \`upstream_malformed\` | 本家の応答の形がおかしい | 環境の問題。**何もせずに終わる** |
| \`validation_error\` | 引数が受け入れられなかった | \`name\` と \`type\` を確かめて出し直す |
| \`unauthorized\` | 接続が無効になった | サーバーが再起動した。**何もせずに終わる** |

**同じ失敗を繰り返さない。** 2度同じ \`errorCode\` が返ったら、その手は諦めて終わる。
ファイルを直接書いて回避しない——それは提出を経ていないので、この工程の成果にならない。

## 6. どこで工程が終わるか

3本すべてが受理された時点で、この工程は終わりである。完了を自分で宣言しない
——実行の終わりはサーバーが検知する。

## 本家 MCP は使わない

この工程には本家 spec-workflow の MCP も配線されているが、**この工程では1つも呼ばない。**
steering 文書の取得と提出は、上に挙げた stroke-board のツールだけを使う。本家の
\`steering-guide\` が返す手順は本家のワークフロー向けで、提出の入口が違う。食い違ったら
この手順が正しい。

**\`approvals\` も呼ばない。** 承認依頼を出すと本家は「口頭の承認は受け付けない。
\`status\` で問い合わせ続けろ」と返す（本家 2.2.5 の \`dist/tools/approvals.js\`。
santa-method レビュー 8周目 2026-08-30 に読んで確認）。無人の実行はそのまま待ち続けて
打ち切られる。この工程の終わりは3文書が受理されたときで、承認は終わりの条件ではない。

## やらないこと

- ファイルを直接読み書きして文書を作らない。取得も提出もツールを通す
- 3本以外の文書を作らない
`

export default defineStrokeTool({
  description:
    'steering 文書の作り方（手順）を取得する。**他のどのツールよりも先に、起動したらまずこれを呼ぶこと。**'
    + ' 3文書の役割・作る順序・提出の仕方・終わりの判定が入っている。引数は取らない',
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
