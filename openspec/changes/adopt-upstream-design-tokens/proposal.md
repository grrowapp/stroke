# adopt-upstream-design-tokens

## Why

マージ先の `stroke-board` は、本家 spec-workflow-mcp の design token を CSS 変数として再現している（`--surface-*` / `--text-*` / `--border-*` / `--interactive-*` / `--accent-*` / `--status-*`）。値は本家の CSS バンドルから取っていて、既定はダークテーマ、**そこに無い色を勝手に足さない**と決めている。本家と地続きに見えることを優先した判断である。

こちらは `@nuxt/ui` の既定のまま組んであり、`@tailwindcss/typography` を足している。テーマの指定も持たない。

統合すると1つのアプリになるので、プロジェクト一覧から概要入力へ移った瞬間に見た目が割れる。**同じ製品に見えない**という以上に、ユーザーは「どこか別のところへ飛ばされた」と受け取る。プロジェクトを起こす側と見張る側は連続した1本の流れ（概要 → proposal → 承認 → 生成 → 見張り）なので、その連続を見た目が断ち切る。

## What Changes

- **色・面・境界の指定をマージ先の design token に寄せる**
- **既定をダークテーマにする**（`colorMode`）
- **token に無い色を使っている箇所を洗い出し、token 側の語彙に置き換える。** 置き換えられないものは、なぜ要るのかを添えて残す。勝手に token を増やさない
- **`@tailwindcss/typography` に依存している proposal のプレビューを、token でどう出すか決める。** マージ先には typography プラグインが無い。proposal の本文は見出し・箇条書き・コードを含む長文なので、素の Markdown 出力をそのまま出すと読めない
- **指摘のハイライト5色（`HighlightColorName` の yellow / green / blue / pink / orange）はテーマとは別に扱う。** これは装飾ではなく「どの指摘がどこに付いているか」を区別する機能なので、token に無いことを理由に落とさない。ダーク背景で5色が判別できることだけ確かめる

見た目を決める change なので、schema の `ui` artifact（プロトタイプを実際に見て決めた結果の記録）を伴う。

## Capabilities

この change は spec の差分を持たない（`.openspec.yaml` に `skip_specs: true`）。

`proposal-review` は「Markdown としてレンダリングして示す」「整形されたプレビュー・素の本文・並べた表示を用意する」「指摘は一意に定まる箇所へ紐づく」までを規定していて、色や面の見え方を規定していない。`stroke-question-presentation` 系も出す順（話題タグ → 詳細説明 → 問い本文 → 選択肢）までである。ハイライトが5色であることは `shared/types.ts` の型が持つ実装上の取り決めで、仕様には無い。

## Impact

- `app/assets/css/main.css` — token の取り込み
- `app/` 配下の `.vue` 12本 — 色・面・境界の指定
- `nuxt.config.ts` — `colorMode`
- `package.json` — `@tailwindcss/typography` の去就
- `shared/types.ts` — `HighlightColor` の値（ダーク背景で判別できるか次第）

**前提**: `align-coding-conventions`。tailwind の依存の入り方と Markdown の実装が決まってからでないと、何で描くかが定まらない。同じ `.vue` を触るので順に進める。

**実施の時期**: **統合後に回す。** 見た目の統一は、1つのアプリになった実物を見てやるほうが確実で、統合前にやっても統合後に再調整になる。統合を妨げるものでもない（見た目が割れていてもマージは成立する）。詳細は `docs/specs/plan/mainline-merge.md` の「統合後に扱うもの」。
