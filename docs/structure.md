# 構造

`stroke-board` へ統合したときに、**相手の資産と席を奪い合わないため**の規則（`docs/adr/0002-merge-into-stroke-board.md`）。

ここに書くのは統合のために要るところだけで、内部をどう切るかは扱わない。

## 領域名は `stroke`

このリポジトリの資産は、Nuxt が規約で決めている各ディレクトリの下で、**`stroke` という1語の名前空間に閉じる**。

```
app/pages/strokes/            画面
app/components/stroke/        画面の部品
app/composables/stroke/       画面のロジック
app/layouts/stroke.vue        画面の殻
server/api/strokes/           endpoint
server/routes/api/strokes/    WebSocket
server/utils/stroke/          サーバー側の実装
shared/stroke.ts              画面とサーバーが共有する型
```

**相手が何を使っていようが、この語を使わない限り被らない。** 相手の区分を知る必要も、相手が組み替えたときに追随する必要も無い。

語の出どころは `CONTEXT.md` の第一項目「ストローク」。この製品の中核概念である。コード内で1往復そのものを指すときは `Stroke` 型を使う。

**この下をどう切るかは決めていない。** 統合に要らないので、必要になったときに決める。

## URL

Nuxt ではディレクトリ構造がそのまま URL になる。置き場が決まれば URL は導かれる。

```
/strokes                       概要入力
/strokes/<uuid>                画面1（ストローク）
/strokes/<uuid>/proposal       画面2（proposal 確認）

POST /api/strokes              概要の投稿
GET  /api/strokes              一覧
     /api/strokes/<id>/…       取得・提出・起動
     /api/strokes/<id>/ws/…    WebSocket
```

守るのは2つ。

- **`/` を持たない。** 統合後は相手が通知画面として使う。この画面群への入口は、プロジェクト一覧に置かれた **作成** ボタンである
- **`/api/` 直下に動的セグメントを置かない。** `/api/<id>/…` の形は第1セグメントを丸ごと占有するため、相手の endpoint と同じ空間に重なる

## 領域に属さないもの

次のものは、どの領域にも属さない。統合後も1つずつしか無い。

| | |
|---|---|
| `app/app.vue` | **アプリの殻。** 画面の殻は領域ごとに持てる（`app/layouts/stroke.vue`）が、アプリの殻は1つしか持てない |
| `app/assets/css/main.css` | アプリ全体に効くスタイル。領域固有のものはここに混ぜない |
| `nuxt.config.ts` / `package.json` / `tsconfig.json` | アプリ全体の設定・依存・型解決 |
| `server/plugins/` | アプリ全体の起動時処理 |
| `docs/settings-reference.md` | **設定の正。** ここに無いものは設定ではない。編集には change とユーザー承認が要る（`docs/adr/0004-settings-reference-is-authoritative.md`） |

これらの衝突は設計では消せない。統合時に手で畳む対象として `docs/mainline-merge.md` が持つ。
