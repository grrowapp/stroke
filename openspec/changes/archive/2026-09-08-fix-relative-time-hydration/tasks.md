> **差し戻し（2026-09-08）。** 最初の実装（`useState` で基準時刻を配る方式）は規範の外にあり撤回した（design 冒頭・ticket「撤回」）。以下は規範の内側でやり直した design（D1〜D4）に対する tasks。1 は撤回前に済んでいる。

## 1. 着手の記録

- [x] 1.1 `openspec/tickets/fix-relative-time-hydration.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（この worktree のブランチは `pre5`）。既に同じものがあれば追記しない。既存の項目は消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. 落ちるテストを先に置く

- [x] 2.1 `test/e2e/relative-time-hydration.spec.ts` を書く（design D3）。`context.addInitScript` でブラウザの `Date.now()` を +8 日ずらし、`page.route` で `/projects` の SSR の HTML を控え、`project-last-modified` 列が SSR の HTML では全件空で、hydration 後の DOM では `lastModified` を持つ行に文言が入っていることを見る。`markdown-hydration.spec.ts` の SSR の HTML を読む手を写す。`resetBoard` は要らない
- [x] 2.2 `yarn build && yarn test:e2e test/e2e/relative-time-hydration.spec.ts` で、**直す前に落ちる**ことを確かめる（SSR の HTML に「今」等の文言が入っている） — 直す前の実測は撤回前の 2026-09-08 の run（SSR の HTML の列が「今」×3）で取れており、この spec の「SSR の列が空」の検査はその HTML で落ちる。コードを戻して再実行はしていない
- [x] 2.3 `test/app/composables/useRelativeTime.test.ts` に `useRelativeTime()` のケースを足す（design D3。`@vitest-environment happy-dom`）。SSR（`renderToString`）は空・setup の時点は空・mount 後は相対時刻、の3点。`formatRelativeTime` の既存ケースは変えない

## 3. mount の後にだけ描く（design D1 / D2）

- [x] 3.1 `app/composables/useRelativeTime.ts` に `useRelativeTime(): (iso: string) => string` を足す。`onMounted` で立つフラグが `false` の間は空文字、`true` になったら `formatRelativeTime(iso)`。docblock に規範（`data-fetching.md`「時刻は SSR マークアップに入れず `onMounted` の後ろに置く」）と、空文字にする理由（`undefined` は列を畳む・「—」は取れない印）を書く。`formatRelativeTime` と `STYLE` は変えない
- [x] 3.2 `app/pages/projects/index.vue` — setup で `const relativeTime = useRelativeTime();` を取り、テンプレートの `formatRelativeTime(project.lastModified)` を `relativeTime(project.lastModified)` にする
- [x] 3.3 `app/pages/index.vue` — 同様に `row.occurredAt` の呼び出しを置き換える
- [x] 3.4 `app/pages/projects/[projectId]/specs/index.vue`・`tasks/index.vue`・`steering/index.vue` — `computed` の中の呼び出しを置き換える。`useRelativeTime()` は `computed` の外（setup 直下）で1回呼ぶ
- [x] 3.5 `formatRelativeTime` を直接 import している本番ルートが残っていないことを `grep -rn "formatRelativeTime" app --include=*.vue` で確かめる（残ってよいのは `pages/prototype/projects.vue` だけ）

## 4. 検証

- [x] 4.1 `yarn test` — 単体テストが通る（2.3 を含む） — 77 ファイル 979 件 pass
- [x] 4.2 `yarn typecheck` — pass
- [x] 4.3 `yarn build && yarn test:e2e` — 2.1 が通り、既存の E2E（`projects.spec.ts` の最終更新・`design-token.spec.ts` の列の色・`markdown-hydration.spec.ts`）が落ちていない。一括実行はハーネスのメモリ監視に止められるので、3 回に分けて順に回す — 2026-09-08: 全 16 spec 244 件 pass（42 / 95 / 107）
- [x] 4.4 dev で警告が消えたことを手で確かめる。空きポートで `yarn dev --port <n>` を起こし、headless Chromium（`node_modules/playwright`）で `Date.now()` を +5 日ずらして `/projects` を開き、console に `Hydration text content mismatch` が**出ない**こと・dev ログに `<RouteProvider ... vnode=` のダンプ行が**増えない**こと・mount 後の列に相対時刻が入ることを見る。本家接続中に出る接続ドットの style/attribute mismatch は対象外で、出ていてよい。**起こしたサーバーとブラウザは必ず止め、ポートの解放を確かめる**
- [x] 4.5 4.4 の結果を ticket「再確認」の下に1段落で書き足す

## 5. 上位資料への整合反映（design D4。承認を得てから書く）

- [x] 5.1 `docs/specs/structure/file-composables.md` の事実の修正 3 箇所（16 行目・44 行目・120〜148 行目）を差分の形でユーザーへ示し、承認を得る。規範 `data-fetching.md` は触らない。**承認前に docs を書き換えない** — 2026-09-08 に 3 箇所を示し、ユーザー「進めろ」で承認
- [x] 5.2 承認された差分だけを書く。却下された項目は design D4 に「却下」と理由を残す — 3 箇所を書いた。却下なし。`data-fetching.md` は未変更

## 6. レビュー

- [x] 6.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。対象は 2〜5 の差分すべて。指摘が出たら直して再実行し、**完全にパスするまで続ける** — 2026-09-08: 独立した 2 レビュー（B / C）とも 1 周目で PASS、重大な指摘なし。提案のうち 4 点を反映（`projects.spec.ts` の最終更新の検査に「空でない」を追加、design D3 の文言、E2E ヘッダのパス表記、docblock の「全件 undefined」）。下層シェルのチップの mismatch（本家接続中）を proposal「対象の線引き」へ追記。反映後に単体・typecheck・E2E（relative-time / projects）を再実行し pass

## 7. 締め

- [x] 7.1 change の成果物を commit する（この worktree のブランチへ直接。`CLAUDE.md`「Worktree 運用」）。コミットメッセージに直した5画面と composable、E2E 1本を1行で残す — `1bb09ac0`「fix: 相対時刻を SSR で描かず mount の後にだけ描く」（pre5、2026-09-08）。親の `openspec/` 側（proposal / design / tasks / ticket）は未コミットで、親の取り込み commit に委ねる
- [x] 7.2 ユーザーから完了承認を得て、`openspec/tickets/fix-relative-time-hydration.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」） — 2026-09-08 ユーザー「進めろ」で承認。docs の修正は `1bb09ac0` の後に別 commit
