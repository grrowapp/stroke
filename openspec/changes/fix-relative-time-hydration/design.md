## Context

動機は proposal.md「Why」、要件は `specs/portal/relative-time/spec.md`。ここでは実装の形だけを決める。

現状（`491e77e0`）:

- `app/composables/useRelativeTime.ts` は純関数 `formatRelativeTime(iso, now = Date.now())` を1つ export する。刻み・文言・7日超の絶対日時への切り替えは `javascript-time-ago` の `STYLE` が持ち、単体テスト `test/app/composables/useRelativeTime.test.ts` が固定している。**この関数と設定は変えない**
- 呼び出しは本番ルート5画面のテンプレートまたは `computed` の中で、第2引数を渡さずに呼んでいる。上層2画面（`pages/index.vue` / `pages/projects/index.vue`）は `useFetch` を直接、下層3画面は `useProjectApi` の `useSpecs` / `useProjectInfo`（中身は `useFetch`）を通す。いずれも SSR で描いた HTML をペイロードで引き継ぎ、ブラウザが同じデータで描き直す（`docs/specs/architecture/data-fetching.md`）
- Nuxt は `useState` の値を SSR のペイロードに載せ、hydration ではその値から復元する。`useNuxtApp().isHydrating` は初回の描き直しが終わる（suspense の解決）まで `true`
- Vue は text の不一致を dev でも本番でも DOM 側へ上書きする（`runtime-core.esm-bundler.js` の `el.textContent = vnode.children`。警告だけが dev 限定）。**本番ビルドでも SSR の HTML と hydration 後の DOM を比べれば不一致を検知できる**（`test/e2e/markdown-hydration.spec.ts` と同じ手）
- 規範 `docs/specs/architecture/data-fetching.md`「規定」は「最初のレンダリングを決定論的に保つ。ブラウザ専用の処理（ストレージ読み取り・**時刻**・乱数）は SSR マークアップに直接入れず、`onMounted` / `import.meta.client` / `ClientOnly` の後ろに置く」と定めている。相対時刻はこれに反している。ただし列は SSR で描かなければならない（proposal「方式の候補」の `<ClientOnly>` 不採用の理由）ので、規範の3手段では解けない——**「基準をサーバーで1つ決めてペイロードで配る」という4つ目の手段**を採る。規範への追記は下の「上位資料への整合反映」で提案する

## Goals / Non-Goals

**Goals:**

- hydration の描き直しで、相対時刻の文言が SSR と一致する。ブラウザの時計がサーバーとずれていても一致する
- hydration が終わった後の描き直し（データの取り直し・client 側の遷移）は**現状どおりブラウザの時刻を基準にする**。基準を固定し続けると、開いたまま30分経った一覧を取り直したとき「30分後」のような未来表記が出る
- `formatRelativeTime` の純関数と `javascript-time-ago` の設定・既存の単体テストは変えない
- 不一致を E2E で検知し、再発を止める

**Non-Goals:**

- 相対時刻を時間経過で刻む（ticking）。本家も刻んでいない
- `app/layouts/portal.vue` の接続ドットの mismatch（proposal「対象の線引き」。別 change）
- 使い捨ての `pages/prototype/projects.vue` の修正・削除
- API の応答にサーバー時刻を載せる契約変更（下の D2 で不採用）

## Decisions

### D1. 基準時刻は「サーバーが描いた時点」を1つ決め、`useState` でペイロードに載せる

`useRelativeTime.ts` に composable `useRelativeTime()` を足す。setup で呼び、`(iso: string) => string` を返す。

```ts
export function useRelativeTime(): (iso: string) => string {
  // SSR ではこの request の描画時刻。hydration ではペイロードから同じ値が復元される
  const basis = useState('relative-time-basis', () => Date.now());
  const nuxtApp = useNuxtApp();
  const now = (): number =>
    import.meta.server || nuxtApp.isHydrating ? basis.value : Date.now();
  return (iso) => formatRelativeTime(iso, now());
}
```

- **なぜ `useState`**: ペイロードに載る唯一の正規の器。`useFetch` のデータと同じ経路で SSR → ブラウザへ渡り、二度取りしない（`data-fetching.md` 規定1と同じ流儀）。key はアプリで1つ。同じ request 内の複数画面部品が同じ基準を見る
- **なぜ hydration 中だけ基準を使う**: hydration が終われば SSR との一致は問われない。以後は現状どおり `Date.now()` に戻すことで、取り直し・遷移の後に基準が古びて未来表記になる問題を作らない（Goals 2）。`isHydrating` は Nuxt が suspense の解決で `false` にする（`nuxt.js` の `app:suspense:resolve`）
- **`formatRelativeTime(iso, now)` は残す**: 純関数はそのまま。テストは第2引数で時刻を固定しており、影響しない。composable はその上に薄く載る
- 呼び出し側5画面は `const relativeTime = useRelativeTime();` を setup に足し、テンプレート／`computed` の `formatRelativeTime(x)` を `relativeTime(x)` に置き換える。ほかは触らない

**Alternatives considered**

- `<NuxtTime relative>`（Nuxt 組み込み）— 刻みが 60秒/60分/24時間/30日/12か月、丸めが `round` で、本家の規定（7日で絶対日時、`floor`）と合わない。不採用（proposal の表）
- `data-allow-mismatch="text"` — 警告は消えるが表示が一致しない。Requirement 1 を満たさない。不採用
- `onPrehydrate` で hydration 前に文言を書き換える（`<NuxtTime>` の内部手法）— 書き換え関数は直列化されて inline script になるため `javascript-time-ago` を持ち込めず、刻みの実装が2つになる。不採用
- 基準を `useState` に置くが hydration 後も固定し続ける — 取り直しで未来表記になる（Goals 2）。不採用
- `onMounted` で `basis.value = Date.now()` に更新して以後もそれを使う — 「hydration 中だけ基準」と結果は近いが、mounted の瞬間に一覧が一度描き直る。描き直しの分だけ無駄で、時計がずれた環境では mounted 直後に文言が跳ぶ。D1 の形は必要なときだけ `Date.now()` を読むので跳ばない。不採用

