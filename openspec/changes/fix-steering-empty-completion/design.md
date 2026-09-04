# design

作る条件のうち **(b) 技術判断を先に要する曖昧さ**（steering の提出をどこで・どの単位で数えるか）と **(c) 上位資料への整合反映**（`docs/specs/architecture/session-workflow.md` の状態遷移図）に当たるため書く（`docs/agents/issue-tracker.md`「artifact」）。

## Context

動機は proposal.md「Why」。ここには**ソースを読んで確かめた現状**だけを置く（実装は `/home/vagrant/work/stroke-board/pre5` を読んだ。2026-09-01）。

- `server/utils/stroke/ai.ts` の `AiRun.didWork?: () => boolean` は**省略可能**で、省略時は常に「作業が行われた」とみなす（135 行 `if (didWork === undefined || didWork())`）。成功エンベロープを受けたら `idle`、`didWork()` が偽なら `failed`
- `server/utils/stroke/invoke.ts` の flontier 分岐だけが `didWork: submittedSince(sessionId)` を渡す。steering 分岐は渡していない（＝空振りが `idle`）
- `submittedSince` は `server/utils/stroke/submission-signal.ts` の `submissionCount(sessionId)` を起動前後で比べる。数を増やすのは `POST /api/strokes/:id/question`（A5）と `POST /api/strokes/:id/proposal`（A7）の2つの endpoint だけ
- steering の提出（`server/mcp/tools/submit-document.ts` の `type: 'steering'`）は `upstreamFetch` で**本家 REST へ直接 PUT** する。stroke-board の endpoint を1つも通らないので、いまの数え方には原理的に載らない
- 接続表（`server/utils/mcp/connection-table.ts`）の `ConnectionContext` は union で、flontier は `sessionId`、steering は `projectPath` を持つ。**両方同時に持つ状態は型で禁止**されている。steering 側から `invocation` の書き込み先の id（＝昇格後のディレクトリ名）は直接取れない
- token は `kick` が起動ごとに発行し、`invokeAi(...).finally(() => removeConnection(token))` で実行の終わりに失効する（`server/utils/stroke/invoke.ts`）。**token の寿命 = その起動の寿命**であり、これは `server/session-management` が既に規定している
- 巡回（`server/plugins/01.retry-failed.ts`）は `shouldRetry`（`sweep.ts`）で `failed` だけを拾う。**この判定は変える必要が無い**——空振りが `failed` になれば、そのまま既存の経路に乗る

### 追記（2026-09-04）— `add-activated-phase` が入った後の現状

Context の記述は 2026-09-01 に読んだ実装のもので、その後 `add-activated-phase` が develop へ入って**成功経路の順序が変わっている**。実機確認（tasks 5.1〜5.3）と santa-method のレビューで確かめた事実を足す。

- `server/utils/stroke/ai.ts` の成功経路は `recordCompletion` を先に見て、渡されていればそこで決着する（`didWork` は評価されない）。`invoke.ts` は生成中（phase が `approved`）の steering にだけ `recordCompletion` を渡す
- したがって**この change の `didWork` が実行の行き先を決めるのは、ストロークと、完成済み（`activated`）のプロジェクトの steering の起こし直しである**。生成中の steering は完成の記録（U15）の受理で決まる。delta spec（`specs/agent/invocation`）の Scenario はこの形に直した
- Risks の「3本すでに揃っている対象を起こすと、空振りとして `failed` になる」も、生成中の局面では成り立たない——承認依頼が在れば完成が記録されて `idle` になる（実測 2026-09-04）
- **実測で見つかった別の穴**（この change の範囲外）: steering 工程には承認依頼を出す道が無い（本家の `request-approval` は `--allowedTools` に載っておらず、`get-steering-guide` も呼ぶなと書いている）。そのため生成中の steering は文書を提出しても U15 が受理せず `failed` に倒れ、上限まで起こし直してから `error` になる。`add-activated-phase` 側の論点として報告する

