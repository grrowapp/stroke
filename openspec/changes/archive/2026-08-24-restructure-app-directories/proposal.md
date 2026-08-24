# Proposal — restructure-app-directories

## Why

画面は上層（プロジェクト横断ポータル）と下層（プロジェクト単位ワークスペース）の2階層に分かれており、`layouts/` と `pages/` はその区切りを持っている。上層は `layout: 'portal'` の2ページ、下層は `layout: 'workspace'` の10ページで、シェルの形（横タブ / 左サイドバー）まで変えて階層を見分けられるようにしてある。

ところが `components/` と `composables/` はその区切りを持っていなかった。下層専用の `useProjectApi` と全階層で使う `useBoardSocket` が `composables/` 直下に並び、どちらがどの階層のものかはファイルを開いて参照元を辿らないと分からない。`components/ui/` と `components/notification/` も、名前は役割を示すが階層は示さない。

結果として「このモジュールはどこから使われてよいのか」がディレクトリから読めず、新しい部品の置き場所を決めるたびに既存の参照関係を調べ直すことになる。

## What Changes

- **`components/` を階層で分ける** — `shared/`（階層をまたぐ）と `workspace/`（下層専用）の2つにする
  - `components/ui/` と `components/notification/` を廃止し、`components/shared/` に統合する
  - `components/workspace/` は変更しない
- **`composables/` を階層で分ける** — `shared/` と `workspace/` を新設し、4つの composable を実際の参照範囲に従って振り分ける
- **`components/portal/` は作らない** — 上層専用のコンポーネントが1つも実在しないため
- **モジュールの中身は変更しない** — 移動と import パスの書き換えのみ

**BREAKING** なし。外部に公開している URL・API・画面の振る舞いは一切変わらない。

### 振り分けの根拠（参照元の実測）

移動前に全モジュールの参照元を grep で洗い出した結果に従って振り分けた。推定は含まない。

| モジュール | 参照元 | 判定 |
| --- | --- | --- |
| `useProjectApi` | 下層9ページのみ | workspace |
| `useSteeringDocuments` | 下層 steering 2ページのみ | workspace |
| `useBoardSocket` | 上層2ページ + 両レイアウト + Toaster | shared |
| `useRelativeTime` | 上層2ページ + 下層3ページ | shared |
| `SbIcon` | 両レイアウト + 上層2ページ | shared |
| `UpstreamIcon` | 下層コンポーネント3 + Toaster + 下層1ページ | shared |
| `NotificationToaster` | `app.vue` | shared |
| `components/workspace/` の6つ | 下層ページと `layouts/workspace.vue` のみ | workspace（移動なし） |

`ui/` と `notification/` を分けたまま残さなかったのは、3つとも階層をまたいで使われており、両者を隔てる実態が無かったため。

## Capabilities

### New Capabilities

- `app-structure`: アプリ層のモジュールを画面の階層に対応させて配置し、どの階層から参照してよいモジュールなのかをディレクトリだけで判別できる状態を保つ

### Modified Capabilities

なし。画面の振る舞いは変わらないため、既存 capability の要件に変更はない。

## Impact

- **移動** 7ファイル（`components` 3 / `composables` 4）。うち6件は `git mv` でリネームとして追跡
- **import 書き換え** 19ファイル / 56行。書き換え後の参照先の件数内訳は移動前と完全一致
- **設定変更なし** — `nuxt.config.ts` は `imports.autoImport: false` / `components.dirs: []` で自動 import を無効にしており、全参照が明示 import。ディレクトリ移動が Nuxt の規約解決に影響しない
- **検証** — `yarn typecheck` exit 0、`yarn test` 106 passed、`yarn test:e2e` 129 passed。いずれも移動前のベースラインと同値

この change は実装後に起票した後付けである。実装はすでに作業ツリー上で完了している。
