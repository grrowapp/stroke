# align-coding-conventions

## Why

統合すると単一の Nuxt アプリになる。`nuxt.config.ts` も `package.json` も1つしか無い。そこに両者の作法と依存が同居することになるが、**選択の余地が無いもの**がいくつかある。片方だけ有効にする、両方入れる、といったことができない。

### auto-import

マージ先は auto-import を使わないと決めていて、`imports: { autoImport: false }` と `components: { dirs: [] }` を置き、composable も util も `#imports` から明示的に import している。こちらは逆で、全面的に auto-import に乗っている。`ref` / `computed` / `$fetch` / `navigateTo` / `useFetch` はどこにも import が無く、コンポーネントもディレクトリ名を前置した名前（`StrokeQuestionCard` / `ReviewAnnotateSource`）で自動登録されている。`#imports` からの import は**1箇所も無い**。

`autoImport` は**アプリ単位の設定**である。統合後の `nuxt.config.ts` は1つなので、片方だけ有効にすることはできない。どちらかに揃えるほかなく、揃える先は動かす量が少ない側——こちらの19ファイル——になる。

### 依存

1つの `package.json` に2つのバージョンは入らない。

| | マージ先 | ここ | 統合すると |
|---|---|---|---|
| `vue-router` | `^5.2.0` | `^4.5.0` | メジャーが違う。1つしか入らない |
| Markdown | `md4x` | `marked` + `isomorphic-dompurify` | レンダラを2つ抱える |
| `tailwindcss` | 明示依存 `^4.3.2` | 依存なし（`@nuxt/ui` 経由） | 解決が暗黙と明示で割れる |
| `@types/node` | `^22` | `^26.2.0` | 1つしか入らない |
| `engines` | 宣言あり | 宣言なし | 宣言が片側にしかない |
| dev のポート | 3100 | 3001 | 1プロセスなので1つ |

さらにこちらでは**ポート 3001 が2箇所に直書き**されている。`package.json` の `dev` スクリプトと `server/utils/stroke/api-base-url.ts` の `DEFAULT_API_BASE_URL` で、片方だけ変えるとエージェントだけが古い接続先を掴む。統合でポートが動くので、この二重管理を抱えたまま移せば必ず踏む。

### テスト

マージ先は `yarn typecheck` / `yarn test`（vitest）/ `yarn test:e2e`（Playwright）の3つを門番に置き、本家のスタブまで用意して E2E を回している。こちらは**テストが1本も無い**。

統合すると「テストのある半分」と「無い半分」が1つのリポジトリに同居する。それ以前に、上の書き換え——19ファイルの import 付け替えと `vue-router` のメジャー更新と Markdown 実装の差し替え——を検出手段なしで通すことになる。**型で守られない箇所が書き換えの対象に入っている。**

## What Changes

**テストを先に置く。** 以降の書き換えが壊したものを検出できるようにする。

- **vitest を入れ、`yarn test` を用意する。** 構成はマージ先に合わせる（`@nuxt/test-utils` の `defineVitestConfig`、対象は `{app,server,shared}/**/*.test.ts`、既定は Node 環境で DOM が要るものだけ切り替える）。同じ形にしておけば統合時に設定を1つに畳める
- **サーバー側の、外から見える判断を持つところにユニットテストを置く。** 問いの構造の検証、リクエストの検証、プロジェクト名の正規化と衝突回避、セッションの実体判定と一覧、AI の起動設定の検証、差し戻しの整形
- **子プロセス（`claude` / `openspec`）はテストで実物を叩かない。** 実測した入出力を返すスタブを置く
- **`yarn check` を `typecheck && spec` から広げ、テストを含める**
- **画面の E2E（Playwright）は含めない。** マージ先が既に持っているので、統合後に1式へ揃えるほうが二度手間にならない

**依存を1組にする。**

- `vue-router` をマージ先の系列へ上げ、破壊的変更の影響（ルート定義・`navigateTo`・`<NuxtLink>`・`useRoute`）を潰す
- Markdown のレンダリングをマージ先と同じ実装に寄せ、`marked` と `isomorphic-dompurify` を落とす。今は dompurify がサニタイズを担っているので、寄せた先でそれをどう担保するかは design で確定する
- `tailwindcss` を明示依存にする
- `@types/node` と `engines` を揃える
- dev のポートを1つにし、二重管理を解消する。出どころを1つにして `package.json` と `DEFAULT_API_BASE_URL` の両方がそこを読む
- **BREAKING**: dev サーバーのポートが変わる。エージェントは `STROKE_BASEURL` 経由なので追随するが、開発時に開いている URL は変わる

**auto-import をやめる。**

- `nuxt.config.ts` に `imports: { autoImport: false }` と `components: { dirs: [] }` を入れる
- app 配下（`.vue` 12本、composable 5本）の自動 import を `#imports` からの明示 import に書き換える
- 自動登録に頼っているコンポーネント参照を明示 import に書き換える。名前がディレクトリ構成から導かれなくなるので、前置を落とした素の名前に戻す（`StrokeQuestionCard` → `QuestionCard`）
- `@nuxt/ui` が登録するコンポーネント（`UButton` / `UAlert` / `UApp`）は止まらない。`components.dirs` を空にしてもモジュールの登録は止まらないのが Nuxt の仕様で、マージ先はこれを規約の例外として受け入れている。ここでも同じ扱いにする

## Capabilities

この change はテストの追加、依存の選択、import の書き方を変える。画面の振る舞いも endpoint も動かないので、spec の差分を持たない（`.openspec.yaml` に `skip_specs: true`）。

Markdown の描画結果は実装が変われば細部が変わりうるが、`proposal-review` が規定しているのは「Markdown としてレンダリングして示す」までである。

## Impact

- `package.json` / `yarn.lock` — vitest / `@nuxt/test-utils` / DOM 環境の追加、依存の入れ替え、スクリプト
- `vitest.config.ts` — 新規
- `server/utils/stroke/*.test.ts` — 新規。対象は `question.ts` / `request-schemas.ts` / `project.ts` / `session-core.ts` / `claude-config.ts` / `conflict.ts` / `session-store.ts`
- 子プロセスのスタブの置き場 — 新規
- `nuxt.config.ts` — `imports` / `components` / `devServer`
- `app/` 配下 19 ファイル全部
- `server/utils/stroke/api-base-url.ts` — `DEFAULT_API_BASE_URL`
- `README.md` / `docs/specs/architecture/session-workflow.md` — テストの節、ポートの記載

**tasks の順序**: テスト → 依存 → auto-import。テストが無い状態で他の2つを通すと、壊れても分からない。

**前提**: なし。ファイルの置き場は `docs/specs/core/structure.md` で確定し、実際の移動も済んでいる（`design-semantic-structure` は archive 済み）。import を書き換える先が動く心配は無い。

**吸収した change**: `add-test-harness`（テストの安全網）、`align-dependencies`（依存の突き合わせ）、`remove-auto-imports`（auto-import の廃止）の3本。いずれも「1つのアプリになるから揃うしかないもの」で、同じ `package.json` と `nuxt.config.ts` を触り、順番に実施するしかない。
