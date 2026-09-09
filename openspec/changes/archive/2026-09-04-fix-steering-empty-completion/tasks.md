## 1. 起動単位の提出記録を持つ

- [x] 1.1 `server/utils/stroke/submission-signal.ts` に**起動単位**の記録を足す（既存の `counts` とは別の写像。記録する / 記録があるか / 捨てる の3つ）
- [x] 1.2 同ファイルの冒頭に、キーの取り方が2つある理由を書く（flontier は受理する endpoint が対象の id で数える／steering は代行先が本家なのでツールが起動の token で数える）
- [x] 1.3 既存の `notifySubmission` / `submissionCount` / `forgetSubmissions` の振る舞いを変えていないことを確かめる（flontier 側は変更対象外）

## 2. 受理された steering の提出を数える

- [x] 2.1 `server/utils/mcp/connection-table.ts` の `ConnectionResolution` の成功側に `token` を足す（失敗側は変えない。既存の呼び出し元は `ok` と `context` しか見ないので影響しないことを確認する）
- [x] 2.2 `server/mcp/tools/submit-document.ts` の steering 分岐で、**本家 PUT が応答を返して受理された経路だけ**で 1.1 の記録を行う
- [x] 2.3 数えない経路を確認する — 手前で弾いた 400（`isRoutableDocumentName` / `type` 不正）・`connection_mismatch`・`project_not_registered`・`classifySteeringFailure` に落ちた失敗のいずれでも記録しない
- [x] 2.4 flontier 分岐では記録しない（受理を数えるのは A7 側。二重に数えない）
- [x] 2.5 ツールの結果に項目を足していない・`status` / `errorCode` / `error` の値を変えていないことを確かめる（`docs/specs/api/mcp-tools.md` の契約は変えない）

## 3. steering の実行に「作業が行われたか」を持たせる

- [x] 3.1 `server/utils/stroke/invoke.ts` の steering 分岐に `didWork` を渡す（`options.token` で 1.1 の記録を読む）
- [x] 3.2 `kick` の `.finally` で `removeConnection(token)` と並べて記録を捨てる。`buildRun` が同期 throw する経路（`removeConnection` を呼んでいる catch）でも捨てる
- [x] 3.3 flontier 分岐の `submittedSince(sessionId)` は変えない
- [x] 3.4 `server/plugins/01.retry-failed.ts` と `server/utils/stroke/sweep.ts` は変えない（`failed` を拾う条件のままで、空振りが `failed` になれば既存の経路に乗る）
- [x] 3.5 `server/utils/stroke/sweep.ts` の docstring が巡回の実体を `server/plugins/02.retry-failed.ts` と書いている誤記を、実体（`01.retry-failed.ts`）に直す

## 4. テスト

- [x] 4.1 `test/server/utils/stroke/invoke.test.ts` — steering の起動が `didWork` を持つこと、flontier の `didWork` が変わっていないこと
- [x] 4.2 `test/server/utils/stroke/invoke.test.ts` — 実行が終わると記録が残らないこと（次の起動が前の起動の提出を数えない）
- [x] 4.3 `test/server/mcp/tools/submit-document.test.ts` — 本家が受理した steering の提出が起動の作業として記録されること
- [x] 4.4 `test/server/mcp/tools/submit-document.test.ts` — 拒否・不達・手前で弾いた提出、および flontier の提出では記録されないこと
- [x] 4.5 `test/server/mcp/tools/submit-document.test.ts` — 記録を足しても結果の形（`status` のみ／失敗時の `status`・`errorCode`・`error`）が変わらないこと
- [x] 4.6 `test/server/utils/stroke/ai.test.ts` — 「正常終了したが作業なし → `failed`」の既存のケースが steering の値でも成立すること
- [x] 4.7 `yarn test` が通ること（既存のテストを1つも壊していない）
- [x] 4.8 `yarn lint` と型検査が通ること — `yarn lint` はこのリポジトリに存在しない（CLAUDE.md）。`yarn typecheck` は通した

## 5. 実機で確かめる

