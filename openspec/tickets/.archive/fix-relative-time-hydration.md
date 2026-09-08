---
change: fix-relative-time-hydration
triage:
  - bug
tags:
  - proposal
  - specs
  - design
  - tasks
  - pre5/a61a047e-d93e-4e05-ae6d-23b8a4242ee9
status: Wait-for-archive
order: -5.0
---

# fix-relative-time-hydration

相対時刻の表示が SSR とクライアントで食い違い、Hydration mismatch を起こしている。dev のログが VNode のダンプで埋まる。

## 事実

実測（`yarn dev` のログ、2026-08-28）:

```
ログ全体        2,701,888 バイト（2.7MB） / 267 行
children キー   1,666 回
Hydration 警告  10 件
```

267行しかないのに 2.7MB ある。Vue は mismatch の報告に対象の VNode を添えるため、警告1件あたり数百 KB になる。中身はプロジェクト一覧のテーブル。

```
518  children":[{"__v_isVNod
 56  children":" アクティブの実体は生き…"
 49  children":"未接続"
 49  children":"—"
  7  children":"19時間前"
  7  children":"8月9日 14:40"
```

出ている警告:

```
WARN  [Vue warn]: Hydration style mismatch on {}
WARN  [Vue warn]: Hydration attribute mismatch on {}
WARN  [Vue warn]: Hydration text content mismatch on {}
ERROR Hydration completed but contains mismatches.
```

## 原因

`app/composables/useRelativeTime.ts`:

```
export function formatRelativeTime(iso: string, now = Date.now()): string {
```

基準時刻の既定が `Date.now()`。SSR で描いたときとブラウザで描き直したときで実行時刻が違うため、刻みの境界をまたぐと文言が変わる（「19時間前」↔「20時間前」、7日の境界では相対と絶対が入れ替わる）。

呼び出し側はいずれも基準時刻を渡していない。本番ルート5画面と、使い捨ての prototype 1画面（2026-09-07 再確認時点。行番号もこの時点のもの）。

```
app/pages/projects/index.vue:402
app/pages/index.vue:115
app/pages/projects/[projectId]/specs/index.vue:35
app/pages/projects/[projectId]/tasks/index.vue:24
app/pages/projects/[projectId]/steering/index.vue:40
app/pages/prototype/projects.vue:293   ← 使い捨て（archive 済み change show-pending-project-in-list の残骸。本 change の対象外）
```

## 再確認（2026-09-07）

現在のコード（`pre5` = `491e77e0`）で `yarn dev --port 3155` を起こし、headless Chromium で `/projects` と `/` を開いて console を採った。

- **相対時刻の text mismatch は再現した。** ブラウザの `Date.now()` を +5 日ずらすと `/projects` で `Hydration text content mismatch — rendered on server: 4日前 / expected on client: 9月2日 08:52`（7日の境界を跨いで相対→絶対に入れ替わる）
- **ダンプの出所も確認した。** この1件が dev ログに **349,030 バイトの1行**（`at <RouteProvider key="/projects" vnode= {...}` の VNode 直列化）を足した。「警告1件あたり数百 KB」は page 内の mismatch について正しい
- **時計をずらさないと再現しない。** 境界をまたぐのは SSR と描き直しの間（1秒未満）だけで、時計が揃った環境では稀。実測時（2026-08-28）に頻発したのは、`devServer.host: '0.0.0.0'` で**別マシンのブラウザ**から開いており、サーバーとブラウザの時計のずれが境界跨ぎを常態化させていたためと見る（`nuxt.config.ts` の注記「別マシンのブラウザから開くため」）
- **相対時刻とは別の要因が1つ混ざっている。** ticket 冒頭の `Hydration style mismatch` / `Hydration attribute mismatch` は相対時刻では起きない。出所は `app/layouts/portal.vue` の接続ドット——SSR は `upstreamConnected = false` で描くが、本家に繋がっていると WS のスナップショットが hydration より先に届き、client は `background: var(--status-success)` / `title="本家に接続済み"` を期待する。本家が繋がっている限り毎回出る（実測: `/`・`/projects` とも、本家接続中は 100% 再現）。**ダンプは伴わない**（ERROR 1行 + WARN 2行、数百バイト）が、`Hydration completed but contains mismatches.` の ERROR はこちらでも出る。相対時刻を直しても、この ERROR は本家接続中は残る
- 本家が繋がっていない時間帯は、時計を揃えたブラウザで警告 0 件だった

**撤回（2026-09-08）。** 下の「直した後」の実装（`useState` で基準時刻を配る方式）は規範 `docs/specs/architecture/data-fetching.md` の外にある方式で、規範を後から書き換える提案を添えて実装したのは違反（ユーザー指摘）。作業ツリーを着手前へ戻し、規範の 3 手段（`ClientOnly` / `onMounted` / `import.meta.client`）の内側で設計をやり直す。

**やり直し後（2026-09-08、tasks 4.4。規範の `onMounted` の後ろに置く形）。** 同じ手順（`yarn dev --port 3155`、headless Chromium、`Date.now()` を +5 日ずらして `/projects` と `/` を各2回）で、`Hydration text content mismatch` は 0 件、`children mismatch` も 0 件。最終更新の列は mount 後に入り、ずらしたブラウザでは「9月2日 08:52」（そのブラウザの時計を基準にした一度きりの描画）。dev ログは4回のロードで 8.7KB 増え、`<RouteProvider ... vnode=` のダンプ行は 0。残ったのは本家接続中の接続ドットの style/attribute mismatch（各ロード WARN 2行 + ERROR 1行）だけで、別 change の対象。

**直した後（2026-09-08、tasks 4.4。撤回済み）。** 同じ手順（`yarn dev --port 3155`、headless Chromium、`Date.now()` を +5 日ずらして `/projects` と `/` を各2回）で、`Hydration text content mismatch` は 0 件、最終更新の列は SSR の「5日前」のまま（直す前は絶対日時へ入れ替わった）。dev ログは4回のロードで 8.7KB 増え、`<RouteProvider ... vnode=` のダンプ行は 0。残ったのは本家接続中の接続ドットの style/attribute mismatch（各ロード WARN 2行 + ERROR 1行、数百バイト）だけで、これは別 change の対象。

## 害

- 調べたい `[stroke-board]` のログが VNode の海に埋もれる
- `Hydration completed but contains mismatches.` が ERROR で出るため、本物の異常と見分けがつかない
- 往復のたびにログが肥大する

## 経緯

`provide-operations-via-mcp` の検証中に見つけた。ストロークの往復とは無関係の既存の不具合。

change: `fix-relative-time-hydration`（proposal / specs 作成済み、実装は未着手）

2026-09-07 に現在のコードとの整合と主張の妥当性を再確認し、上の「再確認」を足した。接続ドットの mismatch は本 change に含めず別 change に切る（proposal「対象の線引き」。起票は未着手）。同日 design / tasks を作成。同日、規範の内側でやり直した実装を `1bb09ac0`（pre5）に commit。santa-method レビュー 2 本 PASS。残りは docs（`file-composables.md` の事実の修正）の承認と完了承認。
