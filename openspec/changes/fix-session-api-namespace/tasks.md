## 1. 着手の記録

- [x] 1.1 `openspec/tickets/fix-session-api-namespace.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（この worktree のブランチは `fix-session-api-namespace`、セッション ID は `92d3ea72-e0cf-4412-a969-d5e6aaab99d7`）。既に同じものがあれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. handler の移動（design「handler の移動」）

- [ ] 2.1 移動先のディレクトリを `mkdir -p` で先に作る（`git mv` はディレクトリを作らない）
- [ ] 2.2 U1・U12 を `git mv`（`server/api/strokes/index.post.ts`・`index.get.ts` → `server/api/sessions/`）
- [ ] 2.3 U2 を `git mv`（`strokes/[id]/index.get.ts` → `sessions/[id]/index.get.ts`）。移動先には U11 の `index.delete.ts` が既に居るので、同じディレクトリに 2 Method が並ぶ
- [ ] 2.4 U3・U7・U10・U13・U14 を Endpoint 名のディレクトリごと `git mv`（`strokes/[id]/{strokes,answer,approve,invoke-agent,promote}/` → `sessions/[id]/`）
- [ ] 2.5 U9 だけを移す（`strokes/[id]/send-back/index.post.ts` → `sessions/[id]/send-back/index.post.ts`）。**A4 の `index.get.ts` は `strokes/[id]/send-back/` に残す**
- [ ] 2.6 相対 import が 1 行も変わっていないことを確かめる（深さが変わらないため。design「handler の移動」）。`git diff --cached -M` で 10 本すべてが rename として検出されること
- [ ] 2.7 `find server/api/strokes -type f` が A 系 5 本（`overview`・`send-back/index.get.ts`・`question`・`proposal`・`submission`）だけになっていること。`find server/api/sessions -type f` が U 系 11 本すべてを持つこと

## 3. WS route と `wsPathPattern`（design「WS route と `wsPathPattern`」）

- [ ] 3.1 `git mv` で `server/routes/api/strokes/[id]/ws/` を `server/routes/api/sessions/[id]/ws/` へ（`question.ts`・`proposal.ts`）
- [ ] 3.2 `nuxt.config.ts` の `wsPathPattern` の既定値を `/api/sessions/([^/]+)/ws/{channel}(?:$|[/?#])` にする
- [ ] 3.3 `server/utils/stroke/ws-channels.ts` の doc コメント 2 行（`W1 /api/:id/ws/question`・`W2 /api/:id/ws/proposal`）と、移した route 2 本の docblock を `/api/sessions/:id/ws/…` に直す

## 4. サーバ内の参照（design「サーバ内の自己呼び出し」）

- [ ] 4.1 `server/utils/stroke/invoke.ts` の `invokePath`（U13）と `hasConversation` の一覧取得（U12）を `/api/sessions` に
- [ ] 4.2 `server/plugins/01.reap-running.ts`・`01.activate-approved.ts`・`01.retry-failed.ts` の U12 の一覧取得を `/api/sessions` に
- [ ] 4.3 `server/utils/stroke/submission-path.ts` の docblock から「別 ticket（fix-session-api-path）が直す」の 1 文を消し、A 系と U 系で名前空間が分かれている旨に書き換える。`submissionPath`（A8）と `activatePath`（U15）が返す path は変えない

## 5. 画面（design「画面」）

- [ ] 5.1 `app/pages/strokes/index.vue`（U1・U13）
- [ ] 5.2 `app/pages/strokes/[sessionId]/index.vue`（U2 の 2 箇所・U3・U7）
- [ ] 5.3 `app/pages/strokes/[sessionId]/proposal.vue`（U2・U3）
- [ ] 5.4 `app/composables/useSessionChannel.ts`（W1 / W2 の URL）
- [ ] 5.5 `app/composables/useWaitingRetry.ts`（U2 のポーリング・U13 の起動要求。U11 の削除は既に `/api/sessions/`）
- [ ] 5.6 `app/composables/useProjectApi.ts`（U13）
- [ ] 5.7 `app/composables/useProposalReview.ts`（`base` と `kickSteering`。`base` の doc コメント `/api/<uuid>` も実体に合わせる）
- [ ] 5.8 `app/composables/useAgentQuestion.ts` の `base` を `/api/${sessionId}` → `/api/sessions/${sessionId}`（旧 ticket `fix-agent-question-api-path` の吸収）

## 6. テストの移動と追随（design「テストの移動」「`test/server/api/sessions/index.delete.test.ts` の階層合わせ」）

- [ ] 6.1 U 系のテスト 7 本を `git mv` で `test/server/api/strokes/<name>/` から `test/server/api/sessions/<name>/` へ（`answer`・`approve` の 2 本・`invoke-agent` の 2 本・`promote`・`send-back`）。A 系の `question`・`proposal` は動かさない
- [ ] 6.2 移した 7 本の `await import()` と `vi.mock` が指す handler の path を `server/api/sessions/[id]/…` に直す。**相対 path の段数は変わらない**（深さが同じ）
- [ ] 6.3 移した 7 本の冒頭 docblock の「対象は `server/api/…`」と `describe` の path の表記を `/api/sessions/…` に直す
- [ ] 6.4 `test/server/api/sessions/index.delete.test.ts` を `test/server/api/sessions/[id]/index.delete.test.ts` へ `git mv` し、`'../support'` → `'../../support'`、`'../../../../server/…'` → `'../../../../../server/…'` の深さを 1 段増やす（`await import()` が指す handler は動いていないのでそのまま）
- [ ] 6.5 期待値だけを直すテスト 3 本（`test/app/composables/useWaitingRetry.test.ts` の U13、`test/server/utils/stroke/sweep.test.ts` の `invokePath`、`test/server/middleware/mcp-token.test.ts` の U12。**A1 の行はそのまま**）
- [ ] 6.6 `test/app/composables/useAgentQuestion.test.ts` に、`send` の送り先が `/api/sessions/<id>/answer`（U7）であること、続く起動要求が `/api/sessions/<id>/invoke-agent`（U13）であることを path そのもので検査する 2 件を足す（旧 ticket `fix-agent-question-api-path` の受け入れ条件「この経路を通る自動テストが1本以上ある」）。既存の 3 件は `url.includes()` で分岐するだけで path を見ていないので、根拠にしない

## 7. E2E と `.claude/settings.json`（design「E2E」「`.claude/settings.json`」）

- [ ] 7.1 `test/e2e/agent-question.spec.ts` — U1・U7 の `page.route` 3 箇所・U2 の `RegExp`。**`page.route` と `page.unroute` の pattern を必ず一緒に直す**。A5・A7 はそのまま
- [ ] 7.2 同ファイルの `stubFollowupAnswer` を消し、参照している 3 件から呼び出しを外す。理由を書いた docblock も消す（基底が直ったので stub の理由が無くなり、実物の U7 を通せる。design「`useAgentQuestion` の経路を通るテスト」）
- [ ] 7.3 `test/e2e/proposal-annotation.spec.ts`（U1）・`proposal-persistence.spec.ts`（U1・U2 の 2 箇所）。A7 はそのまま
- [ ] 7.4 `test/e2e/stroke-exit.spec.ts`（U10・U2 の 2 箇所・U14）。A8 はそのまま
- [ ] 7.5 `test/e2e/ws-disconnect.spec.ts`（U1・W1 / W2 の `ws://…` URL）。A5・A7 はそのまま
- [ ] 7.6 `.claude/settings.json` の `curl … /api/strokes` の許可行を `/api/sessions` に

## 8. 据え置き表から拾う docblock（design「`fix-session-api-layout` の据え置き表から拾うもの」）

- [ ] 8.1 `server/api/sessions/[id]/approve/index.delete.ts` の docblock — path `/api/strokes/:id/approve` と、旧ファイル名 `send-back.get.ts` / `send-back.post.ts`
- [ ] 8.2 `server/api/sessions/[id]/approve/index.post.ts` の docblock — 旧ファイル名 `promote.post.ts`・`approve.delete.ts`
- [ ] 8.3 `server/api/sessions/[id]/promote/index.post.ts` の docblock — 旧ファイル名 `approve.delete.ts`・`approve.post.ts`・`activate.post.ts`
- [ ] 8.4 触らないファイルの分（`server/api/strokes/[id]/submission/index.post.ts`・`server/mcp/tools/*`・`server/utils/stroke/*`・`scripts/stroke-check.ts`）と、親の `openspec/` の旧 ticket 3 本は据え置き、design の表のまま親へ引き継ぐことを確かめる

## 9. 検証（design「検証の順序」）

- [ ] 9.1 `yarn typecheck`
- [ ] 9.2 `yarn test` — 移した 7 本・期待値を直した 3 本・新しい 2 件が通ること。`vi.mock` の第 1 引数の付け替え漏れはここでしか落ちない
- [ ] 9.3 `yarn build` の生成物のルート表（`.nuxt/types/nitro-routes.d.ts`）で、`/api/strokes/:id/**` が A 系 5 本だけになり、U 系 9 本が `/api/sessions/**` に移っていることを確かめる
- [ ] 9.4 `yarn test:e2e` — URL が実際に届くことの判定。stub を外した `agent-question.spec.ts` の 3 件が実物の U7 を通ること。**起こしたものは必ず止め、ポートの解放を確かめる**。高負荷で落ちたら負荷が下がってから回し直して切り分ける

## 10. 上位資料への整合反映（design「関連 docs 4 ページの書き換え案」。ユーザー承認済み）

- [ ] 10.1 `docs/specs/structure/system-structure.md` — §1 `routes/` の行と §4 の「セッション系」の 2 箇所
- [ ] 10.2 `docs/specs/architecture/session-workflow.md` — 「畳み方」の 1 行（`GET /api/sessions`・`DELETE /api/sessions/<uuid>`）
- [ ] 10.3 `docs/specs/core/settings-reference.md` — `wsPathPattern` 既定値の 1 箇所
- [ ] 10.4 `docs/specs/structure/file-composables.md` — 5 箇所（表・`useSessionChannel`・`useWaitingRetry`・`useAgentQuestion` の「個別」と「気づいたこと」）
- [ ] 10.5 `docs/specs/api/overview.md`・`server.md`・`sessions/*.md`・`ws/delivery.md`・`contract.md`・`mcp/tools.md`・`plan/*`・`adr/*` を変更していないことを `git status --short docs/` で確かめる（基準は触らない）

## 11. 完了条件の確認（Gitea #17「完了条件」）

- [ ] 11.1 `grep -rn "api/strokes" app server shared test .claude` に残るのが A 系（`overview` / `send-back` の GET / `question` / `proposal` / `submission`）と MCP tools だけであること。1 行ずつ判定する
- [ ] 11.2 問い返しの回答送信（`useAgentQuestion`）が 404 にならないこと（9.2 の新しい 2 件と、9.4 の stub を外した E2E 3 件で判定する）
- [ ] 11.3 `openspec validate --all --store stroke` でこの change が valid であること。`server/session-management` の MODIFIED delta が `openspec/specs/` の Requirement 見出しと一致すること
- [ ] 11.4 **親へ引き継ぐものを報告に書く**（design にしか残らず、archive すると辿れなくなるため）— 据え置いた docblock 8 ファイルと、親の `openspec/` の旧 ticket 3 本

## 12. レビュー

- [ ] 12.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。対象は 2〜11 の差分すべてと artifact。指摘が出たら直して再実行し、**2 レビュアーが両方パスするまで続ける**（この環境に `typescript-reviewer` エージェントは無いので、`/santa-method` の既定どおり独立した 2 つの汎用レビュアーで代替する）

## 13. 締め

- [ ] 13.1 change の成果物を commit する（この worktree のブランチへ直接。`CLAUDE.md`「Worktree 運用」）。`git push -u origin fix-session-api-namespace` の後、`tea pr create --base pre3` で PR を出す（マージはしない）
- [ ] 13.2 ユーザーから完了承認を得て、`openspec/tickets/fix-session-api-namespace.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）。**この change では親が PR のマージをもって代行するので、担当は 13.1 まで進めて親へ報告する**
