# adopt-upstream-design-tokens

## Why

**この proposal は統合前に書いたものを、統合後の実物に合わせて書き直してある**（2026-09-02）。

統合（merge `9cef630`、2026-08-24）で design token の定義はアプリへ入った。
`app/assets/css/main.css` の `:root` に本家 spec-workflow-mcp の CSS 変数 44個
（`--surface-*` / `--text-*` / `--border-*` / `--interactive-*` / `--accent-*` / `--status-*`）が
あり、`.dark` の 13行が `@nuxt/ui` のセマンティック変数へ橋渡ししている。型スケールも `@theme` で
本家の値（`--text-sm: 12px` / `--text-base: 14px` …）に上書き済み。既定のダークテーマも
`nuxt.config.ts` の `colorMode` に入った。

**change 名が指す「本家の token を採用する」作業は、統合で実質済んでいる。** 残っているものは
2つあり、性質が違う。

### 1. 定義があるのに使っていない箇所（直し漏れ）

`app/pages/projects/[projectId]/tasks/[specName].vue:29-32` の状態のドット4個が
`bg-gray-400` / `bg-orange-500` / `bg-green-500` / `bg-red-500` のまま置かれている。
`--status-pending` / `--status-in-progress` / `--status-success` / `--status-error` に同じ意味の
定義があり、値もほぼ同じである。

### 2. そもそも定義が無い領域（ストローク）

本家 spec-workflow-mcp に、ストローク（AI と往復して概要を詰める）に相当する画面が無い。
**写す元が無いので、この領域には様式の定義が存在しない。** 結果、値が `.vue` に直書きで散らばる。

揃っていないのは本家との間ではなく、**ストロークの中**である。

器は2種類ある。**中央寄せ1カラム**（概要入力・問いの往復）と、**全幅2カラム**（proposal 確認。
本文と脇の指摘一覧を並べる）。器が2つあること自体は画面の役目の違いによる。

| 画面 | 器 | 指定 |
| --- | --- | --- |
| `app/pages/strokes/index.vue` | 中央寄せ1カラム | `max-w-2xl px-6 py-14 pb-40` |
| `app/pages/strokes/[sessionId]/index.vue` | 中央寄せ1カラム | `max-w-2xl px-6 py-14 pb-40`（同一） |
| `app/pages/strokes/[sessionId]/proposal.vue` | 全幅2カラム | 横余白が `px-4` / `px-5` / `px-6` / `px-8` の4種類 |

中央寄せの2画面は同じ値を持つが、定義が無いので**揃っているほうも偶然**である。全幅の1画面は、
1つの画面の中で横余白が4種類にばらけている——bar が `px-6`、本文が `px-8`、脇の一覧が `px-5`、
本文の中の1箇所だけ `px-4`。どれが意図でどれが偶然かが読めない。

カードの面も同様に `rounded-lg border border-default bg-elevated/50 p-3`（`AgentQuestion`）と
`rounded-lg p-4`（`StrokeBreadcrumb`）で食い違う。

### 制約の効く範囲

**「本家に無い色を足さない」は、本家に対応がある領域に効く制約である。** 本家に写す元が無い領域まで
本家の密度（bar `10px 14px` / 見出し 15px）へ寄せるのは本家準拠ではなく、こちらの解釈でしかない。
用途も違う——本家の画面は読む画面、概要入力とストロークは**長文を読み書きする画面**である。

ストローク領域は独自に定義を持つほかない。共有するのは色の token で、そこは既に共有できている
（ストローク側の `.vue` は `text-muted` / `border-default` / `bg-elevated` という `@nuxt/ui` の語彙で
書かれており、**token を経由しない色を1つも持たない**）。

## What Changes

- **ストロークの様式の定義を作る。** 対象は**使い回しのあるものだけ**——**器**（中央寄せ1カラムと
  全幅2カラムの2種類）と**カードの面**（角丸・枠・地・内側の余白）。`mb-6` のような単発の余白は
  定義しない。使い回しの無い名前が増えるだけである
- **`proposal.vue` の中の横余白 4種類を、意図のある段数へ畳む。** 器そのものは他の2画面と別で
  よい（役目が違う）。畳むのは1つの画面の中のばらつきである
- **色の定義は増やさない。** ストローク領域も色は既存の token で足りている。作るのは**寸法と面**の
  定義であって色ではない
- **状態のドット4個を `--status-*` へ寄せる**（上記1の直し漏れ）
- **本家の写しは写しのまま残す。** `RecordList` の `text-gray-400`、`ApprovalCard` の影、
  `ApprovalAnnotator` の `text-white`、`MarkdownView` の prose クラス列、`MarkdownDiagram` の
  mermaid テーマ変数。いずれも本家の実装からの写しで、出どころがコード内のコメントに名指しで
  書いてある。token へ寄せると本家との対応が読めなくなり、追随できなくなる
- **`@tailwindcss/typography` は残す。** 統合後の `main.css` が `@plugin` で取り込み済みで、
  「マージ先に typography が無い」という当初の前提は解消している。proposal の本文（見出し・
  箇条書き・コードを含む長文）を読める形で出す手段として、そのまま使う
- **指摘のハイライト5色（`HighlightColorName` の yellow / green / blue / pink / orange）は
  テーマとは別に扱う。** ダーク背景で5色が判別できることだけ確かめる。実値は
  `useAnnotations.ts`（保存形）と `main.css` の `::highlight()`（塗り）の2箇所にあり、
  **片方だけ変えない**

**やらないこと**: ストローク側を本家の密度へ寄せること（写す元が無く、用途も違う）。
prototype を立てて見比べること（本家に対応があるものは写すだけで選択の余地が無く、対応が無い
ものは定義を作るだけで、見比べる選択肢が立たない）。

## Capabilities

この change は spec の差分を持たない（`.openspec.yaml` に `skip_specs: true`）。

`proposal-review` は「Markdown としてレンダリングして示す」「整形されたプレビュー・素の本文・
並べた表示を用意する」「指摘は一意に定まる箇所へ紐づく」までを規定していて、色や面の見え方を
規定していない。`stroke-question-presentation` 系も出す順（話題タグ → 詳細説明 → 問い本文 →
選択肢）までである。ハイライトが5色であることは `shared/stroke.ts` の型が持つ実装上の取り決めで、
仕様には無い。

## Impact

- `app/assets/css/main.css` — ストロークの様式の定義（`@layer components` に区画を作る）
- `app/pages/strokes/index.vue` / `app/pages/strokes/[sessionId]/index.vue` — 中央寄せ1カラムの器
- `app/pages/strokes/[sessionId]/proposal.vue` — 全幅2カラムの器と、中の横余白のばらつき
- `app/components/AgentQuestion.vue` / `app/components/StrokeBreadcrumb.vue` — カードの面
- `app/pages/projects/[projectId]/tasks/[specName].vue` — 状態のドットを `--status-*` へ
- `app/composables/useAnnotations.ts` — ハイライト5色（判別できなかった場合のみ）

**前提**: `align-coding-conventions`。tailwind の依存の入り方と Markdown の実装が決まってからでないと、
何で描くかが定まらない。同じ `.vue` を触るので順に進める。

**実施の時期**: 統合は済んだ（merge `9cef630`）。当初「統合後に回す」とした理由——1つのアプリに
なった実物を見てやるほうが確実——は、いま満たされている。

**change 名について**: 実体は「本家の token を採用する」から「ストロークの様式の定義を作る」へ
移っている。名前を変えると ticket・ディレクトリ・`docs/specs/plan/mainline-merge.md` の参照が動くので、
ここでは指摘に留める。
