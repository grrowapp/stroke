import { z } from 'zod'
import { defineStrokeTool } from '../../utils/mcp/define-tool'

import { resolveConnection } from '../../utils/mcp/connection-table'

/**
 * flontier 工程（ストロークの往復）の手順を渡すツール。specs `mcp/tools/guide`。
 *
 * **代行先を持たない唯一のツールである。** 他は既存 REST への薄いプロキシで実処理は
 * endpoint 側にあるが（ADR-0014）、手順の本文はどの endpoint も持っていない。ADR-0014 の
 * 「第2の実装を作らない」に反しないのは、どこにも第1の実装が無いからである。
 *
 * 本文はソースの定数で持つ。設定（`docs/specs/core/settings-reference.md`）にも別ファイルにも
 * しない——手順はツールの契約と同時に変わるので、同じ change で一緒に動くものを別の器に
 * 分けると片方だけが古くなる（design.md の Decision）。`/write-steering-v2` は
 * まさにその失敗で、設定側だけが実体を失っても誰も気付かなかった。
 *
 * 本文は**状態に依存しない**（spec の SHALL）。概要・これまでの往復・差し戻しは取得ツールが
 * 返すもので、このツールは手順だけを返す。だから接続の正当性（token）は見るが、接続の中身
 * （セッション id）は見ない——`resolveConnectionSessionId` を通さないのはそのためである。
 */

/**
 * 上限の数値をここに書かない。正は `send-question` の `inputSchema` の `.describe()` で、
 * 書き写すと2箇所になり片方だけが古くなる（`provide-operations-via-mcp` design.md
 * 「入力の上限・許容値は `.describe()` に契約の説明として書く」）。
 */
const GUIDE = `# ストロークの進め方

あなたは、ユーザーが投げた「作りたいシステムの説明」（概要）から、実装に入れる proposal を
書き上げるまでを担当する。ユーザーとは問いの往復でやり取りする。

## 1. 状態を確認する

提出より先に、必ず次の順で読む。

1. \`get-overview\` — ユーザーが最初に投げた概要。これが出発点である
2. \`get-strokes\` — これまでの往復の記録（あなたが立てた問いと、ユーザーの答え）。
   継続の起動では、ここに前回までの合意が入っている
3. \`get-send-back\` — 差し戻し。無ければ 404 が返る（それが正常である）

## 2. 問いを立てる

概要だけで実装に入れないなら、\`send-question\` で問う。

- **一度に1問**。複数の論点をまとめて投げない。ユーザーは選択肢から選ぶだけで答えられる
  形を期待している
- 各項目（見出し・詳細・問い・選択肢）の**長さと件数の上限は \`send-question\` の引数の
  説明に書いてある**。読んでから組み立てる。超えると 400 で弾かれ、どこが超えたかが
  応答に入る
- 問いは**設計判断**を扱う。「テスト」「確認です」のような疎通確認の問いを投げない。
  往復の回数を消費するだけで、proposal は1文字も進まない
- 選択肢には、あなたが推す案を先頭に置き、それぞれ何が変わるかを書く

問いを1つ提出したら、その実行は終わりである。ユーザーの答えは次の起動で
\`get-strokes\` から読む。

## 3. 把握完了を判定する

次の3つが揃ったら、問うのをやめて proposal へ移る。

- 何を作るかが1文で言える
- 主要な設計判断（構成・使う道具・対象の範囲）にユーザーの答えが付いている
- 残っている不明点が、実装しながら決めてよい粒度に収まっている

**答えが出ないまま同じ論点を問い直さない。** ユーザーが選択肢のどれかを選んだら、
その判断は確定したものとして扱う。

## 4. proposal を提出する

\`submit-document\` に \`type: "flontier"\` で提出する。本文に含めるもの:

- **なぜ作るのか**（Why）— 概要とユーザーの答えから導く。「言われたから」では不足である
- **何を作るのか**（What）— 対象の範囲と、範囲外を明示する
- **どう作るのか**（How）— 構成・使う道具・主要な判断とその理由
- **決めていないこと** — 実装しながら決める前提で残す点

提出が受理されればその実行は終わりである。以後はユーザーの承認か差し戻しを待つ。

## 5. 差し戻しを受けたら

\`get-send-back\` が指摘を返す。

- 指摘は**そのまま直す対象**である。解釈を広げて別の提案に作り替えない
- 指摘の意図が分からないなら、直す前に \`send-question\` で1問だけ確かめる
- 直したら \`submit-document\` で出し直す。差分ではなく**proposal 全文**を出す

## いま作る段を確かめる

この手順は工程の全体を書いたものである。**いま作る成果物とその指示**は、セッションの
ワークフロー定義が持っている。

\`\`\`
openspec instructions stroke --json     # 質疑応答の段
openspec instructions proposal --json   # proposal の段
\`\`\`

cwd はセッションのディレクトリで、そのまま実行できる。定義は運用者が編集するもので、
**編集は次の起動から効く**。手順とここが食い違ったら、定義の側が新しい。

## やらないこと

- ファイルを直接読み書きして状態を知ろうとしない。状態はここに挙げたツールだけが返す
- 提出も取得もツール以外の手段（コマンド実行など）で真似しない
- 完了を自分で宣言しない。実行の終わりはサーバーが検知する
`

export default defineStrokeTool({
  description:
    'ストロークの進め方（手順）を取得する。**他のどのツールよりも先に、起動したらまずこれを呼ぶこと。**'
    + ' 状態の確認から proposal の提出までの順序・問いの立て方・把握完了の判定・差し戻しの扱いが入っている。引数は取らない',
  inputSchema: {},
  outputSchema: {
    status: z.number(),
    guide: z.string().optional(),
    errorCode: z.string().optional(),
    error: z.string().optional(),
  },
  handler: async (_args, extra) => {
    // token の欠落・不一致も throw せず平坦なエラーで返す（理由は `connection-table.ts`）。
    // 手順そのものは秘密ではないが、`/mcp` の全ツールが同じ入口の規則に従う
    // （specs `mcp/server`）——ツールごとに例外を作ると、次に足す者が倣う先を失う。
    const resolved = resolveConnection(extra.requestInfo?.headers ?? {})
    if (!resolved.ok) {
      return { status: resolved.status, errorCode: resolved.errorCode, error: resolved.error }
    }

    // 代行先が無いので `status` を導く応答も無い。**ここだけは定数の 200 でよい**
    // ——「代行先が応答を返したなら、その status を保持する」（specs `mcp/server`）は
    // 代行するツールへの SHALL で、代行しないこのツールには掛からない。
    return { status: 200, guide: GUIDE }
  },
})
