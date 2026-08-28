# update-docs-structure

`create-module-markdown` の実装で判明した、構造の資料と実態の食い違いを直す。

markdown を `modules/markdown/` へ切り出したことで、構造の規範と棚卸しが実態と合わなくなった。実装の中で見つかった食い違いは次のとおり。

- `docs/specs/core/system-structure.md` のディレクトリ構造に `modules/` が無い。画面の階層に属さない自己完結の機能の置き場が規範に定義されていない
- `docs/specs/core/file-components.md` / `file-composables.md` の棚卸しに、モジュールへ移した分が残っている
- `docs/specs/plan/structure-migration.md` が `global/MarkdownPre.vue` を「規範の区切りに従えない唯一の例外」と記しているが、Nuxt module の `addComponent({ global: true })` で解消した
- `test/app/components/workspace/markdown-*.test.ts` の置き場が、ソースの構造を写すという規範（`test/` にソースの構造をそのまま写す）と合わなくなった
- `openspec/specs/app-structure` の「`app/components/` と `app/composables/` の配下は階層ディレクトリで分ける」と、`docs/specs/core/system-structure.md` の「`ui/` ＋機能単位で切る」が食い違っている（`create-module-markdown` では前者に delta を当てたが、後者は手つかず）

起票時点で意図したのは、これらを実態に合わせ、次に構造へ触る作業が資料だけを読んで判断できる状態にすること。実装の振る舞いは変えない。