## Goals / Non-Goals

**Goals:**

- steering の実行が「何も書かずに終わった」ことを、書き終えた実行と区別できるようにする
- 区別の材料（steering の提出の受理）を、起動の単位で正しく数えられるようにする

**Non-Goals:**

- flontier 側の数え方（`submittedSince(sessionId)` と A5・A7 の `notifySubmission`）は変えない
- 巡回の拾う条件は変えない。`failed` だけを拾うままにする（proposal の Impact は `server/plugins/01.retry-failed.ts` を挙げているが、**読んだ結果ここに変更は要らない**）
- MCP ツールの結果の契約（`docs/specs/api/mcp-tools.md` の結果の形・`errorCode` の割り当て）は変えない
- 「3本揃ったか」という工程の完了判定は作らない。ここで作るのは**1回の起動が何かを成したか**の判定だけである

## Decisions

### D1. steering の作業の signal は「起動（接続 token）」を単位にする

`submit-document` の steering 分岐が受理を数え、`buildRun` の steering 分岐が同じ token でそれを読む。

- 数える側は `resolveConnection` が解いた **token そのもの**をキーにする
- 読む側（`buildRun`）は既に `options.token` を持っている（`mcpToolServerEntry` に渡している値と同じ）。`didWork: () => <その token で受理が1つ以上あったか>` を渡す
- 記録は `removeConnection(token)` と同じ `.finally` で捨てる

**なぜ token か。** 答えるべき問いは「**この起動**で何か成したか」であり、token はその起動と1対1で、失効の時点も一致する（`server/session-management`「有効な token は現に実行中の起動に対して発行したもののみ」）。起動をまたいだ持ち越しが構造的に起こらず、flontier 側が使っている「起動前の数を控えて比べる」段取りも要らない。

検討して採らなかった案。

- **`basename(projectPath)` から id を導く** — 昇格後は「ディレクトリ名 = 一覧の id」なので値としては合う（`session-core.ts` の `listSessionsCore` は `entry.name` を id にする）。しかし同じ対応関係を3箇所目に書き写すことになり、「cwd を endpoint に導出させない」（親 change の design D5）と同じ理由で採らない。末尾の `/` の有無ひとつで壊れる導出でもある
- **接続文脈に `sessionId` を足す** — `ConnectionContext` は工程の排他を型で守っており、steering 側に `sessionId` を持たせると `resolveConnectionSessionId` が通ってしまう。`mcp/tools/submit`「接続の工程と種別が食い違う → `connection_mismatch`」が成立しなくなる。別名の項目を足す案も、工程を表すだけだった型に第2の意味を持ち込むので採らない
- **`projectPath`（= cwd）をキーにする** — 追加の配線は要らないが、記録の寿命が起動と結びつかず、プロジェクト削除時の後始末（`forgetSubmissions` の呼び先）が増える。token 案にはその後始末が既にある

### D2. 数えるのは「代行先が受理した」ときだけ、`submit-document` の中で

本家 PUT が 2xx を返した経路（`return { status: response.status }` に至る経路）だけで数える。`classifySteeringFailure` に落ちた失敗、`isRoutableDocumentName` で手前で弾いた 400、接続の食い違い、`project_not_registered` では数えない。

**受理されていない提出は何も残していない**ので、作業として数えると「本家が全部拒否したのに `idle`」という、いま直そうとしているのと同じ穴が別の形で開く。

flontier 側では数えない。受理を判定して数えるのは代行先の endpoint（A5・A7）で、ツール側で重ねると二重に数える。

### D3. 記録の置き場は `submission-signal.ts`。ただし**別の写像**にする

概念（提出が届いたことの記録）は1つなので、モジュールは増やさない。ただし既存の `counts`（キー = 対象の id）に token を混ぜない——1つの `Map` に2種類のキーが入ると、`forgetSubmissions(sessionId)` が何を消しているのかが読めなくなる。起動単位の記録として別の写像と関数を並べ、モジュールの冒頭の説明に「2つのキーの取り方がある理由（flontier は endpoint が数え、steering はツールが数える）」を書く。

