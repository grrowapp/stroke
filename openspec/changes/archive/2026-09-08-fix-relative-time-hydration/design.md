> **差し戻しの記録（2026-09-08）。** 最初の design は「基準時刻を `useState` でペイロードに載せ、hydration 中だけそれで描く」方式だった。規範 `docs/specs/architecture/data-fetching.md`「規定」（時刻は SSR マークアップに直接入れず、`onMounted` / `import.meta.client` / `ClientOnly` の後ろに置く）の**外にある方式**であり、規範を後から書き換える提案を添えて実装まで進めたのは違反（ユーザー指摘）。実装は撤回し、作業ツリーを着手前へ戻した。規範への追記の提案も取り下げた。**spec delta は変えない**（ユーザー指示）。以下は規範の内側でやり直した design である。

## Context

動機は proposal.md「Why」、要件は `specs/portal/relative-time/spec.md`。ここでは実装の形だけを決める。

- `app/composables/useRelativeTime.ts` は純関数 `formatRelativeTime(iso, now = Date.now())` を1つ export する。刻み・文言・7日超の絶対日時への切り替えは `javascript-time-ago` の `STYLE` が持ち、単体テストが固定している。**この関数と設定は変えない**
- 呼び出しは本番ルート5画面。上層2画面（`pages/index.vue` / `pages/projects/index.vue`）はテンプレートの中で、下層3画面（`specs` / `tasks` / `steering` の `index.vue`）は `computed` の中で呼び、文字列を `RecordList` の `meta` に渡す
- **規範**: `docs/specs/architecture/data-fetching.md`「規定」—「最初のレンダリングを決定論的に保つ。ブラウザ専用の処理（ストレージ読み取り・**時刻**・乱数）は SSR マークアップに直接入れず、`onMounted` / `import.meta.client` / `ClientOnly` の後ろに置く」。相対時刻は「現在時刻」に依存する文言なので、**サーバーで描かない**のが規範の要求である
- **spec delta**: 「サーバーで描いた文言とブラウザで描き直した文言を一致させる」「基準になる現在時刻を両者で別々に決めない」「相対時刻を理由に描き直しの不一致を出さない」。サーバーが現在時刻に依存する文言を描かなければ、描き直し（hydration）はサーバーと同じ空の文言を描き、基準を別々に決めることも不一致も起きない。spec の3つの Scenario（境界跨ぎ・相対と絶対の切り替わり・時計のずれ）はいずれも「hydration で文言が入れ替わらない」ことを求めており、サーバーが描かなければ入れ替わる元が無い
- `RecordList` は `meta` が全件 `undefined` だと列ごと畳む（`uses('meta')`）。SSR とブラウザで `undefined` と文字列が入れ替わると、列の有無が変わって children mismatch になる
- Vue は text の不一致を本番でも DOM 側へ上書きする（`@vue/runtime-core` の `el.textContent = vnode.children`）。本番ビルドでも「サーバーが送った HTML」と「hydration 後の DOM」を比べれば、hydration で文言が変わったかどうかを見られる（`test/e2e/markdown-hydration.spec.ts` と同じ手）

## Goals / Non-Goals

**Goals:**

- サーバーが送る HTML に、現在時刻に依存する文言（相対時刻・7日超の絶対日時）を含めない。列そのものは最初からある
- hydration はサーバーと同じ空の文言を描き、mount の後に相対時刻を入れる。基準はそのブラウザの時計だけ
- `formatRelativeTime` の純関数と `javascript-time-ago` の設定、既存の単体テストは変えない
- 不一致を E2E で検知し、再発を止める

**Non-Goals:**

- 相対時刻を時間経過で刻む（ticking）。本家も刻んでいない
- `app/layouts/portal.vue` の接続ドットの mismatch（proposal「対象の線引き」。別 change）
- 使い捨ての `pages/prototype/projects.vue` の修正・削除
- docs の規範の変更。規範は動かさない

## Decisions

### D1. 相対時刻は mount の後にだけ描く（規範の `onMounted`）

`useRelativeTime.ts` に composable `useRelativeTime()` を足す。setup で呼び、`(iso: string) => string` を返す。

```ts
export function useRelativeTime(): (iso: string) => string {
  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  return (iso) => (mounted.value ? formatRelativeTime(iso) : '');
}
```

- サーバーでは `onMounted` が走らないので常に `''`。ブラウザの hydration でも `mounted` は `false` で `''`——サーバーと一致する。mount の後に `mounted` が `true` になり、返る関数を読んでいるテンプレート／`computed` が描き直して相対時刻が入る。基準は `formatRelativeTime` の既定の `Date.now()`、つまりそのブラウザの時計だけである
- **なぜ `<ClientOnly>` でなく `onMounted` のフラグか**: 下層3画面は文字列を `RecordList` の `meta` に渡しており、テンプレートで包める場所が無い。`<ClientOnly>` の中身も mounted フラグなので、同じ機構を関数で持つ。上層2画面も同じ関数で揃える（画面ごとに手段を変えない）
- 呼び出し側5画面は setup で `const relativeTime = useRelativeTime();` を取り、`formatRelativeTime(x)` を `relativeTime(x)` に置き換える。ほかは触らない
- `formatRelativeTime(iso, now)` はそのまま残す（テストと prototype が使う）

