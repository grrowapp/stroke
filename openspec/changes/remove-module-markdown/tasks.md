## 1. 着手の記録と決定

- [ ] 1.1 `openspec/tickets/remove-module-markdown.md` の `status` を `Doing` にする
- [ ] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（既に同じものがあれば追記しない。`tags` は追記のみで既存の項目を消さない）
- [ ] 1.3 **決める**: `openspec/specs/markdown/module` を markxdown 側へ移すか、stroke-board に残すか（design.md D11）。ユーザーへ挙動の差で示し、決定を得る
- [ ] 1.4 **決める**: `test/modules/markdown/**` の扱い。写し元が外部 package へ出るため、markxdown 側へ移すか stroke-board に残すかを決める（`openspec/specs/app-structure` の「テストは写し元の構造に従う」に当たる）。ユーザーへ示し、決定を得る
- [ ] 1.5 **決める**: stroke-board が `markxdown` を引く形（npm 公開 / ファイル参照 / git 参照）。`package.json` の書き方だけが変わる（design.md「Risks / Trade-offs」）

## 2. 切り出し先を `@nuxt/module-builder` の構成にする

- [ ] 2.1 `~/work/markxdown` を `@nuxt/module-builder` の標準構成（`src/module.ts` + `src/runtime/`、`playground/`、`nuxt-module-build build` で `dist/`）にする
- [ ] 2.2 `modules/markdown` に触れたコミットだけを `git subtree split` などで取り出し、markxdown の履歴の土台にする（design.md D8）
- [ ] 2.3 `package.json` の `name` を `markxdown`、`configKey` を `markxdown` にする（`50f920f5` で `ModuleOptions` の入口は作成済み）
- [ ] 2.4 `dependencies` に `@nuxt/kit` `@nuxtjs/mdc` `@vueuse/core` `mermaid` `remark-mdc` を、`peerDependencies` に `vue` `vue-router` `@nuxt/ui` を宣言する（design.md D9）
- [ ] 2.5 `useColorMode` が `@nuxt/ui` 経由で解決されることを確かめる。`@nuxtjs/color-mode` を直接の依存にしない（design.md D6）
- [ ] 2.6 `playground/` で起動し、本文の描画・文書の編集・位置の対応が働くことを確かめる

## 3. `@nuxt/ui` へ寄せる

- [ ] 3.1 `components: { prose: false }` をやめ、Prose を有効化する（design.md D2）
- [ ] 3.2 `runtime/assets/markdown.css`（353 行）が持つ本家写しの見た目を、`ui.prose.*` の theme 上書きへ移す。見え方を変えない
- [ ] 3.3 `MarkdownCode.vue` を `ProsePre` に置き換える。`MarkdownFence` の振り分け先を `ProsePre` にする（design.md D3）
- [ ] 3.4 `MarkdownEditor.vue` の入力部品が `UTextarea` / `UButton` であることを確かめる（`210d33b8` で実施済み）
- [ ] 3.5 `MarkdownDiagram.vue` のエラー枠・読み込み枠が `UAlert` / `USkeleton` であることを確かめる（`4eec3005` で実施済み）
- [ ] 3.6 `src/module.ts` のコメントのうち、「`modules/` の自動読み込みが後に走るので `@nuxt/ui` は Prose を登録しない。これは害にならない」という現状の説明を、読み込み順が反転した後の前提（`@nuxt/ui` より前に並べ、Prose を使う）へ書き換える
- [ ] 3.7 `sb-*`・`sb-doc`・`MarkdownFence` など stroke-board 固有の名前を package の名前へ改める（design.md D7）

## 4. CSS の配布を `@import` 1 行にする

- [ ] 4.1 package 側の CSS に `@source` を持たせ、利用側が1行の `@import` で取り込める形にする（design.md D5）
- [ ] 4.2 `playground/` のビルド成果物を grep し、モジュールの中だけが名乗るクラスが生成されていることを確かめる（利用側に `@source` を書かずに済んでいること）
- [ ] 4.3 `@layer` の並びが theme → base → components → utilities の後にモジュールの層が来ることを確かめる

## 5. stroke-board 側を切り替える

- [ ] 5.1 `package.json` に `markxdown` を依存として足す（1.5 の決定に従う）。`@nuxtjs/mdc` `mermaid` を markxdown 側の `dependencies` に寄せ、stroke-board の宣言を見直す
- [ ] 5.2 `nuxt.config.ts` の `modules` へ `markxdown` を `@nuxt/ui` より前に並べる（design.md D1）
- [ ] 5.3 `modules/markdown/` をリポジトリから消す
- [ ] 5.4 `app/assets/css/main.css` の `@source "../../../modules";` と 4〜17 行の説明コメントを消し、`markxdown` の CSS を `@import` する
- [ ] 5.5 5.3 と 5.4 を同じコミットにまとめる（間で止めると走査からクラスが落ちたまま module が消える）
- [ ] 5.6 `modules/` が空になるので、ディレクトリ自体を消す。1.4 の決定次第で `test/modules/` も同様にする（`openspec/specs/app-structure` の「実体を伴わないディレクトリを作らない」）
- [ ] 5.7 利用側 7 ファイル（`app/components/review/AnnotateSource.vue`、`app/components/review/ApprovalAnnotator.vue`、`app/composables/useAnnotationHighlight.ts`、`app/pages/strokes/[sessionId]/proposal.vue`、`app/pages/projects/[projectId]/approvals/[approvalId].vue`、`app/pages/projects/[projectId]/steering/[name].vue`、`app/pages/projects/[projectId]/specs/[specName]/[document].vue`）の import が変わっていないことを確かめる

## 6. テスト

- [ ] 6.1 `test/modules/markdown/**` を 1.4 の決定に従って移すか残す
- [ ] 6.2 位置の対応のテスト（`markdown-view-position.test.ts` の 12 本を含む）が通ることを確かめる
- [ ] 6.3 `markxdown` を `@nuxt/ui` より後ろに並べたときに本文の見た目が失われることを確かめるテストを足す（design.md D1。並びが逆でも落ちないため、合図をテストで持つ）
- [ ] 6.4 markdown 本文の描画に依存する E2E を通す
- [ ] 6.5 `yarn test` と `yarn test:e2e` を通す
- [ ] 6.6 `yarn typecheck` を通す

## 7. 資料の反映

- [ ] 7.1 1.3 の決定に従い、`openspec/specs/markdown/module` を移すか残すかを実行する
- [ ] 7.2 `docs/specs/structure/system-structure.md` のディレクトリ構造から `modules/markdown` が消えることへの整合反映が要るか確かめ、要るならユーザーへ提案して承認を得てから反映する（`docs/agents/issue-tracker.md`「更新対応」）
- [ ] 7.3 `docs/specs/core/settings-reference.md` へ `markxdown` の設定を載せないこと（design.md D10）が、7.2 の反映後も成立していることを確かめる

## 8. レビュー

- [ ] 8.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。レビューが完全にパスするまで続ける

## 9. 完了

- [ ] 9.1 `openspec validate --all` を通し、change の成果物を commit する
- [ ] 9.2 ユーザーから完了承認を得て、`openspec/tickets/remove-module-markdown.md` の `status` を `Wait-for-archive` にする