### D4. `resolveConnection` の成功結果に token を載せる

ツールが token を知る経路が今は無い。`ConnectionResolution` の `ok: true` 側に `token` を足す（既存の呼び出し元は `resolved.ok` と `resolved.context` しか見ないので影響しない）。ヘッダを2度読む・ツール側で `x-stroke-token` を直に読む形にはしない——読み方が2箇所に割れる。

### D5. MCP ツールの契約は変えない

記録はサーバー内部の副作用で、結果には項目を足さない。したがって `docs/specs/api/mcp-tools.md`（結果の形・`errorCode` の表・接続 token）への反映は要らない。**契約を変える提案はこの change では出さない。**

## 上位資料への整合反映（提案。承認前に書き換えない）

`docs/agents/issue-tracker.md`「更新対応」に従い、承認をもらってから直す。対象は1ファイル。

**`docs/specs/architecture/session-workflow.md`「実行の記録（`invocation`）」**

1. 状態遷移図に空振りの遷移が無い（`running --> failed: タイムアウト・起動失敗` だけ）。次のように直したい。

   ```
   running --> idle: output stream で完了を検知（作業あり）
   running --> failed: タイムアウト・起動失敗・作業なしの完了
   ```

2. 図の下の箇条書きに1行足したい——「正常終了しても、その起動で提出が1つも受理されていなければ `failed` に倒す（flontier は問い・proposal、steering は steering 文書）」。

3. **ついでに見つけた誤記**（この change の内容とは無関係だが、同じ節にある）。「サーバー再起動で宙に浮いた `running` は…（`server/plugins/01.reap-running.ts`）」の**ファイル名が実体と違う**。実体は `server/plugins/01.retry-failed.ts` で、倒す処理と巡回は同じプラグインの中にある（`plugins/` に `01.reap-running.ts` は存在しない）。直すかどうかも承認で決めてほしい。

`docs/specs/core/settings-reference.md` は設定値が増減しないので変更なし。`docs/adr/` も変更なし（ADR-0011 は steering 工程を起こすことの決めで、終わり方の判定は持っていない）。

## Risks / Trade-offs

- **[3本すでに揃っている対象を起こすと、空振りとして `failed` になる]** → 起こし直しの末に `error`（終端）へ倒れ、ユーザーへ引き渡される。CONTEXT.md の「生成中」——「作りきれずに終わったときは決着として知らせ、やり直すか破棄するかをユーザーが選ぶ」——に沿う扱いで、いまの「`idle` のまま誰も気付かない」よりは良い。**本家の3文書の存在を見て完了とみなす案は採らない**：`didWork` が同期であること以前に、実行の側が本家の状態を読んで完了を導く経路が新しく増える（工程の完了判定は Non-Goals）
- **[案内（`get-steering-guide`）は環境の失敗で「何もせずに終わる」と指示している]**（`project_not_registered` / `unreachable` / `upstream_malformed` / `unauthorized`） → その終わり方も `failed` になり、上限まで起こし直してから `error` になる。**環境が直るまで通らない類の失敗**なので、ユーザーへ引き渡すのは正しい。起こし直しの回数ぶん無駄に起動するのは承知のうえで受け入れる（上限は `claude.maxRetries`）
- **[記録はメモリ上（単一プロセス前提）]** → 既存の `submission-signal.ts` と同じ制約。サーバーが落ちれば記録も token も消えるが、その起動自体も消えるので不整合は生まれない
- **[受理を数える場所がツールの中にある]** → ツールが「代行するだけ」から一歩出る。副作用は結果に現れず、代行先へ出す要求も変えないので、`mcp/server` の代行の規定とは衝突しない。それでも境界を跨ぐので、spec（`mcp/tools/submit`）に明文で置いて、暗黙の挙動にしない
