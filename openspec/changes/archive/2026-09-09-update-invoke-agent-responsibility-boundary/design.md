## Context

動機は proposal.md「Why」。ここでは形を決めるのに要る現状と制約だけを置く。

- steering の `didWork` は `invoke.ts` の `submittedByLaunch(token)` で、`submission-signal.ts` の `launchSubmissions`（起動 token の `Set`）を読む。記録者は `submit-document.ts` の steering 分岐、消す者は `kick` の `.finally`。消し忘れを防ぐために `connection-table.ts` に `isConnectionActive` がある
- `ai.ts` の `runBuiltInvocation` は `didWork`（同期）を先に見て、false なら `failed`。true で `recordCompletion` が渡されていれば U15 を叩き、受理で `idle`
- 本家 REST で使えるもの: `GET /api/projects/:projectId/info`（`steering.documents.{product,tech,structure}` の真偽）、`GET /api/projects/:projectId/approvals`（**pending だけ**。`filePath` は `.spec-workflow/steering/<name>.md`）、`GET /api/projects/list`（`resolveProjectId` の材料）。承認依頼を**作る** route は無い（2.2.5 実測）
- 本家 MCP の `approvals` ツール（`action: request`）は `filePath` / `title` / `type: document` / `category: steering` / `categoryName` を取り、`.spec-workflow/approvals/` に JSON を書く。stroke-board が `.spec-workflow/` へ直接書くことは無い（`api/projects/.../[action].post.ts` の前提・ADR 0005）
- 本家 MCP の配線は `70865c3d` で外した。外す前の形は `{ type: 'stdio', command: 'npx', args: ['-y', '@pimzino/spec-workflow-mcp@latest', cwd], env: { SPEC_WORKFLOW_HOME } }`
- 制約: ADR 0014（API は暗黙の状態分岐を持たない。U15 は判定を持たない）・ADR 0005（本家のデータを加工する仕様を勝手に入れない）・`upstream-connection`（本家 REST の定期ポーリング禁止）
- ユーザー指示（2026-09-09）: 「invoke-ai が指定の endpoint を確認して phase を変えるのが正しい設計」「token セットは常に invoke-ai の責務」「MCP ツールは特定の工程内でのみ発生する。固定の特定処理の受け持ちを禁止」

## Goals / Non-Goals

**Goals:**

- invoke-agent の責務範囲を docs（`architecture/invoke-agent.md`）に1箇所で持ち、散っていた設計記述を集約する
- MCP ツールの共通契約を docs（`mcp/contract.md`）に持ち、ツールが代行以外の固定の処理を受け持たない形をコードでも成立させる
- steering の完成の判定を「終了時点の本家の状態」（3本の文書と3件の承認依頼）にし、中間の記録を無くす
- 承認依頼を steering 工程の claude に必須にする

**Non-Goals:**

- flontier の作業判定（A5・A7 の `counts`）の変更
- U15・A8・`invocation` の契約の変更
- 画面の変更（`ui` artifact は作らない）
- 本家 MCP の承認依頼以外のツールを steering の手順に組み込むこと

## Decisions

### D1. 判定は invoke-agent の `didWork` に置いたまま、非同期にする

`AiRun.didWork` を `() => Promise<boolean>` にし、`runBuiltInvocation` は `await didWork()` で見る。判定の場所は変えない——完成したかを決めるのは呼び手であり、U15 は記録だけ（ADR 0014）。

代替: U15 が本家 REST を読んで受理を決める → 退ける。API が呼び出し側の渡していない状態で振る舞いを変える形で、2026-09-04 に退けた理由（`activate.md`）がそのまま当たる。

### D2. steering の `didWork` は本家 REST への問い合わせで答える

`invoke.ts` に `steeringCompletedUpstream(cwd, phase)` を置き、次の順で本家に問い合わせる。

1. `resolveProjectId(cwd)` — 解決できなければ false
2. `upstreamClient().getProjectInfo(projectId)` — `steering.documents` の3値がすべて true でなければ false
3. phase が `approved` のときだけ `upstreamClient().listPendingApprovals(projectId)` — `filePath` が `.spec-workflow/steering/product.md` / `tech.md` / `structure.md` のそれぞれに一致し、かつ `category` が `steering` の entry が在ることを要求する

