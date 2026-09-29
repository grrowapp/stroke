## Why

`/` を開くと `/projects` へ自動で遷移する実装が、ユーザーの指示も承認も無いまま入っていた。`/` が何を出すかはこの product が何から始まるかの宣言であり、エージェントが自分の判断で決めてよい範囲に無い（[ADR 0025](../../../docs/adr/0025-no-unilateral-navigation-changes.md)）。

加えて、画面と URL の責務範囲を書いた資料がどこにも無い。`docs/specs/plan/portal-stroke-entrance.md` と `portal-stroke-exit.md` は入口と出口の接合を個別に扱うだけで、**どの URL が何を担うか**の全体像を持たない。正が無いため、遷移が1行足されても誰も食い違いに気づけない。

## What Changes

- **BREAKING** `/` の入場先を **stroke 初期画面**（ストロークの開始 = 概要入力）にする。自動遷移は持たない
- **BREAKING** 上層の通知画面を `/` から別の URL へ移す。`/` を stroke 初期画面が占めるため
- 作成ボタンの飛び先を、`/` とは**別の route のパス**として定義する。中身（画面の実体）は `/` と同一で、違うのは Nuxt の page routing 上のパスだけ
- `/projects` はプロジェクト画面として独立させる。`/` からの自動遷移・リダイレクトを持たせない
- 画面遷移の設計を `docs/specs/architecture/screen-flow.md` として書き出し、URL と画面と責務範囲の正をそこに置く
- `CLAUDE.md` の絶対禁止事項に「画面遷移・操作アクションの独断変更禁止」を追加し、[ADR 0025](../../../docs/adr/0025-no-unilateral-navigation-changes.md) を根拠として立てる（本 change に先立って実施済み）

### 変えないもの

- ストロークの中身と流れ（概要入力 → AI と往復 → proposal 確認 → 承認）
- 器の決定（全面モーダル・閉じる操作なし・リロードで途中の場面へ復帰）
- プロジェクト一覧の中身、作成ボタンが常に押せること（[ADR 0010](../../../docs/adr/0010-create-button-always-enabled.md)）

## Capabilities

### New Capabilities

- `screen-flow`: URL と画面の対応、各画面の責務範囲、画面と画面をつなぐ遷移の規定。どの URL を開いたとき何が出るか、どの操作でどこへ移るか、自動遷移を持ってよいのはどこかを定める

### Modified Capabilities

- `stroke/frontier`: ストロークの開始画面が **2つの route から入れる**ようになる。「作成の入口は常に押せ、ストロークをモーダルで開く」が、作成ボタン経由だけでなく `/` からの直接の入場も対象に含む
- `project/directory`: 「作成を押す」の飛び先が、`/` とは別の path として明示される

`architecture-docs` は対象外とする。あれが単一の場所に集めると定めているのは**構造**の資料（`docs/specs/structure/system-structure.md`）であり、画面遷移はそこが扱う層・配置・依存とは別の関心だからである。画面遷移の資料を持つ要件は `screen-flow` 自身が持つ。

## Impact

**画面 / route**

- `app/pages/index.vue` — 通知の実装が載っている。stroke 初期画面へ置き換える
- 通知画面の移設先 route を新設する
- 作成ボタンの飛び先の route（現 `app/pages/strokes/index.vue`）— `/` と実体を共有する形に変える
- `app/layouts/portal.vue` — タブの飛び先（通知タブが `/` を指している）
- `app/pages/projects/index.vue` — 作成ボタンの `navigateTo` 先

**資料**

- `docs/specs/architecture/screen-flow.md`（新規。画面遷移の正）
- `docs/specs/plan/portal-stroke-entrance.md` — 入口の記述が screen-flow と重なる。参照を張り直す
- `docs/adr/0009-create-enters-stroke-overview.md` — archive 済み。引き継ぎ先の節に本 change の結論が加わるか確認する

**テスト**

- `/` の入場先を確かめる E2E（自動遷移が起きないことを含む）
- 通知画面の URL に依存している E2E
- 作成ボタンの飛び先を確かめる E2E

**対象外**

- ストロークの中身・器の決定・プロジェクト一覧の中身
- 下層（`/projects/<id>/**`）の遷移
