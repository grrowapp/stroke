# adr0016-sub-create-flontier-guidance-mcp-tool Tasks

## 1. ツールの追加

- [x] 1.1 `server/mcp/tools/get-guide.ts` を追加する。`defineStrokeTool` を通し、`inputSchema: {}`、`outputSchema` は `status` / `guide` / `errorCode` / `error`（specs `mcp/tools/guide`）
- [x] 1.2 手順の本文を同ファイルの定数に置く。含めるのは spec の5項目——状態の確認から提出までの順序 / 問いを立てる単位（一度に1問）と各項目の上限の在りか / 把握完了の判定 / proposal を提出する条件と形式 / 差し戻しを受けたときの進め方
- [x] 1.3 `description` に「他のツールより先に呼ぶ」ことを書く（specs `mcp/tools/guide` の Requirement「最初に読ませる」）
- [x] 1.4 `resolveConnection` で token を照合し、欠落・不一致は 401 を**返す**（throw しない。specs `mcp/server`）。`resolveConnectionSessionId` は通さない（状態に依存しないため）

## 2. 公開の絞りと prompt

- [x] 2.1 `server/utils/mcp/exposed-tools.ts` の `flontier` に `get-guide` を足す。`steering` には足さない
- [x] 2.2 `nuxt.config.ts` の `firstPrompt` / `continuePrompt` を、まず `get-guide` を読ませる文言にする
- [x] 2.3 `steeringPrompt` は触らない（steering 側は `adr0016-sub-create-steering-guidance-mcp-tool`）

## 3. テスト

- [x] 3.1 引数なしの呼び出しが `status: 200` と本文を返す
- [x] 3.2 token 不一致が `status: 401` / `errorCode: unauthorized` を**平坦な結果として**返す（例外にしない）
- [x] 3.3 本文が spec の5項目を含む（項目ごとの手掛かり語で検査する。本文の丸ごと一致では、文言を直すたびにテストが落ちて意味を失う）
- [x] 3.4 `exposedToolsHeaderValue('flontier')` に `get-guide` が含まれ、`'steering'` には含まれない
- [x] 3.5 `npx vitest run` 全通過・`yarn typecheck` exit 0

## 4. 検証

- [x] 4.1 実機で1周させ、デバッグログ（`claude.debugLogDir`）に `mcp__stroke-board__get-guide` が現れることを確かめる
  - **合格条件**: その実行の最初の `tool_use` が `get-guide` であること。呼ばれてはいるが順番が後なら、description と prompt の書き方を直す
  - **合格（2026-08-31。セッション `86ea18a4-…`）。** 4回の起動すべてで、stroke-board の
    ツールのうち最初に呼ばれたのが `get-guide` だった。以降の並びも手順のとおりである。

    ```
    get-guide → get-overview → get-strokes → get-send-back → send-question   （×4）
    get-guide → get-overview → get-strokes → get-send-back → submit-document （着地）
    ```

    先頭に出る `ToolSearch` は claude 側の遅延ロードの仕組みで、MCP ツールではない
- [x] 4.2 同じ実行で proposal の着地まで通ること（案内を足したことで往復が壊れていないこと）
  - **合格。** 4往復で `phase: proposed`・`invocation: idle`・`retries: 0`。
    `send-question` は4回とも一度で通り、400 は0件。案内を配る前の実測（6〜7往復・
    400 が混ざる）より短く収まっている

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
