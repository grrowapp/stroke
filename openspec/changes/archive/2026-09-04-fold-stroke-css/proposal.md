## Why

`app/assets/css/stroke.css` は「ストローク側の画面だけで使うスタイル」として分けられたが、
分けた理由（冒頭コメント）は **統合前の事情** である — 相手の `main.css` と足し算になるよう、
領域固有のものを別ファイルへ置く、という前提だった。統合は済み、`main.css` は既に
「上層（prototype）／下層（本家写し）／ストローク」の3区画を1本の中で区切って持っている
（change `adopt-upstream-design-tokens`）。分けておく理由が無くなった。

残しておく害もある。`stroke.css` が持つ `@keyframes blink` と `.blink` は、この repo で
**唯一 `sb-` の接頭辞を持たない名前**である。`main.css` には既に `@keyframes sb-loader-blink`
が在り、`@keyframes` の名前空間は文書全体で1つなので、素の `blink` は隣に並んだ瞬間に
どちらの持ち物か読めなくなる。ticket が言う「1つのアプリの中で見た目が割れない」は、
ファイルを1本にすることと、名前で持ち主が分かることの両方を指す。

## What Changes

- **削除** `app/assets/css/stroke.css`（全19行。実体は `blink` 1本）
- **更新** `app/assets/css/main.css` — ストロークの区画へ明滅を移す。名前を
  `@keyframes sb-stroke-blink` / `.sb-stroke-blink` へ改める。**値（`1.1s ease-in-out` /
  `50% opacity 0.35`）と `prefers-reduced-motion` の扱いは変えない**
- **更新** `nuxt.config.ts` — `css` 配列を `main.css` の1本にし、脇のコメントを実態へ合わせる
- **更新** `app/components/WaitingIndicator.vue`・`app/pages/strokes/[sessionId]/proposal.vue`
  — 当てているクラス名を改名に追従させる
- **更新** `docs/specs/core/file-components.md` — `WaitingIndicator` の説明にある `.blink`
- **更新** `docs/specs/plan/structure-migration.md` — 畳み終えた行を落とす

**見た目は変えない。** 明滅の速さも濃さも曲線も現状のままにする。`sb-loader-blink` は
`linear` で明暗を長く保つ（ui.md の確定値）が、こちらは `ease-in-out` で 0.35 まで沈む。
用途が違う（片方は生成中のローダー、こちらは待機と要注意の知らせ）ので**揃えない**。

## Capabilities

### New Capabilities

無し。

### Modified Capabilities

無し。振る舞いは変わらない。CSS の置き場とクラス名だけが動く純粋なリファクタなので、
`.openspec.yaml` に `skip_specs: true` を置く。

## Impact

| 対象 | 影響 |
| --- | --- |
| `app/assets/css/stroke.css` | 削除 |
| `app/assets/css/main.css` | ストロークの区画へ +36 行。うち 16 行は design 決定3 が求めるコメント（2つの明滅が別々に在る理由）。冒頭 3 行目のコメントから `stroke.css` の名を外す |
| `nuxt.config.ts` | `css` 配列が1要素になる |
| `app/components/WaitingIndicator.vue` | class 1箇所 |
| `app/pages/strokes/[sessionId]/proposal.vue` | class 1箇所（問い返しの帯） |
| `docs/specs/core/file-components.md` | 1行 |
| `docs/specs/plan/structure-migration.md` | 1行削除 |

依存関係の解消: 前提だった `adopt-upstream-design-tokens` は archive 済み
（`2026-09-02-adopt-upstream-design-tokens`）。ストロークの区画と `.sb-stroke-*` の
命名がそこで定まったので、畳む先が決まっている。

E2E・単体テストで `.blink` を名指ししている箇所は無い（`blink` の参照は上記2つの
コンポーネントのみ）。