**Alternatives considered**

- 基準時刻を `useState` でペイロードに載せ、hydration 中だけそれで描く — 規範の外。撤回（冒頭）
- SSR は絶対日時を描き、mount の後に相対時刻へ切り替える — 規範の内側だが、SSR が「8月30日 16:26」を描き、mount で「5日前」へ変わる。spec の Scenario「同じ形式（どちらも相対、またはどちらも絶対）になる」を、mount 後の描き直しまで含めて読むと破る。文言が一度動くのも D1 より目立つ。不採用
- `<NuxtTime relative>` — 刻みが本家の規定と合わない。不採用（proposal の表）
- `data-allow-mismatch="text"` — 警告は消えるが規範（時刻を SSR マークアップに入れない）の外。不採用

### D2. mount 前の文言は空文字。`undefined` と「—」は使わない

- `undefined` にすると `RecordList` が列ごと畳み、mount 後に列が生える。SSR と hydration の間で列の有無が変わらないよう、値は常に文字列にする
- 「—」は specs `project/directory` で「取れないことが分かる表示」に割り当てられている（生成中・`lastModified` が `null`）。取れていない訳ではないので使わない
- 空文字なら列の幅（`w-28` / `RecordList` の列定義）は最初から確保され、mount で文言が入るだけになる

### D3. 検証は「サーバーの HTML に無く、mount 後の DOM にある」を見る

- **単体**（`test/app/composables/useRelativeTime.test.ts`、`@vitest-environment happy-dom`）: `defineComponent` で `useRelativeTime()` を呼ぶ小さな部品を作り、`vue/server-renderer` の `renderToString` で SSR の出力が空であること、`@vue/test-utils` の `mount` で mount 後に相対時刻になること、setup の時点（mount 前）では空であることを見る。`formatRelativeTime` の既存ケースは変えない
- **E2E**（`test/e2e/relative-time-hydration.spec.ts`）: ブラウザの `Date.now()` を +8 日ずらして `/projects` を開き、`page.route` で控えた SSR の HTML の `project-last-modified` 列が全件空で、hydration 後の DOM では `lastModified` を持つ行に文言が入っていることを見る。時計をずらすのは、サーバーの時計に依存した文言が SSR に混ざっていれば（7日超の絶対日時へ入れ替わって）DOM 側で必ず違いが出るようにするため。本番ビルドは不一致の警告を出さないので、警告の有無は dev で手で確かめる（tasks 4.4）
- 既存の `projects.spec.ts`「最終更新は未接続でも出る」（`not.toHaveText('—')`）は、mount 前の空文字でも否定が成り立って通る——つまり本 change で**走査した値が出ていることを証明しなくなる**（santa-method レビュー指摘）。空文字でないことの検査を同じテストに足し、mount 後の文言で通る形に締め直す

### D4. 上位資料への整合反映

- 規範 `data-fetching.md` は**変えない**。D1 は規範の `onMounted` の適用であり、追記は要らない
- `docs/specs/structure/file-composables.md` は「現状の実態」を記す文書で、事実と食い違う箇所が3つある（16行目「vueuse の `formatTimeAgo` の包み」は同文書 144 行目と矛盾し本 change 以前からの誤り、44 行目「`useXxx` を1つも export していない」は本 change で偽になる、120〜148 行目の署名と参照元）。issue-tracker「更新対応」により、差分を示して承認を得てから書く。**承認前に書き換えない**

## Risks / Trade-offs

- [hydration まで最終更新の列が空] → 本番では数十 ms。列の幅は最初から確保され、文言が入るだけ。JavaScript を切ったブラウザでは最終更新が見えないが、このポータルは WS を含め JavaScript 前提で動く
- [mount 後の描き直しで一覧全体が再描画される] → 変わるのは最終更新の text ノードだけで、行や列の構造は変わらない。`RecordList` は `meta` の文字列が変わるだけ
- [`useRelativeTime()` を setup の外で呼ぶと `onMounted` が効かず、常に空になる] → docblock で setup 限定を明記する。5画面はいずれも setup 直下で呼ぶ
- [prototype の `pages/prototype/projects.vue` に古い呼び方が残る] → 使い捨てで本番ルートではない。消すのは archive 済み change の後始末であり、ここでは触らない（proposal「Impact」）
- [`design-token.spec.ts` が最終更新の td の色を測る] → 色は td の class で決まり、文言の有無に依らない。mount 後に測るので変わらない

## Open Questions

なし。
