---
status: ready-for-agent
change: create-module-markdown
tags:
  - maintenance
---

# create-module-markdown

Nuxt 4 標準の `modules/` を置き場としてパスに用意し、markdown の操作をそこへ切り出して疎結合にする。

markdown を扱う実体が `nuxt.config.ts`（parse 設定）・`app/components/global/`（フェンスの振り分け）・`app/components/workspace/`（コードブロック・図・本文の器・直す面）・`app/assets/css/main.css`（見た目）に散っており、描画の入口も3箇所に割れている。どこに閉じるのかを定めた spec が無く、次に markdown へ触る作業がどこを触ればよいのか参照元を辿らないと分からない。

同じ理由で注釈も動けない。注釈は本家の写しで生テキストの面にしか付けられず、整形された本文を読みながら指摘したい場でも面の切り替えを強いられる。

起票時点で意図したのは次の2つ。

- markdown を1つのモジュールに閉じ、外から見える口を絞る
- 注釈を別のモジュールとして分け、markdown の描き方を知らずに済むようにしたうえで、どの面でも指摘を付けられるようにする

---

## 切り出した先（指摘事項の行き先）

この change の進行中に受けた指摘を、別の change へ切り出した。抜けの確認用に、指示された内容と行き先を残す。

### `adr0017-sub-create-module-annotation`

- 注釈部分は change を立てる
- **並列表示を落とす**（どの面でも注釈が付けられるなら、読む面と指摘する面を並べる理由が無い）

### `adr0017-sub-update-ui-approval-review`

**1. 差し戻しボタンの位置を、本家と同じくプレビュー等の面の切替ボタンと同じ並びにする。**

現状は面の切替が本文の上、差し戻しが右サイドバーの最下部にあり、離れている。

**2. 承認一覧の「レビューする」を押したら、その場で開く。**

別画面へ遷移しない。**3件のうち一番重い。**

**3. レビュー画面に「即時却下」を置き、押すとモーダルで理由を入力させる。**

3つの指示に見えるが1つの流れである。

- レビュー画面の中に却下ボタンが無い。現状この画面にあるのは差し戻しだけで、承認・却下は承認一覧のカードにしかない
- そのボタンの名前は「即時却下」。差し戻しがやり直しを求めて返すのに対し、こちらはその場で終わらせる
- 押すとモーダルが出て、理由を入力し、**却下する／やめる**のどちらかを押す

いまの却下（承認一覧のカード）は、押すとカードの下に理由の欄が開き、その下に「却下する」「やめる」が並ぶ。理由を入れて「却下する」を押すと**欄が閉じるだけに見え、送れたのか分からない**。実装上は送信が成功しており、成功したことを示していないのが原因である。

### `adr0017-sub-update-docs-structure`

**指示されたものではない。** 「markdown の今回実装に関する修正の change を作って」と言われた際に、私が資料の食い違いを勝手に入れて立てた。その直後に「俺が言うからいれろ」と指示があり、上記5件が口述されたが、私はそれを別の器（`adr0017-sub-update-ui-approval-review`）へ入れたため、この change には私の作文が残っている。

### change ではなく資料へ入れたもの

change の命名規約（先頭に動詞、create / add / update / fix / remove、判定の軸）は `docs/agents/issue-tracker.md` と `docs/adr/0014-change-name-starts-with-verb.md`、用語（product / module / 機能）は `CONTEXT.md` に置いた。

---

## 2026-08-30 時点の状況

tasks 43/74。**親自身に開いた作業は無い。** 残り31件はすべて分割した子が引き取っており、親は子が全部終わるのを待つ状態にある（ADR-0017「分割の内訳」）。

### 済んだこと（1〜5章）

- `modules/markdown/` を新設し、`@nuxtjs/mdc` の登録・parse 設定・フェンスの振り分け・コードブロック・図・本文の面・編集の面・CSS 353行を閉じた
- `nuxt.config.ts` から markdown 由来の記述が消え、`<MDC>` の直呼びが0件になった
- 描いた本文と生テキストの位置の対応を実装した（`runtime/position/` の preview / plain / fence / source-span）

### 分割した4本

| change | tasks | 状態 |
| --- | --- | --- |
| `adr0017-sub-create-position-port-preview` | 18/18 | archive 済み。整形された本文の面から位置の対応を公開した |
| `adr0017-sub-add-detection-assumptions` | 35/35 | archive 済み。崩れた前提7件を、踏んだら赤いテストで止まる状態にした |
| `adr0017-sub-create-reference-mdc` | 39/40 | archive 済み。`docs/specs/reference/mdc-observations.md` を新設し、テストの置き場を写し元へ揃えた |
| `adr0017-sub-fix-normalization-offset` | 43/44 | 実装は完了。座標の基準を「生ファイル」、正規化の場所を「面の内側」と決めた。残るは完了承認のみ |

### 委譲した5本

`adr0017-sub-create-module-annotation`（0/23）・`adr0017-sub-update-ui-approval-review`（0/26）・`adr0017-sub-update-docs-structure`（0/26）・`adr0017-sub-full-width-markdown-editor`（proposal のみ）・`adr0017-sub-separate-approval-decision-from-promotion`（未着手）。いずれも未着手。

### 親を archive できる条件

分割した4本が全部終わること。委譲した5本は別の関心事なので条件に含まれない。

