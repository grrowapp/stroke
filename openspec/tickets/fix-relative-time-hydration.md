---
status: Planning
change: fix-relative-time-hydration
tags:
  - proposal
  - specs
triage:
  - bug
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

呼び出し側5画面はいずれも基準時刻を渡していない。

```
app/pages/projects/index.vue:190
app/pages/index.vue:115
app/pages/projects/[projectId]/specs/index.vue:35
app/pages/projects/[projectId]/tasks/index.vue:24
app/pages/projects/[projectId]/steering/index.vue:40
```

## 害

- 調べたい `[stroke-board]` のログが VNode の海に埋もれる
- `Hydration completed but contains mismatches.` が ERROR で出るため、本物の異常と見分けがつかない
- 往復のたびにログが肥大する

## 経緯

`provide-operations-via-mcp` の検証中に見つけた。ストロークの往復とは無関係の既存の不具合。

change: `fix-relative-time-hydration`（proposal / specs 作成済み、実装は未着手）
