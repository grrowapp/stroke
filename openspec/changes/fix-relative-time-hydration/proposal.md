# fix-relative-time-hydration

## Why

相対時刻の表示が SSR とクライアントで食い違い、Hydration mismatch を起こしている。

`formatRelativeTime`（`app/composables/useRelativeTime.ts`）は基準時刻の既定を `Date.now()` にしている。SSR で描いたときとブラウザで描き直したときでは実行時刻が違うため、刻みの境界をまたぐと文言が変わる（「19時間前」↔「20時間前」、7日の境界では相対表示と絶対日時が入れ替わる）。呼び出し側はいずれも基準時刻を渡していない（本番ルート5画面。ほかに使い捨ての `pages/prototype/projects.vue` が1つ同じ呼び方をしているが、archive 済み change の残骸で本 change の対象外）。

境界をまたぐのは SSR と描き直しの間の1秒未満なので、時計が揃った環境では稀にしか起きない。実測時に頻発したのは、`devServer.host: '0.0.0.0'` で**別マシンのブラウザ**から開いており、サーバーとブラウザの時計のずれが境界跨ぎを常態化させていたためと見る。ブラウザを別マシンで開くのは利用の前提なので、「稀だから放置」にはならない。

害は表示のちらつきに留まらない。

- **dev のログが VNode のダンプで埋まる。** Vue は mismatch の報告に対象の VNode を添える。それが JSON 化されてログへ出るため、警告1件あたり数百 KB になる。実測 2026-08-28: `yarn dev` のログが 267 行で **2.7MB**、`children` キーが 1,666 回。プロジェクト一覧のテーブル（プロジェクト名・状態・最終更新）がそのまま何度も吐き出されていた
- そのせいで、調べたい `[stroke-board]` のログが埋もれて探せない
- `Hydration completed but contains mismatches.` が ERROR として出るため、本物の異常と見分けがつかない

実測は `provide-operations-via-mcp` の検証中に見つけた（ストロークの往復とは無関係の既存の不具合）。

**再確認（2026-09-07、`491e77e0`）。** ブラウザの `Date.now()` を +5 日ずらして `/projects` を開くと `rendered on server: 4日前 / expected on client: 9月2日 08:52` の text mismatch が再現し、その1件で dev ログに 349,030 バイトの1行（`<RouteProvider>` の `vnode` の直列化）が足された。ダンプの出所が相対時刻の mismatch であることは確かめられた。詳細は ticket「再確認」。

## What Changes

- **変更**: 相対時刻の基準時刻を、SSR とクライアントで同じ値にする。`formatRelativeTime` の既定を `Date.now()` にしたままにせず、描画の基準として1つ決めた値を使う
- **変更**: 呼び出し側5画面（`pages/projects/index.vue` / `pages/index.vue` / `pages/projects/[projectId]/specs/index.vue` / 同 `tasks/index.vue` / 同 `steering/index.vue`）を、その形に合わせる

方式は design で決める。2026-09-07 の再確認で候補を洗った結果は次のとおり（design はここから選ぶか、覆すなら理由を書く）。

| 候補 | 判定 | 理由 |
| --- | --- | --- |
| **描画の基準時刻を1つ決めて配る** — サーバーが描いた時点の `now` を Nuxt の payload に載せ（`useState`）、hydration はその値で描く。描き終えたら client の時刻に更新してよい（描き直し後の更新は mismatch にならない） | **推奨** | `formatRelativeTime(iso, now)` の第2引数がそのまま受け口になる。時計のずれにも効く（基準がサーバー1つになる）。specs の2要件を両方満たす |
| Nuxt 組み込みの `<NuxtTime relative>` | 採らない | 刻みが 60秒/60分/24時間/**30日**/12か月で、7日で絶対日時へ切り替える本家の規定（`useRelativeTime.ts` の `STYLE`、単体テストで固定）と合わない。丸めも `round` で本家の `floor` と違う |
| 一定の粒度に丸める | 採らない | 丸めても境界は残る。時計のずれがあれば同じ確率で跨ぐ |
| 相対時刻の要素に `data-allow-mismatch="text"` を付ける | 採らない | 警告は消えるが表示は一致しない（Requirement「サーバーで描いた結果とブラウザで描き直した結果が一致する」を満たさない）。逃げ道であって解決ではない |
| `<ClientOnly>` / `onMounted` 後に描く | 採らない | サーバーが描かない列ができ、初期表示が欠ける。「最終更新」は未接続プロジェクトの唯一の手がかり（specs `project/directory`）で、欠けてよい列ではない |

### 対象の線引き

再確認で、**相対時刻とは別の hydration mismatch が1つ**見つかった。`app/layouts/portal.vue` の接続ドットで、SSR は `upstreamConnected = false` で描くが、本家に繋がっていると WS のスナップショットが hydration より先に届き、client は `background: var(--status-success)` と `title="本家に接続済み"` を期待する（`Hydration style mismatch` / `Hydration attribute mismatch`。ticket 冒頭に記録された2種の警告がこれ）。本家接続中は毎回出る。ダンプは伴わないが、`Hydration completed but contains mismatches.` の ERROR はこちらでも出るため、**相対時刻だけ直しても本家接続中はその ERROR が残る。**

原因は「client 専用の状態（WS）を SSR の markup に載せている」ことで、相対時刻の「基準時刻が2つある」とは別の不具合である。**本 change には含めず、別 change（`fix-*`）に切る**（2026-09-07、design 着手時のエージェント判断。capability `portal/relative-time` の範囲外で、直す場所も `portal.vue` と分かれるため。ユーザーが含める判断をしたら proposal・specs・design を書き直す）。specs の「不一致の警告を出さない」は相対時刻を理由とするものに限る（delta はその形になっている）。

## Capabilities

### New Capabilities

- `portal/relative-time`: 一覧に出る相対時刻の表示規定。サーバーで描いた結果とブラウザで描き直した結果が一致すること、それを理由に描き直しの不一致を出さないこと。

## Impact

- **影響コード**: `app/composables/useRelativeTime.ts` と、`formatRelativeTime` を呼ぶ本番ルート5画面（使い捨ての `pages/prototype/projects.vue` は触らない。消すのは別の後始末）
- **影響しないもの**: ストロークの往復・MCP ツール・サーバー API。表示だけの問題である
- **副次的な効果**: dev のログから VNode のダンプが消え、実用的な大きさに戻る（2.7MB → 数十 KB 規模）。ただし「対象の線引き」の接続ドットの mismatch を本 change に含めない場合、本家接続中は `Hydration completed but contains mismatches.` の ERROR 1行と WARN 2行が残る