本家に届かない・未設定・形違いはすべて false（`failed` → 巡回が起動し直す）。**呼ぶのは実行の終了直後の1回だけ**で、定期の呼び出しではない（`upstream-connection` の delta）。

材料に `getProjectInfo` を使うのは、3本の有無が1回の応答で揃うため。`GET .../steering/:name` を3回叩く形は往復が3倍で、`get-steering` のように本文が要るわけでもない。

代替1: メモリの記録を残す → proposal の理由で退ける。代替2: `.spec-workflow/approvals/` を読む → `upstream-connection`「本家 REST 以外から本家の状態を得ない」と ADR 0005 に反する。

### D3. 条件は phase で分ける

| phase | 条件 | true のとき |
|---|---|---|
| `approved`（生成中） | 3本の文書 かつ 3件の承認依頼（pending） | U15 → `idle` |
| `activated`（完成済みの起動し直し） | 3本の文書 | `idle`（U15 は叩かない） |

完成済みでは承認依頼が既に承認されて pending から消えていてよい。承認依頼を条件にすると、完成済みの起動し直しが常に `failed` になる。

**判定の材料は「その実行の間に起きたこと」から「終了時点の本家の状態」へ変わる。** 到達済みの状態で何もしなかった実行は `idle` になる。これは意図した変化で、旧設計の Risk「起動し直しが空振りすると倒れる」（`add-activated-phase` design）はこれで消える。

### D4. 承認依頼の手段は本家 MCP の `approvals` に限った配線

steering 工程の `--mcp-config` に本家 MCP を並べ直す（外す前と同じ形。`server/utils/stroke/invoke.ts` の `mcpConfigFor`）。`--allowedTools` には `mcp__stroke-board` に加えて `mcp__specworkflow__approvals` **だけ**を足す。`--strict-mcp-config` は残す。

`get-steering-guide` の手順に「1本提出して受理されたら、`approvals` の `request` を `filePath: .spec-workflow/steering/<name>.md`・`type: document`・`category: steering`・`categoryName: steering` で出す。承認を待たずに次へ進む。3本の受理と3件の承認依頼で工程は終わり」を書く。本家ツールの description は「承認を待て」と言うので、手順で明示的に上書きする。

`project/generation`「本家 MCP を配線してはならない」と `settings-reference`「第三者の MCP を配線しない」は、**記述ごと撤廃する**（ユーザー決定 2026-09-09。「配線しない」を「`approvals` に限って配線する」へ狭める案は退けられた）。docs・specs・コードのコメントには配線している MCP と許可しているツールの事実だけを書き、配線を禁じる規定・「これ以外は許可しない」という形の規定は持たない。禁止の動機だった「自己登録＝生成」は、P2 が起動前に生成を済ませる今は成立しない——登録済みパスへの自己登録は同じ `projectId` を返すだけ（`api/projects/generate.md`）。残る変化は「実行中は本家の登録簿に本家 MCP のインスタンスが1つ在る」ことで、`project/generation` の scenario をそれに合わせる。

代替1: stroke-board が approval JSON を直接書く → ADR 0005 と「二重に書き込む主体を作らない」に反する。代替2: 本家に作成 REST を足す → 本家は npm パッケージで、fork の運用は範囲外。代替3: 自前 MCP に `request-approval` を足して代行 → 代行先が無い。

### D5. `submit-document` から記録を外し、記録の仕組みごと消す

- `submit-document.ts` の steering 分岐: `recordLaunchSubmission` と `isConnectionActive` の呼び出しを外し、本家 PUT の `status` を返すだけにする
- `submission-signal.ts`: `launchSubmissions`・`recordLaunchSubmission`・`hasLaunchSubmission`・`forgetLaunchSubmission` を削除。flontier の `counts` は残す
- `connection-table.ts`: `isConnectionActive` を削除（用途が消える）
- `invoke.ts`: `submittedByLaunch` を削除し、`kick` の `.finally` は `removeConnection` だけにする

### D6. 接続 token の寿命は invoke-agent（`kick`）が持つ。コードは変えず、docs と specs で明記する

