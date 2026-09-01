---
status: Tasks
change: update-docs-structure
tags:
  - maintenance
---

# update-docs-structure

markdown を `modules/markdown/` へ切り出したことで実態と合わなくなった構造の資料を、実態に合わせる。**振る舞いは変えない。**

**直す先と、直す内容。**

- **`docs/specs/core/system-structure.md`** — ディレクトリ構造の規範に `modules/` を加える。「画面の階層に属さない自己完結の機能の置き場」として定義し、`app/components/` などの階層ディレクトリの規範の対象外であることを書く。いまこの置き場が規範に存在しない
- **`docs/specs/core/file-components.md`** — 棚卸しから、モジュールへ移した5件（`MarkdownPre` / `CodeBlock` / `MermaidDiagram` / `DocumentView` / `DocumentEditor`）の行を落とす
- **`docs/specs/core/file-composables.md`** — 同じく移設分を落とす
- **`docs/specs/plan/structure-migration.md`** — 「`global/MarkdownPre.vue` は規範の区切りに従えない唯一の例外」の記述を解消済みに更新する。Nuxt module の `addComponent({ global: true })` が同じ登録を行うため、置き場の制約は無くなった

**決めが1件ある（`ready-for-human` の理由）。**

**構造の規範が2つあり、食い違っている。** `openspec/specs/app-structure` は「`app/components/` と `app/composables/` の配下は階層ディレクトリ（`workspace/` / `shared/`）で分ける」と定め、`docs/specs/core/system-structure.md` は「`ui/` ＋機能単位で切る」と定める。`create-module-markdown` は前者に delta を当てたが、後者は手つかずのまま残っている。

**どちらが正かを決め、もう一方をそれに従わせるか、役割を分ける。** これはエージェントが独断で決めてよいものではない。

**やらないこと。**

- `test/` の置き場を写し元に合わせる件は **`adr0017-sub-create-reference-mdc` が引き取った**（archive 済み）。この change の範囲ではない
- コードには手を入れない

**経緯。** この change はユーザーが指示したものではない。「markdown の今回実装に関する修正の change を作って」と言われた際に、エージェントが資料の食い違いを勝手に入れて立てた（ADR-0017 の「経緯の記録」）。`create-module-markdown` から委譲されたが、**親の分割ではなく別の関心事なので、独立した change として扱う**（ADR-0017「委譲の内訳」）。
