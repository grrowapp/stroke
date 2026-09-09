## 1. 構造の正をひとつにする

- [x] 1.1 `docs/specs/core/system-structure.md` に「この文書が構造の正であり、`openspec/specs/app-structure` と食い違ったらこちらが勝つ」ことを明記する
- [x] 1.2 `docs/specs/core/system-structure.md` のディレクトリ構造に `modules/` を加える（画面の階層に属さない自己完結の機能の置き場。判定基準は `app-structure` が持つ）
- [x] 1.3 `docs/specs/core/system-structure.md` の `app/components/` の切り方（`ui/` ＋機能単位）が到達点であることを、現状との差とあわせて読めるようにする
- [x] 1.4 `docs/agents/` から構造の資料を引くときの読む順（規範 → spec → 移行課題）が分かるようにする（`docs/agents/issue-tracker.md`「artifact を書く前に読むもの」に置いた）

## 2. 棚卸しを実態に合わせる

- [x] 2.1 `docs/specs/core/file-components.md` から、モジュールへ移した分を落とす（`MarkdownPre` / `CodeBlock` / `MermaidDiagram` / `DocumentView` / `DocumentEditor`）
- [x] 2.2 `docs/specs/core/file-composables.md` に移設分があれば落とす（移設分は無い。無いことを明記し、旧 `DocumentEditor.vue` の参照だけ直した）
- [x] 2.3 `modules/markdown/` の中身が、components の棚卸しとは別の枠で読めるようにする（モジュールは画面の部品ではない）（`system-structure.md` §3 に全数、`file-components.md` に移設先の対応表）

## 3. 移行課題を更新する

- [x] 3.1 `docs/specs/plan/structure-migration.md` の「`global/MarkdownPre.vue` は規範の区切りに従えない唯一の例外」を解消済みとして更新する（Nuxt module の `addComponent({ global: true })` で制約が外れた）
- [x] 3.2 markdown 関連の行（`MarkdownNodes.ts` の解消済み記載など）を実態に合わせる
- [x] 3.3 `components/` の再編（`ui/` ＋機能単位）が**この change では動かない**ことを明記する。移行課題として残す

## 4. テストの置き場を合わせる

ADR-0017 と ticket のとおり、この節は `adr0017-sub-create-reference-mdc`（archive 済み）が引き取った。4.1 / 4.2 は実測で済（`225f37de` で移設。`test/app/components/workspace/` は存在しない）。

- [x] 4.1 `test/app/components/workspace/markdown-sanitize.test.ts` を写し元に合わせて移す（済: `test/modules/markdown/sanitize.test.ts`）
- [x] 4.2 `test/app/components/workspace/markdown-fence-position.test.ts` を写し元に合わせて移す（済: `test/modules/markdown/fence-source.test.ts`）
- [ ] 4.3 `test/app/components/workspace/markdown-roundtrip.test.ts` の置き場を決める（**写し元が無い**。採用しなかった TipTap の挙動を記録するもので、対応するソースが存在しない）— 現状は `test/modules/markdown/runtime/edit/roundtrip.test.ts`（`create-reference-mdc` が置いた）。design 決定3・delta spec「写し元を持たないテストは…同じ場所に混ぜてはならない」と、その置き場が食い違う。ユーザー判断待ち
- [ ] 4.4 写し元を持たないテストの置き場を規範に書く — 4.3 の決着待ち

## 5. `@nuxtjs/mdc` の実測を資料に残す

`create-module-markdown` の実装で、推測が7回崩れた。うち3つは**黙って壊れる**ので、change が archive されて design が消えた後も残す必要がある。置き場は `docs/specs/reference/mdc-observations.md`（`upstream-observations.md` と同じ「調べて分かった事実」の枠。決定ではないので ADR にしない）。

この節は `adr0017-sub-create-reference-mdc`（archive 済み）が実施した。実測で済（資料が在り、7件と固定するテストが書かれ、`CLAUDE.md` の Docs 節から辿れる）。

- [x] 5.1 `docs/specs/reference/mdc-observations.md` を作り、`CLAUDE.md` の Docs 節に載せる
- [x] 5.2 **解析を自前で組み直すとハイドレーションが壊れる**ことを書く（クライアントの再解析で shiki の色が SSR とずれ、**アプリ全体のアイコンが消える**。markdown 本文には症状が出ないので気づけない。`<MDC>` のスロットだけ差し替えること）
- [x] 5.3 **offset 0 から始まる要素は `position` が `undefined`** になることを書く（`parser/compiler.js` の真偽判定に 0 が落ちる。0 を書くと文書の冒頭が黙って `[0,0)` を指す）
- [x] 5.4 **記法によって `position` が記号を含むか違う**ことを書く（`**強調**` は含まない、`` `インラインコード` `` は含む。長さを按分すると1〜2文字ずれた位置を黙って返す）
- [x] 5.5 `keepPosition` は `MDCParseOptions` であって `ModuleOptions` ではないことを書く
- [x] 5.6 **`pre` の `position` も `code` も DOM に出ない**ことを書く（`MDCRenderer` が `node.position` を捨て、`code` は `MarkdownCode` の props 宣言で `attrs` から抜ける）
- [x] 5.7 フェンスの生テキストと表示文字列の差を書く（4桁のタブストップ・器のインデント剥がし・引用記号の剥がし・末尾改行の付与・メタの分離。**行の並びは保たれる**）
- [x] 5.8 CRLF と front matter でオフセットの基準がずれることを書く
- [x] 5.9 それぞれについて、**どのテストが固定しているか**を書く（パーサを上げて挙動が変われば落ちる先を示す）

## 6. 検証

（番号を 5.x → 6.x に直した。5 節と重複していた）

- [x] 6.1 `yarn test` が通ることを確かめる（移動でテストが落ちないこと）（pre10 で実測: 58 files / 730 tests pass）
- [x] 6.2 `yarn check`（typecheck + openspec validate）が通ることを確かめる（`yarn typecheck` exit 0。`openspec validate --all --store stroke` は `change/update-docs-structure` ✓。失敗 14 件は他 change の既存の問題で、この change の範囲外）
- [x] 6.3 資料に書いたパスが実在することを確かめる（`docs/specs/core/` の参照先が壊れていないこと）（今回書いたパスは全て実在。既存の古い参照 `openspec/changes/restructure-app-directories/...`（`file-composables.md`）は archive 済みで、今回は触っていない）
