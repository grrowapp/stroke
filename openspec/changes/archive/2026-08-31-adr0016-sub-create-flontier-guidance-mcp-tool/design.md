# adr0016-sub-create-flontier-guidance-mcp-tool Design

## Context

- MCP サーバー本体・ツールの形・工程ごとの公開の絞りは `provide-operations-via-mcp` で確定済み（`server/mcp/tools/` の6本、`server/utils/mcp/exposed-tools.ts`、`defineStrokeTool`）
- 動機と範囲は proposal.md を参照。spec は `specs/mcp/tools/guide/spec.md`（`provide-operations-via-mcp` から移設。Requirement 3件）
- 用語: 「手順」= 工程の進め方の本文。「案内」と同義で使う。「操作系ツール」= 既存 REST への代行6本

## Goals / Non-Goals

**Goals:**

- flontier 工程のエージェントが、起動直後に手順を1回のツール呼び出しで読める状態にする
- 手順の本文をリポジトリの1箇所に持ち、prompt・スキル・スキーマの3箇所に散らばらせない

**Non-Goals:**

- ワークフロースキーマ `flontier-strokeflow` の instruction の書き換え（`adr0016-sub-switch-workflow-to-mcp-tools`）
- steering 工程の案内（`adr0016-sub-create-steering-guidance-mcp-tool`）
- 手順の本文をユーザーが設定で差し替えられるようにすること（設定にはしない。下の Decision を参照）

## Decisions

### Decision: 手順の本文はツールのソースに定数として持つ

`server/mcp/tools/get-guide.ts` の中に文字列定数として置き、設定にも別ファイルにもしない。

設定にしない理由は、`docs/specs/core/settings-reference.md`（ADR-0004）が設定の正であり、そこへ載せると**ストローク側設定として運用の対象になる**が、手順はツールの契約と同時に変わるものだからである。ツールの引数・結果の形が変われば手順も変わる。同じ change で一緒に動くものを、別の器（設定）に分けると片方だけが古くなる。

別ファイル（`assets/` や `docs/`）に置く案も不採用——読み込みの経路（パス解決・存在しないときの扱い）が増え、`--add-dir` を外した後の「実体の無いものを指す」失敗をもう一度作る。

### Decision: 案内も接続 token を要求する

`resolveConnection` を通し、token の欠落・不一致は 401 で拒否する。手順そのものは秘密ではないが、**`/mcp` の全ツールが同じ入口の規則に従う**ことを崩さない（`mcp/server` の Requirement）。ツールごとに例外を作ると、次に足す者がどちらに倣うか分からなくなる。

ただし `resolveConnectionSessionId` は通さない。手順は状態に依存しない（spec の SHALL）ので、セッション id を必要としない。**接続の正当性は見るが、接続の中身は見ない**という区別である。

### Decision: 工程ごとに別のツールにする

flontier は `get-guide`、steering は `get-steering-guide`（別 change）と、工程ごとにファイルを分ける。1本のツールが工程を見分けて本文を出し分ける案は不採用。

理由は `x-mcp-tools` の絞りに素直に乗るためである。公開ツールの一覧は工程ごとの配列（`exposed-tools.ts`）で、そこへ名前を並べるだけで済む。1本にすると、ツールの中で接続文脈の工程を読み、分岐し、間違った工程には失敗を返すことになる——それは `provide-operations-via-mcp` が `get-steering` で実測した破綻（51回中48回が 500）と同じ形である。

### Decision: prompt は「まず `get-guide` を読め」に統一する

`firstPrompt` / `continuePrompt` の先頭を、手順を読む指示にする。初回と継続で同じ入口にするのは、継続の起動でも会話の文脈が失われている可能性があるためで、読み直しの費用（1回のツール呼び出し）より取り違えの費用のほうが大きい。

prompt に手順そのものを書き込む案は不採用——本文が prompt（設定）とツール（コード）の2箇所になり、`settings-reference.md` の追随対象が増える。

## Risks / Trade-offs

- [手順が長くなるとツールの結果が肥大する] → 本文は工程の順序・上限・判定条件に絞り、例文や理由は載せない。上限の数値は `send-question` の `inputSchema` の `.describe()` が正で、手順はそれを繰り返さず「ツールの説明を読め」と指す
- [エージェントが `get-guide` を呼ばずに進む] → description で最初に呼ぶべきことを述べ（spec の SHALL）、prompt でも指示する。**強制はできない**——MCP に「先に呼ばせる」機構は無いので、呼ばれたかどうかはデバッグログで測る（tasks の検証）
- [手順とワークフロースキーマの instruction が二重になる] → `adr0016-sub-switch-workflow-to-mcp-tools` が instruction 側を「手順はツールで読め」に寄せる。本 change の時点では二重になる期間がある。取り違えが起きたら手順（ツール）が勝つ

## Migration Plan

1. `server/mcp/tools/get-guide.ts` を追加する。本文の定数・`outputSchema`（`status` / `guide`）・`resolveConnection` の 401 まで
2. `server/utils/mcp/exposed-tools.ts` の flontier に `get-guide` を足す。steering には足さない
3. `nuxt.config.ts` の `firstPrompt` / `continuePrompt` を、まず `get-guide` を読ませる文言にする
4. 単体テスト: 引数なしで 200 と本文が返ること・token 不一致で 401 になること・本文が spec の5項目を含むこと
5. 実機で1周させ、デバッグログに `mcp__stroke-board__get-guide` が**最初の tool_use として**現れることを確かめる

戻すときは3つの変更を外す。手順が届かない状態（現状）へ戻るだけで、往復そのものは止まらない。
