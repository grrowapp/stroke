## 1. 着手の記録

- [x] 1.1 `openspec/tickets/fix-session-api-namespace.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（この worktree のブランチは `fix-session-api-namespace`、セッション ID は `92d3ea72-e0cf-4412-a969-d5e6aaab99d7`）。既に同じものがあれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. handler の移動（design「handler の移動」）

- [x] 2.1 移動先のディレクトリを `mkdir -p` で先に作る（`git mv` はディレクトリを作らない）
- [x] 2.2 U1・U12 を `git mv`（`server/api/strokes/index.post.ts`・`index.get.ts` → `server/api/sessions/`）
- [x] 2.3 U2 を `git mv`（`strokes/[id]/index.get.ts` → `sessions/[id]/index.get.ts`）。移動先には U11 の `index.delete.ts` が既に居るので、同じディレクトリに 2 Method が並ぶ
- [x] 2.4 U3・U7・U10・U13・U14 を Endpoint 名のディレクトリごと `git mv`（`strokes/[id]/{strokes,answer,approve,invoke-agent,promote}/` → `sessions/[id]/`）
- [x] 2.5 U9 だけを移す（`strokes/[id]/send-back/index.post.ts` → `sessions/[id]/send-back/index.post.ts`）。**A4 の `index.get.ts` は `strokes/[id]/send-back/` に残す**
- [x] 2.6 相対 import が 1 行も変わっていないことを確かめる（深さが変わらないため。design「handler の移動」）。`git diff --cached -M` で 10 本すべてが rename として検出されること
- [x] 2.7 `find server/api/strokes -type f` がエージェントが叩く endpoint 5 本（`overview`・`send-back/index.get.ts`・`question`・`proposal`・`submission`）だけになっていること。`find server/api/sessions -type f` がセッションの endpoint 11 本すべてを持つこと

## 3. WS route と `wsPathPattern`（design「WS route と `wsPathPattern`」）

- [x] 3.1 `git mv` で `server/routes/api/strokes/[id]/ws/` を `server/routes/api/sessions/[id]/ws/` へ（`question.ts`・`proposal.ts`）
- [x] 3.2 `nuxt.config.ts` の `wsPathPattern` の既定値を `/api/sessions/([^/]+)/ws/{channel}(?:$|[/?#])` にする
- [x] 3.3 `server/utils/stroke/ws-channels.ts` の doc コメント 2 行（`W1 /api/:id/ws/question`・`W2 /api/:id/ws/proposal`）と、移した route 2 本の docblock を `/api/sessions/:id/ws/…` に直す

## 4. サーバ内の参照（design「サーバ内の自己呼び出し」）

- [x] 4.1 `server/utils/stroke/invoke.ts` の `invokePath`（U13）と `hasConversation` の一覧取得（U12）を `/api/sessions` に
- [x] 4.2 `server/plugins/01.reap-running.ts`・`01.activate-approved.ts`・`01.retry-failed.ts` の U12 の一覧取得を `/api/sessions` に
- [x] 4.3 `server/utils/stroke/submission-path.ts` の docblock から「別 ticket（fix-session-api-path）が直す」の 1 文を消し、エージェントが叩く endpoint とセッションの endpoint で名前空間が分かれている旨に書き換える。`submissionPath`（A8）と `activatePath`（U15）が返す path は変えない

## 5. 画面（design「画面」）

- [x] 5.1 `app/pages/strokes/index.vue`（U1・U13）
- [x] 5.2 `app/pages/strokes/[sessionId]/index.vue`（U2 の 2 箇所・U3・U7）
- [x] 5.3 `app/pages/strokes/[sessionId]/proposal.vue`（U2・U3）
- [x] 5.4 `app/composables/useSessionChannel.ts`（W1 / W2 の URL）
- [x] 5.5 `app/composables/useWaitingRetry.ts`（U2 のポーリング・U13 の起動要求。U11 の削除は既に `/api/sessions/`）
- [x] 5.6 `app/composables/useProjectApi.ts`（U13）
- [x] 5.7 `app/composables/useProposalReview.ts`（`base` と `kickSteering`。`base` の doc コメント `/api/<uuid>` も実体に合わせる）
- [x] 5.8 `app/composables/useAgentQuestion.ts` の `base` を `/api/${sessionId}` → `/api/sessions/${sessionId}`（旧 ticket `fix-agent-question-api-path` の吸収）

## 6. テストの移動と追随（design「テストの移動」「`test/server/api/sessions/index.delete.test.ts` の階層合わせ」）

- [x] 6.1 セッションの endpoint のテスト 7 本を `git mv` で `test/server/api/strokes/<name>/` から `test/server/api/sessions/<name>/` へ（`answer`・`approve` の 2 本・`invoke-agent` の 2 本・`promote`・`send-back`）。エージェントが叩く endpoint の `question`・`proposal` は動かさない
- [x] 6.2 移した 7 本の `await import()` と `vi.mock` が指す handler の path を `server/api/sessions/[id]/…` に直す。**相対 path の段数は変わらない**（深さが同じ）
- [x] 6.3 移した 7 本の冒頭 docblock の「対象は `server/api/…`」と `describe` の path の表記を `/api/sessions/…` に直す
- [x] 6.4 `test/server/api/sessions/index.delete.test.ts` を `test/server/api/sessions/[id]/index.delete.test.ts` へ `git mv` し、`'../support'` → `'../../support'`、`'../../../../server/…'` → `'../../../../../server/…'` の深さを 1 段増やす（`await import()` が指す handler は動いていないのでそのまま）。docblock に `[id]` の段を挟む理由を書く（design「`test/server/api/sessions/index.delete.test.ts` の階層合わせ」）
- [x] 6.5 期待値だけを直すテスト 3 本（`test/app/composables/useWaitingRetry.test.ts` の U13、`test/server/utils/stroke/sweep.test.ts` の `invokePath`、`test/server/middleware/mcp-token.test.ts` の U12。**A1 の行はそのまま**）
- [x] 6.6 `test/app/composables/useAgentQuestion.test.ts` に、`send` の送り先が `/api/sessions/<id>/answer`（U7）であること、続く起動要求が `/api/sessions/<id>/invoke-agent`（U13）であることを path そのもので検査する 2 件を足す（旧 ticket `fix-agent-question-api-path` の受け入れ条件「この経路を通る自動テストが1本以上ある」）。既存の 3 件は `url.includes()` で分岐するだけで path を見ていないので、根拠にしない。あわせて、書き直した docblock とコメントに残っていた当て字「器」を `error` に直す（`CLAUDE.md`「禁止事項」の「既存の該当箇所は触ったときに直し」）
- [x] 6.7 テスト同士の参照を追随させる（`test/server/utils/stroke/creation-broadcast.test.ts` の U14 のテスト位置、`test/server/handler/delete.test.ts` と `test/server/api/projects/[projectId]/index.delete.test.ts` が指す `sessions/index.delete.test.ts` の位置、移した 7 本の docblock が同じディレクトリ前提で書いていた `question/index.post.test.ts` の名前）
- [x] 6.8 `test/server/api/strokes/question/index.post.test.ts` の docblock が「`[id]` の段を足すかどうかは `fix-session-api-namespace`（Gitea #17）が決める」とこの change に預けていた判断を書き切る（design「テストの移動」の規則。位置そのものは動かさない）

## 7. E2E と `.claude/settings.json`（design「E2E」「`.claude/settings.json`」）

- [x] 7.1 `test/e2e/agent-question.spec.ts` — U1・U7 の `page.route` 3 箇所・U2 の `RegExp`。**`page.route` と `page.unroute` の pattern を必ず一緒に直す**。A5・A7 はそのまま
- [x] 7.2 同ファイルの `stubFollowupAnswer` を消し、参照している 3 件から呼び出しを外す。理由を書いた docblock も消す（基底が直ったので stub の理由が無くなり、実物の U7 を通せる。design「`useAgentQuestion` の経路を通るテスト」）
- [x] 7.3 `test/e2e/proposal-annotation.spec.ts`（U1）・`proposal-persistence.spec.ts`（U1・U2 の 2 箇所）。A7 はそのまま
- [x] 7.4 `test/e2e/stroke-exit.spec.ts`（U10・U2 の 2 箇所・U14）。A8 はそのまま
- [x] 7.5 `test/e2e/ws-disconnect.spec.ts`（U1・W1 / W2 の `ws://…` URL）。A5・A7 はそのまま
- [x] 7.6 `.claude/settings.json` の `curl … /api/strokes` の許可行を `/api/sessions` に

## 8. 据え置き表から拾う docblock（design「`fix-session-api-layout` の据え置き表から拾うもの」）

- [x] 8.1 `server/api/sessions/[id]/approve/index.delete.ts` の docblock — path `/api/strokes/:id/approve` と、旧ファイル名 `send-back.get.ts` / `send-back.post.ts`
- [x] 8.2 `server/api/sessions/[id]/approve/index.post.ts` の docblock — 旧ファイル名 `promote.post.ts`・`approve.delete.ts`
- [x] 8.3 `server/api/sessions/[id]/promote/index.post.ts` の docblock — 旧ファイル名 `approve.delete.ts`・`approve.post.ts`・`activate.post.ts`
- [x] 8.4 `server/mcp/tools/get-strokes.ts` の呼び出し先（**エージェントが叩く endpoint ではなく U3**）と `test/server/mcp/tools/get-strokes.test.ts` の期待値を `/api/sessions/${id}/strokes` に。あわせてセッションの endpoint の URL を挙げているコメント 2 箇所（`server/utils/mcp/resolve-project-id.ts` の U13、`server/utils/stroke/reap-match.ts` の U12）（design「`server/mcp/tools/get-strokes.ts` はエージェントが叩く endpoint ではない」）
- [x] 8.5 `scripts/stroke-check.ts` のセッションの endpoint のマッチャ 2 つ（`:392` の U1 の応答待ち・`:417` の U13 の URL からのセッション id 取り出し）とコメント 2 行を `/api/sessions/` に。**どちらも実行される正規表現で、直さないと無言で壊れる**（design「`scripts/stroke-check.ts` のセッションの endpoint のマッチャ」）。画面の route を指す `:430`・`:431` の `/strokes/` は動かさない
- [x] 8.6 名前空間を落とした形の docblock 3 行（`shared/stroke.ts` の U2 と W2、`server/utils/stroke/ws-channels.ts` の「既定値は settings.ts」→ `nuxt.config.ts` の `runtimeConfig`）
- [x] 8.7 `git mv` の後に残った空ディレクトリを消す（`server/api/strokes/[id]/{answer,approve,invoke-agent,promote,strokes}`・`server/routes/api/strokes/**`・`test/server/api/strokes/{answer,approve,invoke-agent,promote,send-back}`）。git は追跡しないので commit には出ないが、`find` が移設前と同じ形に見えて後続の #15 / #18 が誤読しうる
- [x] 8.8 据え置く分（`server/api/strokes/[id]/submission/index.post.ts`・`server/mcp/tools/*` の `get-strokes.ts` 以外・`server/utils/stroke/*` と `scripts/stroke-check.ts` の**旧ファイル名**のコメント）と、親の `openspec/` の旧 ticket 3 本・`docs/specs/mcp/tools.md` 26 行目・`README.md` 172 行目は据え置き、design の表のまま親へ引き継ぐことを確かめる

## 9. 検証（design「検証の順序」）

- [x] 9.1 `yarn typecheck`
- [x] 9.2 `yarn test` — 移した 7 本・期待値を直した 3 本・新しい 2 件が通ること。`vi.mock` の第 1 引数の付け替え漏れはここでしか落ちない
- [x] 9.3 `yarn build` の生成物のルート表（`.nuxt/types/nitro-routes.d.ts`）で、`/api/strokes/:id/**` がエージェントが叩く endpoint 5 本だけになり、セッションの endpoint 9 本が `/api/sessions/**` に移っていることを確かめる
- [x] 9.4 `yarn test:e2e` — URL が実際に届くことの判定。stub を外した `agent-question.spec.ts` の 3 件が実物の U7 を通ること。**起動したものは必ず止め、ポートの解放を確かめる**。高負荷で落ちたら負荷が下がってから回し直して切り分ける — 全件 **234 pass / 3 fail / 9 未実行**。`agent-question.spec.ts` は 3 件を含めて全件 pass（stub を外した実物の U7 が通った）。`ws-disconnect.spec.ts` も pass（W1 / W2 が移設後の URL で繋がる）。落ちた 3 件を回し直して `proposal-persistence.spec.ts:155`（W2 の接続時配信）と `upstream-style.spec.ts:945`（mermaid。この change と無関係）は pass。`stroke-exit.spec.ts:140` だけは並走すると落ち続けるが、**`stroke-exit.spec.ts` を単独で回すと 14 件すべて pass**。原因は spec 自身のコメントが書くとおりスタブの登録簿が run 全体で共有されることで、並走する spec が作ったセッションの登録が混ざると `registrations.every(...)` が false になる——handler の path には依らない（`fix-session-api-layout` でも同じ事象が起きている）。起動した Playwright・Chromium・スタブはこの worktree の分をすべて終了済みで、ポートの解放を確認（残っている 50000 / 50001 は別 worktree `pre5` の実行が握っているもので、`/proc/<pid>/cwd` で確かめた）

## 10. 上位資料への整合反映（design「関連 docs 4 ページの書き換え案」。ユーザー承認済み）

- [x] 10.1 `docs/specs/structure/system-structure.md` — §1 `routes/` の行と §4 の「セッション系」の 2 箇所
- [x] 10.2 `docs/specs/architecture/session-workflow.md` — 「畳み方」の 1 行（`GET /api/sessions`・`DELETE /api/sessions/<uuid>`）
- [x] 10.3 `docs/specs/core/settings-reference.md` — `wsPathPattern` 既定値の 1 箇所
- [x] 10.4 `docs/specs/structure/file-composables.md` — 5 箇所（表・`useSessionChannel`・`useWaitingRetry`・`useAgentQuestion` の「個別」と「気づいたこと」）
- [x] 10.5 `docs/specs/api/overview.md`・`server.md`・`sessions/*.md`・`ws/delivery.md`・`contract.md`・`mcp/tools.md`・`plan/*`・`adr/*` を変更していないことを `git status --short docs/` で確かめる（基準は触らない）
- [x] 10.6 移設で新しく食い違う 3 行を直す（design「移設で新しく食い違う 3 行の書き換え案」。**追加の承認済み** 2026-09-09。10.1〜10.4 とは承認の時期が違うので、後から足す 1 commit に分ける）— `docs/specs/mcp/tools.md` 26 行目の `get-strokes`（U3）、`README.md` 172 行目（`session-workflow.md`「畳み方」の写し。path と Method の両方）、`docs/specs/structure/system-structure.md` 45 行目（`server/api/` の列挙に `sessions` を足す）。同じ表・同じページのエージェントが叩く endpoint の行は触らない

## 11. 完了条件の確認（Gitea #17「完了条件」）

- [x] 11.1 `grep -rn "api/strokes" app server shared test .claude` に残るのがエージェントが叩く endpoint（`overview` / `send-back` の GET / `question` / `proposal` / `submission`）と MCP tools だけであること。1 行ずつ判定する — 残る 49 行を 1 行ずつ判定して**すべてエージェントが叩く endpoint**。内訳は `server/mcp/tools/{get-overview,get-send-back,send-question,submit-document}.ts`（A1・A4・A5・A7）とその単体テスト、`server/utils/stroke/{submission-path,ai,reap}.ts`・`shared/stroke.ts`・`test/server/utils/stroke/ai.test.ts`（A8）、`test/server/middleware/mcp-token.test.ts:81`（A1）、`test/server/api/strokes/{question,proposal}/index.post.test.ts`（A5・A7）とそこを指すファイル参照、E2E の A5 / A7 / A8。**`get-strokes` は U3 だったので直した**（8.4）。走査範囲の外も自分で見て、`scripts/stroke-check.ts` のセッションの endpoint のマッチャ 2 つを直した（8.5）
- [x] 11.2 問い返しの回答送信（`useAgentQuestion`）が 404 にならないこと（9.2 の新しい 2 件と、9.4 の stub を外した E2E 3 件で判定する） — 単体は `/api/sessions/session-1/answer`・`/api/sessions/session-1/invoke-agent` を全文で突き合わせて pass。E2E は `stubFollowupAnswer` を外した 3 件が実物の U7 を通って pass
- [x] 11.3 `openspec validate --all --store stroke` でこの change が valid であること。`server/session-management` の MODIFIED delta が `openspec/specs/` の Requirement 見出しと一致すること — `✓ change/fix-session-api-namespace`・`✓ spec/server/session-management`。`✗` が出るのは着手前から壊れている他の change 9 本で、この change の範囲外
- [x] 11.4 **親へ引き継ぐものを報告に書く**（design にしか残らず、archive すると辿れなくなるため）— 据え置いた docblock、親の `openspec/` の旧 ticket 3 本、**`docs/specs/mcp/tools.md` 26 行目**・**`README.md` 172 行目**・**`docs/specs/structure/system-structure.md` 45 行目**の 3 行（→ **引き継ぎは解消した**。報告の後に追加の承認を得たので、この change が 10.6 で直した）、**`docs/specs/reference/stroke-modules.md` 56〜58 行目と `docs/specs/architecture/question-flow.md` の 9 箇所**（`/api/:id/…` と名前空間を落とした形。`shared/stroke.ts` と `ws-channels.ts` で直したのと同じ形が docs に残る。移設が作ったずれではないので緊急度は低い）、**`test/e2e/stroke-exit.spec.ts:140` の並走時の不安定さ**（スタブの登録簿が run 全体で共有されるためで、この change とは独立。`fix-session-api-layout` でも踏んでいる）

## 12. レビュー

- [x] 12.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。対象は 2〜11 の差分すべてと artifact。指摘が出たら直して再実行し、**2 レビュアーが両方パスするまで続ける**（この環境に `typescript-reviewer` エージェントは無いので、`/santa-method` の既定どおり独立した 2 つの汎用レビュアーで代替する） — 独立した 2 レビュアーが**1 巡目で両方 PASS**（critical 0 件）。rubric は 7 項目（移設の完全性・エージェントが叩く endpoint との取り違え・無言で壊れる箇所・技術的正しさ・基準の docs を触っていないこと・`CLAUDE.md`「禁止事項」・artifact との整合）。両者が独立に確かめたもの: design の表の全数が差分に在ること、`send-back` は POST（U9）だけが移り GET（A4）は `server/api/strokes/[id]/send-back/index.get.ts` に残ること、`wsPathPattern` と WS route が同じ差分に在ること、`page.route` と `page.unroute` の pattern が対で直っていること、`scripts/stroke-check.ts` の実行される正規表現 2 つが直り画面の route（`:430`・`:431`）は据え置かれていること、移した 7 本の `await import()` / `vi.mock` が実在する path を指し `test/server/api/sessions/[id]/index.delete.test.ts` の相対 path だけが 1 段深くなっていること、`docs/` の変更が承認済み 4 ページだけであること、新しく書いた日本語に当て字も新しい短縮形も無いこと

## 13. 締め

- [x] 13.1 change の成果物を commit する（この worktree のブランチへ直接。`CLAUDE.md`「Worktree 運用」）。`git push -u origin fix-session-api-namespace` の後、`tea pr create --base pre3` で PR を出す（マージはしない） — commit `0a4ae731`（59 ファイル。docs 4 ページを含めて 1 つの commit。`Co-Authored-By` は付けない）。`origin/fix-session-api-namespace` へ push し、PR [#26](http://192.168.1.202/gitea/grrowapp/stroke/pulls/26)（`pre3` <- `fix-session-api-namespace`）を出した。マージはしていない
- [x] 13.2 ユーザーから完了承認を得て、`openspec/tickets/fix-session-api-namespace.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）。**この change では親が PR のマージをもって代行するので、担当は 13.1 まで進めて親へ報告する**
