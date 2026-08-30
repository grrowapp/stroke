## Why

`create-module-markdown` で markdown を `modules/markdown/` へ出した結果、構造の資料が実態と合わなくなった。次に構造へ触る人が、資料を読んでも `modules/` の存在を知れない。

加えて、**構造の規範が2つあって内容が食い違っている**ことが分かった。`openspec/specs/app-structure` は「`app/components/` と `app/composables/` の配下は階層ディレクトリ（`workspace/` / `shared/`）で分ける」と定め、`docs/specs/core/system-structure.md` は「`ui/` ＋機能単位で切る」と定める。どちらに従えばよいかが決まらない。これは今回の実装で気づいたもので、元からある食い違いである。

## What Changes

- `docs/specs/core/system-structure.md` のディレクトリ構造に `modules/` を加える。画面の階層に属さない自己完結の機能の置き場として定義する
- `docs/specs/core/file-components.md` / `file-composables.md` の棚卸しから、モジュールへ移した分を落とす
- `docs/specs/plan/structure-migration.md` の「`global/MarkdownPre.vue` は規範の区切りに従えない唯一の例外」を、解消済みとして更新する。Nuxt module の `addComponent({ global: true })` が同じ登録を行うため、置き場の制約は無くなった
- `test/` の置き場を実態に合わせる。規範は「ソースの構造をそのまま写す」だが、`test/app/components/workspace/markdown-*.test.ts` の写し元がモジュールへ移った
- **構造の規範が2つある状態を解く。** どちらが正かを決め、もう一方をそれに従わせるか、役割を分ける

**振る舞いは変えない。** コードに手を入れるのは `test/` の置き場だけで、それも移動である。

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `app-structure`: `create-module-markdown` が `modules/` の判定基準を加えた。この change は、そこと `docs/specs/core/system-structure.md` の食い違い（階層ディレクトリ vs `ui/` ＋機能単位）を解く。**どちらを正とするかは design で決める**。テストの置き場（ソースの構造を写す）がモジュールに対してどうなるかも定める

## Impact

**資料**

- `docs/specs/core/system-structure.md` — ディレクトリ構造に `modules/` を追加。`app/components/` の切り方の規範を `app-structure` と揃える
- `docs/specs/core/file-components.md` — `MarkdownPre` / `CodeBlock` / `MermaidDiagram` / `DocumentView` / `DocumentEditor` の行を落とす
- `docs/specs/core/file-composables.md` — 移設分があれば落とす
- `docs/specs/plan/structure-migration.md` — `MarkdownPre` の例外の行を解消済みに

**テスト**

- `test/app/components/workspace/markdown-roundtrip.test.ts` / `markdown-sanitize.test.ts` — 写し元がモジュールへ移ったので、置き場を合わせる
- `test/app/components/workspace/markdown-fence-position.test.ts` — 同上。これは `create-module-markdown` で足したもの

**依存**

`create-module-markdown` の実装が終わってから行う。実装が動くと資料に書くべき内容も動く。
