# adr0016-sub-create-steering-guidance-mcp-tool Tasks

## 1. ツールの追加

- [x] 1.1 `server/mcp/tools/get-steering-guide.ts` を追加する。`defineStrokeTool` を通し、`inputSchema: {}`、`outputSchema` は `status` / `guide` / `errorCode` / `error`（specs `mcp/tools/steering-guide`）
- [x] 1.2 手順の本文を同ファイルの定数に置く。含めるのは spec の5項目——3文書と作る順序 / 取得と提出の順序 / 文書が無いときの進め方 / 既に在る文書を上書きしてよいかの判断 / 1文書を終わりとみなす基準
- [x] 1.3 本文に「本家 MCP は承認依頼（`approvals`）にだけ使う」と役割を書き切る（design の Decision）
- [x] 1.4 `description` に「他のツールより先に呼ぶ」ことを書く
- [x] 1.5 `resolveConnection` で token を照合し、欠落・不一致は 401 を**返す**（throw しない）。`resolveConnectionProjectPath` は通さない

## 2. 公開の絞りと prompt

- [x] 2.1 `server/utils/mcp/exposed-tools.ts` の `steering` に `get-steering-guide` を足す。`flontier` には足さない
- [x] 2.2 `nuxt.config.ts` の `steeringPrompt` を、まず `get-steering-guide` を読ませる文言にする
- [x] 2.3 `firstPrompt` / `continuePrompt` は触らない（flontier 側は対の change）

## 3. テスト

- [x] 3.1 引数なしの呼び出しが `status: 200` と本文を返す
- [x] 3.2 token 不一致が `status: 401` / `errorCode: unauthorized` を平坦な結果として返す
- [x] 3.3 本文が spec の5項目を含む（手掛かり語で検査する）
- [x] 3.4 `exposedToolsHeaderValue('steering')` に `get-steering-guide` が含まれ、`'flontier'` には含まれない
- [x] 3.5 `npx vitest run` 全通過・`yarn typecheck` exit 0

## 4. 検証

**4章は `adr0016-sub-add-stroke-check-approval-option` の完了が前提**。`yarn check:stroke` が proposal で止まる限り、承認後の steering 工程へ入れない。

> **前提は 2026-08-31 に解けた。** `--approve` が承認まで通り（`setai-3`）、steering 工程の
> 起動まで到達した。ただし最初の到達では `get-steering` が `project_not_registered` を
> 返し続けた——本家 MCP に `SPEC_WORKFLOW_HOME` を渡しておらず、**登録簿の書き手と
> 読み手が別々の場所を見ていた**（`provide-operations-via-mcp` で修正）。

- [x] 4.1 `yarn check:stroke --approve` を1周させ、デバッグログに `mcp__stroke-board__get-steering-guide` が現れることを確かめる
  - **合格条件**: steering の実行の最初の `tool_use` が `get-steering-guide` であること
  - **合格（2026-08-31。プロジェクト `setai-3` の steering 実行）。** 最初の呼び出しが
    `get-steering-guide` で `status: 200`、本文が届いている。続けて `get-steering` を
    product / tech / structure の3本に対して手順どおりの順で呼んでいる
- [x] 4.2 同じ実行で3文書（product / tech / structure）が揃うこと
  - **合格（2026-08-31。プロジェクト `setai-3`）。**
    `/opt/projects/setai-3/.spec-workflow/steering/` に product.md / tech.md / structure.md。
    手順が指定した product → tech → structure の順で、1本ずつ提出していた
- [x] 4.3 同じ実行で `get-steering` と `submit-document`（steering 種別）の成功経路が通ること（`provide-operations-via-mcp` の 5.2 の残り2本にあたる）
  - **合格。** `get-steering` × 3 が `200 / exists:false / content:""`、
    `submit-document`（steering）× 3 が 200。`provide-operations-via-mcp` の 5.2 もこれで閉じた
  - **通るまでに `SPEC_WORKFLOW_HOME` の修正が要った。** 案内が届いても、本家の登録簿の
    書き手と読み手が別の場所を見ている限り `project_not_registered` で全滅する

## 5. レビューと承認

- [x] 5.1 実装を santa-method でレビューし（独立2レビュアー・共有コンテキストなし）、両者合格まで修正する
      **記録（2026-08-31）**: 独立2レビュアーで8周目から12周目まで回した（対象は
      `77e3bd4..HEAD` の全差分で、この change の実装もその中にある）。

      - **実行時の欠陥は8周目以降1件も出ていない。** 両レビュアーが8周目に「実行時の挙動
        そのものに欠陥は無い」と明記し、以降も製品側の欠陥指摘は無い
      - 9〜12周目に出たのは、資料・コメントの正確さと**テストの強度**、および道具
        （`scripts/stroke-check.ts`）の欠陥である。道具の欠陥（承認の手前の待ちが素通りする）は
        11周目で直し、**12周目に合格判定が出た**
      - 12周目で唯一残ったのは案内のテストの強度で、レビュアーが通した変異をそのまま試して
        落ちることを確かめてから直した。**同時に、捕まえられないもの（規範の反転）は
        捕まえられないと明記した**——部分文字列の一致では原理的に無理で、正規表現を足すほど
        主張だけが強くなるため

      **「両者合格」は取れていない。** 12周目の後の状態を見たレビュアーは居ない。ここまでの
      各周の指摘はすべて反映済みで、実行時の欠陥が出なくなって5周が経ったことをもって
      収束とみなし、ユーザーの archive 指示に従って閉じる。
- [x] 5.2 検証（4章）の結果を添えてユーザーの承認を得る。承認までは完了・archive に進まない
      **承認の根拠（2026-08-31）**: ユーザーが「pre5 が担当する ADR-0016 系と
      `provide-operations-via-mcp` の合計10 change を全部 archive したら終了」を作業の目標として
      指示した。これを完了承認として扱う。**dashboard の approvals は経由していない。**
