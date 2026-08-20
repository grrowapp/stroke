# separate-build-time-settings

## Why

`nuxt.config.ts` には性質の違う設定が混在していて、**読んでもどちらか分からない**。

実測（`nuxt build` の出力で確認）で3層あることが分かっている。

| 層 | 例 | 実行時に変えられるか |
|---|---|---|
| `runtimeConfig` に宣言済み | `claude.timeoutMs` / `claude.model` | **変えられる**。`.output` に対して `NUXT_CLAUDE_TIMEOUT_MS` を与えると届き、不正なら起動が拒否される |
| ただの `const` | `SESSIONS_ROOT` / `PROJECTS_ROOT` | 変えられない。ただし `runtimeConfig` へ移せば変えられるようになる |
| ビルドが消費する設定 | `nitro.experimental.websocket` / `devtools` / `ignore` | **変えられない。移すこともできない** |

3層目が問題である。同じ `nuxt.config.ts` の中に、実行時に差し替えられるもの（`runtimeConfig`）と、ビルド時に決まって二度と変えられないものが並んでいる。どちらなのかを示すものが無い。

このため次が起きる。

- 変えられない値を「設定値だから外に出せる」と判断して、無駄に検討する（この分類を決める過程で実際に起きた）
- 運用者が環境変数で変えようとしても何も起きず、なぜ効かないのか分からない
- `devtools` のように環境ごとに切り替えたい値がビルド時に固定されるため、切り替えるにはビルドを分ける必要がある。その前提が書かれていない

## What Changes

- **`nuxt.config.ts` の設定を、ビルド時に決まるものと実行時に差し替えられるものに区別して並べる。** どちらなのかがファイルを読んで分かる形にする
- **ビルド時に決まる設定は、なぜそれがビルド時なのかを添える。** `nitro.experimental.websocket` はビルドが消費するので `runtimeConfig` に置けない、といった理由を残す。後から「これも外に出せるのでは」と再検討させない
- **環境ごとに切り替えたい値がビルド時にあるなら、切り替えるにはビルドを分ける必要があることを明記する。** 今は `devtools` がこれに当たる
- 実行時に差し替えられる設定そのものの整備は `externalize-hardcoded-settings` が扱う。この change は境界を引くところまでとする

## Capabilities

### New Capabilities

- `configuration`: 設定がどこで決まり、いつ変えられるかを規定する。この change ではその半分——ビルド時に決まる設定は作り直すまで動作に現れないこと——を入れる。設定値が動作を決めている以上、いつ変わるかは観測できる振る舞いである（WS を無効にして作り直せば、問いと proposal は画面へ配信されなくなる）

もう半分の「実行時に差し替えられること」は `externalize-hardcoded-settings` が同じ capability へ加える。2つの capability に分けると、境界の両側が別々の場所に書かれて読めなくなる。

## Impact

- `nuxt.config.ts` — 設定の並びと、ビルド時である理由のコメント
- `README.md` — 環境ごとにビルドを分ける必要がある値の記載
- `docs/adr/` — ビルド時と実行時の境界をどこに引くかは、後から変えにくい判断にあたる。ADR に残すかを design で判断する

`externalize-hardcoded-settings` と同じファイル（`nuxt.config.ts`）に触れるため、並列に進めない。境界を先に引く方が、外出しの対象が確定していて手戻りが無い。