発行・登録は `kick` が spawn 直前に、失効は `settled.finally` で行う。今もそうなっており、変えるのは規定（`architecture/invoke-agent.md`・`agent/invocation`・`server/session-management` の ADDED）。MCP ツールは `resolveConnection` で解決するだけで、発行・失効に関与しない。

### D7. docs の集約は「移して参照を残す」

`architecture/invoke-agent.md` に設計記述を移し、元の5箇所は endpoint の契約（入出力・エラー）だけを残して1行の参照に置き換える。`api/contract.md` の「全体設計」は AI 起動の入口が U13 であることと phase の一方向だけを残す。

### D8. E2E の本家 stub は新しい判定に合わせる

`test/e2e/fixtures/upstream-stub.mjs` の `info` は `steering.documents` を固定値で返している。`savedSteeringDocuments` から導くように変え、承認依頼の一覧は既存の `approvals` を返す。E2E で steering の claude は走らないので、判定の単体テストは `invoke.test.ts` に置き、本家の応答を `upstreamClient` の差し替えで与える。

### D9. `ui` artifact は作らない

画面の変更が無い。

## docs・ADR への反映

ユーザー指示（2026-09-09「docs へ mcp/contract、architecture/invoke-agent を書き出せ」）に基づき、この change の中で docs を先に書いた。次の2点は既存の規定の変更にあたり、ユーザーの決定を得た（2026-09-09）。

| 対象 | 変更 | 決定 |
|---|---|---|
| `docs/specs/core/settings-reference.md`「`--allowedTools`」 | 「第三者の MCP を配線しない」の記述を撤廃し、配線している MCP と許可するツールの事実だけを書く | 撤廃（狭めて残す案は却下） |
| `docs/specs/core/settings-reference.md`「ポータル側」 | `specWorkflowHome` は steering 工程の起動に載る | 「載らない」を事実に合わせて書き換え |

新設: `docs/specs/mcp/contract.md`・`docs/specs/architecture/invoke-agent.md`。参照の付け替え: `api/contract.md`・`api/sessions/invoke-agent.md`・`api/sessions/activate.md`・`architecture/session-workflow.md`・`plan/portal-stroke-exit.md`・`mcp/tools.md`。

ADR: 新設しない。反転の記録は docs の本文（結論）と本 design に置く。

### 用語の表記で直せなかった箇所

`specs/agent/invocation/spec.md` の MODIFIED 内の scenario 題名「昇格したプロジェクトで初めて起こす」は、`openspec validate update-invoke-agent-responsibility-boundary --store stroke --strict` が「現行 spec が持つ scenario を MODIFIED から落としている」として拒むため、題名だけ現行のまま残した（本文は「起動する」に直してある）。archive で main spec に畳んだ後、題名の改名は次に触る change で行う。

## Risks / Trade-offs

- **[本家の承認依頼一覧は pending だけ]** プロセス終了より前にユーザーが3件を承認し終えると、生成中のプロジェクトの判定が false になり `failed` → 巡回の起動し直しになる → 確認は終了直後の1回で、承認がその前に済んでいることは稀である。起動し直された claude は手順どおり承認依頼を出し直すので、次の実行で true になる（承認済みの文書に pending が1件増える）
- **[本家 MCP の起動が npx 経由]** 起動のたびに `npx -y @pimzino/spec-workflow-mcp@latest` が走る。ネットワークとキャッシュに依存する → 外す前と同じ形で、実績がある。版の固定は本家の追随（ADR 0008）と別に決める
- **[本家に届かないと完成しない]** 本家 dashboard が止まっていれば `failed` に倒れる → 生成の依頼（P2）も同じ前提で、巡回が拾う。本家が動けば次の実行で決着する
- **[`resolveProjectId` の完全一致]** 共有ルートが git 管理下だと解決が外れる → `submit-document` と同じ前提（`upstream-observations.md`）。新しい失敗経路ではない
- **[到達済みなら何もしない実行も idle]** 旧規定「前の実行の提出を持ち越さない」の置き換え → 意図した変化（D3）

## Migration Plan

1. docs → specs（delta）→ 実装 → テスト → santa-method レビュー → commit の順
2. 永続データの移行は無い。`launchSubmissions` はメモリのみ
3. 巻き戻しは commit の revert で足りる。`state.json` の形は変わらない