- [x] 5.1 承認から steering を起こし、文書を提出して終わる実行が `idle` になることを確かめる（`state.json` の `invocation`）
  - 実測 2026-09-04（worktree `pre6` / ブランチ `add-activated-phase`）。`yarn dev` をポート **3100** で起動（PID 1244130→1244143、途中で定型を替えて再起動 1248782→1248797）。**`nuxt.config.ts` は書き換えていない**——`NUXT_PROJECT_SHARE_ROOT`（既存のセッションを巡回の対象に入れないため検証用の一時ディレクトリへ）・`NUXT_CLAUDE_DEBUG_LOG_DIR`・`NUXT_CLAUDE_STEERING_PROMPT` の3つを `yarn dev` の前に付けただけ
  - 対象は U1 →A7 →U10（承認）→U14（昇格）で作った検証用プロジェクト `stroke-check-fix-steering-0904`（uuid セッション `5662a43d-9ad2-4b55-bbb2-1eed3e9e1c0f` が昇格して改名されたもの）
  - **提出のある実行は `idle` になった。** 04:31:54 → 04:32:13 の実行（phase `activated`・定型は「`name=tech` を1本だけ提出して終われ」）で `submit-document`（type=steering）が 200、`.spec-workflow/steering/tech.md`（1564 バイト）が書かれ、`invocation` は `running`(retries 1) → **`idle`**(retries 0)
  - **`approved` の局面では `didWork` を通らない。** add-activated-phase で `recordCompletion`（U15）が作業の判定に代わるため（`server/utils/stroke/ai.ts` の「完成の記録を渡された実行では…」）。実測でも、文書を1本提出した 04:21:56 → 04:22:38 の実行は U15 が 409（`まだ完成していない。承認依頼が1件も無い。`）で `failed` になった。承認依頼のファイルを1件置いてから巡回に起こし直させると U15 が受理し、phase `activated`・`invocation` `idle` になった（04:26:31 → 04:26:41）
  - **付随して観測した事実（この change の範囲外）**: steering 工程に承認依頼を作る道が現状無い（本家の `request-approval` は `--allowedTools` に載っておらず、`get-steering-guide` も呼ぶなと書いている）。そのため `approved` の steering は文書を提出しても U15 が受理せず `failed` に倒れる。add-activated-phase 側の論点として報告する
- [x] 5.2 何も提出せずに終わる実行（例: 本家 dashboard を止めて起こす）が `idle` にならず `failed` になり、巡回に拾われることを確かめる
  - **本家 dashboard は止めていない**（ポート 5000 は他の作業と共有のため）。代わりに定型（`NUXT_CLAUDE_STEERING_PROMPT`）と会話の続きで「提出が1本も起きない実行」を作った
  - 04:26:52 → 04:27:04 の実行（phase `activated`。`recordCompletion` を渡さない局面なので `didWork` が判定する）は、`get-steering-guide` と `get-steering` だけを呼び、`submit-document` を1度も呼ばずに正常終了した。サーバーログは `AI 呼び出しが失敗: … [ 'プロセスは成功したが提出が届かない' ]`、`invocation` は **`failed`**（retries 1）。`idle` にはならなかった
  - 前の起動の提出は次の起動に持ち越されていない（04:21:56 の起動が product を提出済みでも、この起動は `failed` になった＝記録が起動 token 単位で捨てられている）
  - 巡回（`server/plugins/01.retry-failed.ts`・60 秒間隔）が拾って起こし直した: 04:27:31 `running`(retries 2) → 04:27:40 `failed`(2)、04:28:31 `running`(3) → 04:28:35 `failed`(3)
  - 手順上の注意: 一覧（U12）に載る条件は `<対象>/openspec/config.yaml` に `schema:` が在ること（`session-core.ts` の `passesListChecks`）。flontier の初回起動を経ていない検証用プロジェクトは、これを置くまで巡回に拾われなかった
- [x] 5.3 起こし直しが上限に達したら `error` になり、そこで自動の起こし直しが止まることを確かめる
  - 04:29:31 の巡回で `リトライ上限に達した: stroke-check-fix-steering-0904（3/2）` が出て、claude を起動しないまま `invocation` が **`error`**（終端）になった（`claude.maxRetries: 2`）
  - 以後 04:30:31・04:31:31 の巡回でも `state.json` は変わらず、生出力（`debugLogDir`）の起動見出しの数も 5 のまま増えなかった＝自動の起こし直しが止まっている
  - ひと続きの起こし直しで起きた claude は3回（04:26:52 / 04:27:31 / 04:28:31）で、「上限 + 1」と一致した
- [x] 5.4 使ったプロセス・ポート・作った検証用セッションを片づける
  - （2026-09-01 追記: 使ったプロセス（`yarn dev` PID 379862）とポート（3599）は停止・解放を確認済み（`ss -tlnp` 該当なし、`ps -p` 該当なし）。ただし作った検証用セッション（`/opt/projects` 配下）の片付けはユーザー確認待ちのため未実施）
  - 2026-09-04 追記: `yarn dev`（PID 1248782 / 1248797）を停止し、`ss -tlnp` で **3100 の待ち受けが無い**ことを確認。`pgrep -af claude` / `pgrep -af spec-workflow-mcp` に今回起こした子プロセスは残っていない（残っているのは別作業のもの。**ポート 5000 の本家 dashboard は停止していない**）。本家の登録簿（`/opt/projects/.spec-workflow-mcp/activeProjects.json`）にも検証用プロジェクトの登録は残っていない
  - 消したもの: 検証用プロジェクト `stroke-check-fix-steering-0904`（＝セッション `5662a43d-…` の昇格後。作ったセッションはこの1本だけ）と、検証用の生出力ディレクトリ（`NUXT_CLAUDE_DEBUG_LOG_DIR` に指した一時ディレクトリ）。どちらも `/opt/projects` の外（検証用の一時親ディレクトリ）に作ってあり、`/opt/projects` 配下には何も作っていない
  - 2026-09-01 の分（ユーザー確認待ち）: `/opt/projects` 配下に、その検証で作ったと同定できるものは見当たらない。残っているセッションは `3d2f1ac8-0d0b-43fe-8d5a-71d1f94a4bf3` の1件だが、作成は 2026-09-03 05:50、概要は旧既定の `## setai` で、この change の検証（2026-09-01）のものと同定できない。**消さずに残した**

