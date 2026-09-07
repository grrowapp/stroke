## 1. 着手の記録

- [ ] 1.1 `openspec/tickets/fix-relative-time-hydration.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [ ] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（この worktree のブランチは `pre5`）。既に同じものがあれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. 落ちるテストを先に置く

- [ ] 2.1 `test/e2e/relative-time-hydration.spec.ts` を書く（design D4）。`context.addInitScript` でブラウザの `Date.now()` を +8 日ずらし、`page.route` で `/projects` の SSR の HTML を控え、`project-last-modified` 列の文言を SSR の HTML と hydration 後の DOM で突き合わせる。`markdown-hydration.spec.ts` の `shapeOfServerHtml` の手を写す。本家に繋がっている必要は無いので `resetBoard` は要らない
- [ ] 2.2 `yarn build && yarn test:e2e --grep relative-time` で、**直す前に落ちる**ことを確かめる（SSR「今」/「N分前」に対して DOM が絶対日時へ書き換わる）。落ちなければテストの前提（走査先の最終更新が7日以内）を疑う
- [ ] 2.3 `test/app/composables/useRelativeTime.test.ts` に `useRelativeTime()` のケースを足す（design D3）。`vi.mock('#imports', ...)` で `useState` / `useNuxtApp` を差し替え、`isHydrating: true` のとき `useState` の基準で描く・`false` のとき `Date.now()` で描く・既存の `formatRelativeTime` のケースが変わらない、の3点。`vitest.config.ts` の alias は広げない

## 3. 基準時刻を1つにする（design D1）

- [ ] 3.1 `app/composables/useRelativeTime.ts` に `useRelativeTime(): (iso: string) => string` を足す。`useState('relative-time-basis', () => Date.now())` を基準に、`import.meta.server || nuxtApp.isHydrating` のときだけ基準を使い、それ以外は `Date.now()`。`formatRelativeTime(iso, now)` と `STYLE` は変えない。docblock に「なぜ hydration 中だけ基準を使うか」（取り直しで未来表記にしない）を書く
- [ ] 3.2 `app/pages/projects/index.vue` — setup で `const relativeTime = useRelativeTime();` を取り、テンプレートの `formatRelativeTime(project.lastModified)` を `relativeTime(project.lastModified)` にする
- [ ] 3.3 `app/pages/index.vue` — 同様に `row.occurredAt` の呼び出しを置き換える
- [ ] 3.4 `app/pages/projects/[projectId]/specs/index.vue`・`tasks/index.vue`・`steering/index.vue` — `computed` の中の呼び出しを置き換える。`useRelativeTime()` は `computed` の外（setup 直下）で1回呼ぶ
- [ ] 3.5 `formatRelativeTime` を直接 import している本番ルートが残っていないことを `grep -rn "formatRelativeTime" app --include=*.vue` で確かめる（残ってよいのは `pages/prototype/projects.vue` だけ）

## 4. 検証

- [ ] 4.1 `yarn test` — 単体テストが通る（2.3 を含む）
- [ ] 4.2 `yarn typecheck`
- [ ] 4.3 `yarn build && yarn test:e2e` — 2.1 が通り、既存の E2E（`projects.spec.ts` の最終更新・`design-token.spec.ts` の列の色・`markdown-hydration.spec.ts`）が落ちていない
- [ ] 4.4 dev で警告が消えたことを手で確かめる。空きポートで `yarn dev --port <n>` を起こし、headless Chromium（`node_modules/playwright`）で `addInitScript` により `Date.now()` を +5 日ずらして `/projects` を開き、console に `Hydration text content mismatch` が**出ない**こと・dev ログに `<RouteProvider ... vnode=` のダンプ行が**増えない**ことを見る。本家接続中に出る接続ドットの style/attribute mismatch は対象外（proposal「対象の線引き」）で、出ていてよい。**起こしたサーバーとブラウザは必ず止め、ポートの解放を確かめる**
- [ ] 4.5 4.4 の結果（警告の有無・ログの増分）を ticket「再確認」の下に1段落で書き足す

## 5. 上位資料への整合反映（design D5。承認を得てから書く）

- [ ] 5.1 design D5 の表の2件（`docs/specs/architecture/data-fetching.md`「規定」への4つ目の手段の追記、`docs/specs/structure/file-composables.md` の3箇所の現状合わせ）を差分の形でユーザーへ示し、承認を得る。**承認前に docs を書き換えない**
- [ ] 5.2 承認された差分だけを書く。却下された項目は design D5 に「却下」と理由を残す

## 6. レビュー

- [ ] 6.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。対象は 2〜5 の差分すべて。指摘が出たら直して再実行し、**完全にパスするまで続ける**

## 7. 締め

- [ ] 7.1 change の成果物を commit する（この worktree のブランチへ直接。`CLAUDE.md`「Worktree 運用」）。コミットメッセージに直した5画面と composable、E2E 1本を1行で残す
- [ ] 7.2 ユーザーから完了承認を得て、`openspec/tickets/fix-relative-time-hydration.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
