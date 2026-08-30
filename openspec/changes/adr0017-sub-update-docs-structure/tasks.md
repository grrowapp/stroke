## 1. 構造の正をひとつにする

- [ ] 1.1 `docs/specs/core/system-structure.md` に「この文書が構造の正であり、`openspec/specs/app-structure` と食い違ったらこちらが勝つ」ことを明記する
- [ ] 1.2 `docs/specs/core/system-structure.md` のディレクトリ構造に `modules/` を加える（画面の階層に属さない自己完結の機能の置き場。判定基準は `app-structure` が持つ）
- [ ] 1.3 `docs/specs/core/system-structure.md` の `app/components/` の切り方（`ui/` ＋機能単位）が到達点であることを、現状との差とあわせて読めるようにする
- [ ] 1.4 `docs/agents/` から構造の資料を引くときの読む順（規範 → spec → 移行課題）が分かるようにする

## 2. 棚卸しを実態に合わせる

- [ ] 2.1 `docs/specs/core/file-components.md` から、モジュールへ移した分を落とす（`MarkdownPre` / `CodeBlock` / `MermaidDiagram` / `DocumentView` / `DocumentEditor`）
- [ ] 2.2 `docs/specs/core/file-composables.md` に移設分があれば落とす
- [ ] 2.3 `modules/markdown/` の中身が、components の棚卸しとは別の枠で読めるようにする（モジュールは画面の部品ではない）

## 3. 移行課題を更新する

- [ ] 3.1 `docs/specs/plan/structure-migration.md` の「`global/MarkdownPre.vue` は規範の区切りに従えない唯一の例外」を解消済みとして更新する（Nuxt module の `addComponent({ global: true })` で制約が外れた）
- [ ] 3.2 markdown 関連の行（`MarkdownNodes.ts` の解消済み記載など）を実態に合わせる
- [ ] 3.3 `components/` の再編（`ui/` ＋機能単位）が**この change では動かない**ことを明記する。移行課題として残す

## 4. テストの置き場を合わせる

- [ ] 4.1 `test/app/components/workspace/markdown-sanitize.test.ts` を写し元に合わせて移す
- [ ] 4.2 `test/app/components/workspace/markdown-fence-position.test.ts` を写し元に合わせて移す
- [ ] 4.3 `test/app/components/workspace/markdown-roundtrip.test.ts` の置き場を決める（**写し元が無い**。採用しなかった TipTap の挙動を記録するもので、対応するソースが存在しない）
- [ ] 4.4 写し元を持たないテストの置き場を規範に書く

## 5. `@nuxtjs/mdc` の実測を資料に残す

`create-module-markdown` の実装で、推測が7回崩れた。うち3つは**黙って壊れる**ので、change が archive されて design が消えた後も残す必要がある。置き場は `docs/specs/reference/mdc-observations.md`（`upstream-observations.md` と同じ「調べて分かった事実」の枠。決定ではないので ADR にしない）。

- [ ] 5.1 `docs/specs/reference/mdc-observations.md` を作り、`CLAUDE.md` の Docs 節に載せる
- [ ] 5.2 **解析を自前で組み直すとハイドレーションが壊れる**ことを書く（クライアントの再解析で shiki の色が SSR とずれ、**アプリ全体のアイコンが消える**。markdown 本文には症状が出ないので気づけない。`<MDC>` のスロットだけ差し替えること）
- [ ] 5.3 **offset 0 から始まる要素は `position` が `undefined`** になることを書く（`parser/compiler.js` の真偽判定に 0 が落ちる。0 を書くと文書の冒頭が黙って `[0,0)` を指す）
- [ ] 5.4 **記法によって `position` が記号を含むか違う**ことを書く（`**強調**` は含まない、`` `インラインコード` `` は含む。長さを按分すると1〜2文字ずれた位置を黙って返す）
- [ ] 5.5 `keepPosition` は `MDCParseOptions` であって `ModuleOptions` ではないことを書く
- [ ] 5.6 **`pre` の `position` も `code` も DOM に出ない**ことを書く（`MDCRenderer` が `node.position` を捨て、`code` は `MarkdownCode` の props 宣言で `attrs` から抜ける）
- [ ] 5.7 フェンスの生テキストと表示文字列の差を書く（4桁のタブストップ・器のインデント剥がし・引用記号の剥がし・末尾改行の付与・メタの分離。**行の並びは保たれる**）
- [ ] 5.8 CRLF と front matter でオフセットの基準がずれることを書く
- [ ] 5.9 それぞれについて、**どのテストが固定しているか**を書く（パーサを上げて挙動が変われば落ちる先を示す）

## 6. 検証

- [ ] 5.1 `yarn test` が通ることを確かめる（移動でテストが落ちないこと）
- [ ] 5.2 `yarn check`（typecheck + openspec validate）が通ることを確かめる
- [ ] 5.3 資料に書いたパスが実在することを確かめる（`docs/specs/core/` の参照先が壊れていないこと）