## 6. 上位資料への整合反映（change update-docs-for-runtime-fixes へ委譲済み）

- [x] 6.1 上位資料への整合反映を change `update-docs-for-runtime-fixes` へ委譲した。提案の内容は同 change の ticket に一覧（この change の分は `S3` / `S4`。ファイル名の誤記〔`01.reap-running.ts` → `01.retry-failed.ts`〕は同 ticket の「同時に見つかった既存の誤り」一覧に `D2` として記録済み）。**この change では `docs/` を書き換えない**

## 7. 仕上げ

- [x] 7.1 この change の成果物を commit する（`openspec/config.yaml` の apply guidance）
  - この change のコードは develop のコミット **`c086907e`**「fix: 実行まわりの欠陥7件を直す」（2026-09-01）に入っている（`git log` で確認。同コミットは現ブランチ `add-activated-phase` の祖先）。含まれるのは `server/utils/stroke/submission-signal.ts`・`server/mcp/tools/submit-document.ts`・`server/utils/stroke/invoke.ts`・`server/utils/mcp/connection-table.ts`・`server/utils/stroke/ai.ts` と、対応するテスト（`test/server/utils/stroke/invoke.test.ts`・`test/server/mcp/tools/submit-document.test.ts`・`test/server/utils/stroke/ai.test.ts`・`test/server/utils/mcp/connection-table.test.ts`）
  - **この change 単独のコミットではない**（7件の修正がまとまっている）。新しく commit するものは無いので、記録として残す
  - 2026-09-04 追記: santa-method のレビュー指摘を受けた修正を **`a4eaac0f`**「fix: 終わった起動の提出記録が残る経路を塞ぐ」としてブランチ `add-activated-phase` へコミットした（`server/utils/mcp/connection-table.ts` に `isConnectionActive`・`submit-document.ts` の記録に生存の条件・起動単位の記録を `Set` へ・テスト4本追加）
  - **archive の順序**: この change を先、`add-activated-phase` を後に archive する。両者は `agent/invocation` の同じ Requirement「完了は output stream で検知して idle に変える」を MODIFIED しており、後から archive した方が本文を置き換える。逆順にすると完成の記録（U15）の規定が消える
- [x] 7.2 `typescript-reviewer` エージェントに `/santa-method` でレビューさせ、**完全にパスするまで**指摘の修正とレビューを繰り返す
  - **`typescript-reviewer` というエージェント型はこの環境に無い**（利用できるのは `general-purpose` ほかの一覧のみ）。スキルの手順（Pattern A: 文脈を共有しない2体の subagent に同じルーブリックで独立にレビューさせ、両方が PASS するまで回す）に従った
  - 4周した（2026-09-04）。1周目・2周目・3周目は片方または両方が FAIL、**4周目で2体とも PASS**
  - 直した指摘:
    - **打ち切りの後に記録が作り直される競合**（両レビュアーが指摘）。実行が先に畳まれても飛行中のツールハンドラは中断されないので、`kick` の `.finally` の後に本家の受理が戻ると、誰も捨てない記録が残っていた（spec `mcp/tools/submit` の MUST NOT 違反）。`isConnectionActive` を足して記録の直前に起動の生存を見る（`a4eaac0f`）
    - **delta spec が HEAD と食い違っていた**。`add-activated-phase` が入って、生成中（`approved`）の steering では完成の記録が作業の判定に代わるようになっていたのに、この change の delta は工程全体を提出で判定すると書いていた。MODIFIED に例外を、Scenario に局面の限定を入れた
    - 起動単位の記録を `Set` に（件数を読む者が居ない）、識別子と説明のずれ（`launchCounts` → `launchSubmissions`）、説明の置き場（`8c49e28a` / `f5ca4af8`）
    - テストを4本追加（畳まれた後の受理・`type` 不正・`activated` の `didWork`・別 token の受理）と `isConnectionActive` の直接テスト
  - 直していない指摘（レビュアーの suggestions。この change の範囲外として残す）: `AiRun.didWork` を必須にする、`docs/specs/api/contract.md` の `02.retry-failed.ts` 誤記、design.md の「`01.reap-running.ts` は存在しない」が現在は偽（`remove-startup-reap-ordering` で実在するようになった）、完成済みプロジェクトの起こし直しが必ず空振り→`error` になること
  - `yarn test`（77 files / 977 tests）と `yarn typecheck` は各周で通した
- [x] 7.3 ユーザーから完了承認を得る（2026-09-04 承認。ticket の `status` を `Wait-for-archive` にした）