### D2. API の応答にサーバー時刻を載せない

`/api/projects`・`/api/projects/:id/specs`・`/info` の3応答に `generatedAt` を足せば基準はデータと一緒に運ばれるが、契約（`docs/specs/api/contract.md`）を3か所変え、消費側の型も動く。基準は「描いた時刻」であって「取った時刻」ではないので、データに載せる筋でもない。D1 で足りる。

### D3. server 判定は単体テストから差し替えられる形にする

`import.meta.server` は vitest では `undefined`（Vite の define が無い）。composable の単体テストは `#imports` を `vi.mock` して `useState` / `useNuxtApp` を差し替え、`isHydrating` の真偽で基準が切り替わることを見る。server 側の分岐は `import.meta.server` だけに頼らず、`useNuxtApp().ssrContext` の有無でも判定できるようにしてよい（実装時にどちらかへ寄せる。両方書かない）。

現行の `vitest.config.ts` は `#imports` を `vue` に alias しており（`useTemplateRef` だけのため）、`useState` / `useNuxtApp` は無い。テストファイル側の `vi.mock('#imports', ...)` で足す。alias を広げない。

### D4. E2E は「時計をずらしたブラウザ」で SSR と DOM を突き合わせる

`test/e2e/` に spec を1本足す。`context.addInitScript` でブラウザの `Date.now()` を +8 日ずらして `/projects` を開き、`page.route` で控えた SSR の HTML の `project-last-modified` 列と、hydration 後の DOM の同じ列を比べる（`markdown-hydration.spec.ts` の `shapeOfServerHtml` と同じ手）。

- **なぜ時計をずらす**: E2E の走査先 `.e2e-tmp/projects/*/.spec-workflow` は run のたびに作られ、最終更新は「今」〜「N分前」になる。ずらさないと境界を跨ぐ確率が低く、落ちるべきときに落ちない。+8 日ずらせば相対→絶対の切り替えを必ず跨ぐ
- **なぜ本番ビルドで見られるか**: Vue は本番でも text の不一致を DOM へ上書きする（Context）。直す前は DOM が絶対日時に変わって SSR と食い違い、直した後は一致する
- **警告そのものは E2E では見ない**: 本番ビルドは `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` が無く警告を出さない（`markdown-hydration.spec.ts` の注記）。警告が出ないことの確認は dev で手で行い（tasks の検証手順）、E2E は結果の一致で代替する

### D5. 上位資料への整合反映（承認を得てから書く）

`docs/agents/issue-tracker.md`「更新対応」により、delta の上位資料への反映は本 change の責務。**承認前に書き換えない。** 提案する差分は次の2つ。

| 資料 | 箇所 | 提案 |
| --- | --- | --- |
| `docs/specs/architecture/data-fetching.md` | 「規定」の「最初のレンダリングを決定論的に保つ」 | SSR で描かなければならない値（一覧の最終更新など）の基準は、サーバーで1つ決めて `useState` でペイロードに載せ、hydration はそれを使うことを4つ目の手段として足す。hydration が終わった後はブラウザの値に戻してよい旨も添える |
| `docs/specs/structure/file-composables.md` | 「時刻表示」の行（`vueuse の formatTimeAgo の包み`）、「`useXxx` を1つも export していない」の段、「useRelativeTime.ts」節の署名と参照元 | 実体（`javascript-time-ago`。`replace-handrolled-with-libraries` で置き換え済み）と、`useRelativeTime()` を export するようになったこと、参照元が本番5 + prototype 1 であることに合わせる。「純関数の置き場が無い」の指摘は `useXxx` が生えたことで一部解消するので、その旨を書く |

`file-composables.md` の1点目（vueuse の記述）は本 change 以前から古い。見つけた者が直す（同「更新対応」）。

## Risks / Trade-offs

- [hydration 中に `refreshNuxtData` が完了し、その描き直しが古い基準で走る] → 描き直しは hydration の後に起きる（非同期）。仮に hydration 中に走っても基準は同じ request の時刻で、1秒未満の差。無視できる
- [client 側の遷移（SSR 無し）ではブラウザの時計が基準になり、時計がずれた環境では初回ロードと文言が違う] → 不一致の警告にはならない（描き直しが無い）。ずれた時計の環境で相対時刻が狂うのは現状と同じで、この change の対象外。specs はサーバーが描いた場合の一致を求めており、満たす
- [`useState` の key がアプリ全体で1つなので、別 request の値が混ざる懸念] → `useState` は nuxtApp（request 単位）に閉じる。サーバーで request をまたいで共有されない
- [`isHydrating` の切り替わりより前に、hydration に含まれない描き直しが起きる] → `isHydrating` は suspense の解決で落ちる。それより前の描き直しは hydration の一部として SSR と比較されるので、基準を使うのが正しい
- [E2E の +8 日ずらしが `javascript-time-ago` 以外の時刻表示に副作用を及ぼす] → 対象は `/projects` の最終更新列だけを比べる。他の列は時刻を持たない
- [prototype の `pages/prototype/projects.vue` に古い呼び方が残る] → 使い捨てで本番ルートではない。dev で開けば mismatch は残るが、消すのは archive 済み change の後始末であり、ここでは触らない（proposal「Impact」）

## Open Questions

なし。接続ドットの扱いは proposal「対象の線引き」で**別 change**に決めた（本 change に含めない）。
