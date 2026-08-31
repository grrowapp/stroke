# adr0016-sub-create-steering-guidance-mcp-tool Design

## Context

- MCP サーバー本体・ツールの形・工程ごとの公開の絞りは `provide-operations-via-mcp` で確定済み（`server/mcp/tools/` の6本、`server/utils/mcp/exposed-tools.ts`、`defineStrokeTool`）
- steering 工程は承認で昇格したプロジェクトを cwd に、`--mcp-config` へ本家 spec-workflow MCP と自前 MCP を並べて起動する（ADR-0011、`server/utils/stroke/invoke.ts` の `buildRun`）
- 動機と範囲は proposal.md を参照。spec は `specs/mcp/tools/steering-guide/spec.md`
- 用語: 「3文書」= product / tech / structure。「本家 MCP」= spec-workflow-mcp

## Goals / Non-Goals

**Goals:**

- steering 工程のエージェントが、起動直後に手順を1回のツール呼び出しで読める状態にする
- flontier 側（`adr0016-sub-create-flontier-guidance-mcp-tool`）と同じ形にし、両工程で案内の届け方を揃える

**Non-Goals:**

- 本家 MCP の `steering-guide` ツールを使うこと（下の Decision を参照）
- 承認依頼の作成の仕組みの変更（本家 MCP の `approvals` を併用したまま）
- flontier 工程の案内（対の change）

## Decisions

### Decision: 本家 MCP の `steering-guide` を使わず、自前のツールを持つ

本家 spec-workflow MCP には `steering-guide` があり、steering 工程には既に配線されている。それでも自前のツールを足す。

本家の手順は**本家のワークフロー**（`.spec-workflow/` の構造・承認カード・dashboard での承認）を前提に書かれている。こちらの工程は「stroke-board が承認で昇格させたプロジェクトに対し、`submit-document` の steering 種別で書く」ものであり、提出の入口が違う。本家の手順どおりに進めると、エージェントは本家 MCP の文書作成ツールを探すか、ファイルを直接書こうとする——どちらも `submit-document` を通らない。

本家の手順を上書きせず**並べて配る**案も不採用。2つの手順が同時に見えると、どちらに従うかがエージェント任せになる。自前の手順の中で「本家 MCP は承認依頼（`approvals`）にだけ使う」と役割を書き切る。

### Decision: 手順の本文はツールのソースに定数として持つ

flontier 側と同じ判断。設定（`settings-reference.md` の対象）にも別ファイルにもしない。手順はツールの契約と同時に変わるので、同じ change で一緒に動くものを別の器に分けない。

### Decision: 案内も接続 token を要求し、接続の中身は見ない

`resolveConnection` を通して 401 は平坦な結果で返す。`resolveConnectionProjectPath` は通さない——手順は状態に依存しない（spec の SHALL）ので、プロジェクトパスを必要としない。

### Decision: `steeringPrompt` は「まず `get-steering-guide` を読め」に統一する

`provide-operations-via-mcp` が実体の無い `/write-steering-v2` の起動を外した後、`steeringPrompt` は「MCP ツールで文書の状況を確認し、3文書を作れ」という短い定型になっている。ここを手順を読む指示へ差し替える。

prompt に手順そのものを書き込む案は不採用——本文が prompt（設定）とツール（コード）の2箇所になる。**その二重化がまさに `/write-steering-v2` の失敗の形**で、設定側だけが実体を失っても誰も気付かなかった。

## Risks / Trade-offs

- [検証が `adr0016-sub-add-stroke-check-approval-option` の完了を待つ] → `yarn check:stroke --approve` が通るまで、steering 工程を実機で1周させられない。単体テストと `get-steering` / `submit-document` の契約テストで先行し、実機の確認は前提が解けてから行う
- [本家 MCP の手順と食い違う] → 自前の手順に「本家 MCP は `approvals` にだけ使う」と明記する。食い違ったらこちらが勝つ
- [3文書のどれかで失敗したまま終わる] → 手順に「1文書ずつ提出し、結果の `status` を見てから次へ進む」と書く。**着地の判定（3本揃ったか）は道具側（`yarn check:stroke`）が見る**ので、エージェントの自己申告に頼らない

## Migration Plan

1. `server/mcp/tools/get-steering-guide.ts` を追加する（本文の定数・`outputSchema`・`resolveConnection` の 401）
2. `server/utils/mcp/exposed-tools.ts` の steering に `get-steering-guide` を足す。flontier には足さない
3. `nuxt.config.ts` の `steeringPrompt` を、まず `get-steering-guide` を読ませる文言にする
4. 単体テスト（引数なしの成功・token 不一致の 401・本文が spec の5項目を含む・公開の絞り）
5. 前提が解けたら実機で `yarn check:stroke --approve` を1周させ、デバッグログに `get-steering-guide` が最初の `tool_use` として現れ、3文書が揃うことを確かめる

戻すときは3つの変更を外す。案内が届かない状態（現状）へ戻るだけである。
