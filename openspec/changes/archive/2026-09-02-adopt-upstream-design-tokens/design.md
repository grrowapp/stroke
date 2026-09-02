## Context

動機は `proposal.md` の Why。ここでは approach を決めるのに要る現状だけを置く。

**token の定義は3層あり、統合で全部入っている**（`app/assets/css/main.css`）。

1. **値** — `:root` の CSS 変数 44個。本家 spec-workflow-mcp の CSS バンドル `.dark` からの写し
2. **尺** — `@theme` の型スケール（`--text-xs: 11px` 〜 `--text-xl: 18px`）・`--font-sans` / `--font-mono`・
   角丸 3段（`--radius-sm/md/lg` = 4/6/8px）
3. **橋** — `.dark` で `--ui-primary` / `--ui-bg` / `--ui-text` など `@nuxt/ui` の変数 13本へ流し込む

橋があるので `.vue` は `text-muted` / `border-default` と書くだけで token の値に載る。**ストローク側は
全部この書き方で、token を経由しない色を1つも持たない。**

**様式の定義は本家に対応がある領域にしか無い。** `@layer components` の約 600行がそれで、
上層（prototype `navigation.prototype.html` の写し）と下層（本家 v2.2.7 の写し）の2区画に仕切られている。
`.sb-bar` / `.sb-tab` / `.sb-table` / `.sb-page-title` / `.sb-row-*` / `.sb-badge` がここに住む。

**ストローク領域には定義が無い。** 本家に相当する画面が無く、写す元が無いためである。値は `.vue` の
`class` に直書きされ、同じ役目の指定が画面ごと・箇所ごとに食い違っている（proposal の表）。

## Goals / Non-Goals

**Goals:**

- ストローク領域に様式の定義を作り、置き場と名前を決める
- 定義があるのに使っていない箇所（状態のドット4個）を寄せる
- ハイライト5色がダーク背景で判別できることを実測で確かめる

**Non-Goals:**

- **ストローク側を本家の密度へ寄せること。** 写す元が無く、用途も違う（本家の画面は読む画面、
  ストロークは長文を読み書きする画面）
- **prototype を立てて見比べること。** 本家に対応があるものは写すだけで選択の余地が無く、対応が
  無いものは定義を作るだけである。見比べる選択肢が立たない
- **色の定義を増やすこと。** ストローク領域も色は既存の token で足りている
- **token の値を変えること。** 値は本家の写しであり、写す先を変えない
- **ライトテーマを作ること。** `main.css` は `.dark` の橋しか持たず、`colorMode` も `dark` 固定である

## Decisions

### D1. ストロークの定義は `main.css` の `@layer components` に、3つ目の区画として置く

component の `<style scoped>` にも `.vue` の `class` にも書き散らさない。

上層と下層が既にこの形で、理由もコード内に残っている——「画面ごとに書き散らすと本家とのずれが
方々に散るので、ここに集める」。区画はコメントで仕切る（735行目の「ここから下は『下層』の様式。
出どころが上と違う」に倣う）。**混ぜない理由は上層／下層と同じで、出どころが違うためである。**

- 上層 — prototype 準拠
- 下層 — 本家 v2.2.7 準拠
- **ストローク — 本家に対応が無い。出どころはこの change**

*代案*: component の `<style scoped>` に持つ。却下——7ファイルに散り、揃っているかがファイルを
横断しないと分からない。`.sb-row-off` で既に踏んだ失敗（1つの property に持ち主が2人居ると、
レイヤーの順で必ず片方が負ける）が、より広い面で再発する。

### D2. 名前は `.sb-stroke-*`

`sb-` は stroke-board 全体のプレフィックスで、上層・下層とも使っている。ストローク領域だけ別の
プレフィックスにすると、同じアプリのクラスであることが読めなくなる。区画の違いは `stroke` の
一語で示す。

### D3. 定義するのは「器」と「カードの面」だけ

**使い回しのあるものに限る。** `mb-6` / `mt-4` のような単発の余白は定義しない——使い回しの無い名前が
増え、`.vue` を読んでも何が起きるか分からなくなるだけである。

**器は2種類あるが、定義するのは1つだけである**（実装で確かめた。2026-09-02）。

| 名前 | 使う画面 | 中身 |
| --- | --- | --- |
| `.sb-stroke-page` | `strokes/index.vue`・`strokes/[sessionId]/index.vue` | 中央寄せ1カラム。`max-w-2xl` + 横 24px + 上 56px + 下 160px（現行 `mx-auto max-w-2xl px-6 py-14 pb-40` の写し） |

**全幅2カラム（`proposal.vue`）はクラスにしない。** 使うのが1箇所で、しかも `approved` で列数が
変わる（脇の指摘一覧が消える）。使い回しの立たない名前を作っても、`.vue` を読んで何が起きるかが
分かりにくくなるだけである。

**代わりにヘッダーの高さを変数にする。** `proposal.vue` は `57px` を3箇所に直書きしている
（`min-h-[calc(100vh-57px)]` / `lg:top-[57px]` / `lg:h-[calc(100vh-57px)]`）。値は sticky なヘッダー
（`px-6 py-3` + 下線 1px）の実測で、**3箇所が同時に動かないと表示が壊れる**——これが使い回しの
実体である。`--sb-stroke-bar-h` として1箇所に置く。

**カードの面**は `.sb-stroke-card`。**角丸・枠・地だけを持ち、内側の余白は含めない。**
現行の2つは面が同じで余白だけ違う（`AgentQuestion` の詳細説明パネルが `p-3`、`StrokeBreadcrumb` の
往復全文パネルが `p-4`）。用途の違う余白まで1つに畳むと、どちらかの見え方が変わる。**この change は
見た目を変える作業ではない。**

`AgentQuestion:143` の選択肢のボタン（`w-full rounded-lg border p-3 text-left transition`）は
枠の色が状態で変わるので、面のクラスに含めない。

**型は定義しない。** `text-sm` / `text-xs` / `text-lg` は `@theme` が既に本家の値へ上書きしている
（12px / 11px / 16px）ので、Tailwind のクラスをそのまま書けば定義済みの値に載る。ここに別名を
被せると持ち主が2人になる。

### D4. `proposal.vue` の横余白は段数を決めて畳む

1つの画面の中に `px-4` / `px-5` / `px-6` / `px-8` の4種類がある。**器の値ではなく、器の中の
ばらつきである。**

役目で3段に畳む。**クラスは作らない**——padding だけのクラスは Tailwind の `px-6` を別名にする
だけで、読み手が得るものが無い。段が3つに整理されていること自体が成果である。

| 段 | 使う場所 | 値 |
| --- | --- | --- |
| 縁 | sticky ヘッダー、承認待ち・差し戻しのバー | `px-6` |
| 本文 | proposal のプレビュー、生テキスト | `px-8` |
| 脇 | 指摘の一覧 | `px-5` |

`px-4` の1箇所は**生テキストの器**（`MarkdownSource` を包む `ReviewAnnotateSource`）だった。
プレビュー（`px-8 py-8`）と `shownMode` の切り替えで**同じ場所に出る**ので、余白が違うと切り替えた
瞬間に本文の左端が飛ぶ。`px-8 py-8` に揃える。

### D5. 本家の写しは写しのまま残す

次の5箇所を token へ寄せない。

| 箇所 | 値 | 写しの元（コード内コメントが名指ししている） |
| --- | --- | --- |
| `workspace/RecordList.vue:217` | `text-gray-400` | 本家の直書き（実測 `oklch(0.707 0.022 261.325)`） |
| `workspace/ApprovalCard.vue:96` | `0 1px 3px 0 rgb(0 0 0/.1), 0 1px 2px -1px rgb(0 0 0/.1)` | 稼働中の本家で実測した影 |
| `review/ApprovalAnnotator.vue` | `text-white` | 本家の `bg-[var(--accent-primary)] text-white` |
| `markdown/render/MarkdownView.vue:154` | prose クラス列 | `MDXEditorWrapper.tsx` の `contentEditableClassName`（並びも同じ） |
| `markdown/render/MarkdownDiagram.vue:63-76` | mermaid テーマ変数 13個 | `hooks/useMDXEditorTheme.ts` の `mermaidThemeVariables` |

寄せると本家のどの実装を写したのかが読めなくなり、本家が変わったときに追随できなくなる。
`ApprovalCard` の影には「`--shadow-sm` は本家の design token 側（`0 1px 2px rgba(0,0,0,.2)`）を指すので
使わない」と、寄せてはいけない理由まで書いてある。

**判定の基準は「写しであることがコード内のコメントで名指しされているか」。** 名指しの無いものは
写しとみなさず、直し漏れとして扱う（D6）。

### D6. 直し漏れは「定義があるのに使っていない箇所」だけを指す。**該当は無い**

当初 `app/pages/projects/[projectId]/tasks/[specName].vue:29-32` の状態のドット4個を該当と見たが、
**実装で本家の写しであることを確かめたので寄せない**（2026-09-02）。

その `.vue` のコメントが「点の色は本家の `statusConfig` の `dotColor` をそのまま使う」と名指ししており、
本家のビルド成果物（`@pimzino/spec-workflow-mcp/dist/dashboard`）を grep して裏を取った。

```
dotColor:"bg-gray-400"      ← pending
dotColor:"bg-orange-500"    ← in-progress
dotColor:"bg-green-500"     ← completed
```

3つとも一致する。`bg-red-500`（blocked）だけは本家に `dotColor` が無く、ADR-0008 の言う
「2.2.5 は blocked を持たない」と整合する。**D5 が D6 に優先する**——判定基準は「写しであることが
コード内のコメントで名指しされているか」で、名指しされていた。

blocked の1色だけを `--status-error` へ寄せる案もあるが、採らない。4つが同じ `statusConfig` の
写しとして並んでいる中で1つだけ出どころが変わると、次に読む者がどれを本家に合わせるべきか判断
できなくなる。

**この change に直し漏れは1件も残っていない。**

`MarkdownDiagram.vue` のエラー・ローディング表示（`border-red-800` / `bg-gray-800` / `text-gray-400` 等）は
判定を保留する。器の作りは「本家と同じく文言と元ソースを畳んで出す」と名指しがあるが、**色そのものの
出どころは名指しが無い**。本家の実装を確認して、写しなら D5、そうでなければ直し漏れとして扱う。

### D7. 色の定義は増やさない

増やすのは、本家に無い機能・状態を既存の token とその合成で表せないときだけ。**この change の調査で
足す必要が生じた箇所は1件も無い。**

現に本家の外に在る2件は、どちらもこの基準を満たしている。

- **ハイライト5色** — 本家 approvals に「指摘を色で区別する」機能が無い。装飾ではなく、どの指摘が
  どこに付いているかを見分ける手段である
- **生成中の行の地 `#161f32`** — 本家に「生成中」という状態が無い。値は `--surface-panel` を
  `--surface-base` に 0.45 で敷いた合成の実測値なので、**token ではない**。合成の式として持つのが
  正しく、`show-pending-project-in-list` が決めた形をこの change では変えない

### D8. `@tailwindcss/typography` は残す

統合後の `main.css` が `@plugin "@tailwindcss/typography"` を取り込み済みで、`MarkdownView` の本文の型は
これが持つ（「**本文の型は Tailwind Typography（`prose`）が持つ**」）。落とすと proposal の本文——
見出し・箇条書き・コードを含む長文——が素の Markdown 出力になり読めない。

### D9. ハイライト5色の確認は実測で行う

`--surface-base`（#0f172a）と `--surface-panel`（#1e293b）の上に5色の `bg` を重ね、隣り合う色どうしを
見分けられるかを実物で確かめる。

判別できなかったときに変えるのは **`bg` の alpha だけ**。色相（`name` と `border` の値）は変えない——
`border` は本家 approvals へ渡る保存形に載る値である。変えるときは `app/composables/useAnnotations.ts`
（保存形）と `app/assets/css/main.css` の `::highlight()`（塗り）の**両方**。片方だけ変えない。

## Risks / Trade-offs

**[定義を作っても `.vue` 側に直書きが残る]** → 1つの property の持ち主を CSS と class の2箇所に置くと、
`@layer components` はユーティリティより前のレイヤーなので class が必ず勝つ。`.sb-row-off` で既に
踏んでいる。**区画へ移した property は `.vue` から必ず外す。**

**[`@layer components` が更に膨らむ]** → 既に約 600行ある。ストローク区画は器2つとカード1つの
3クラスに絞る（D3）。増やしたくなったら、それが本当に使い回されているかを先に数える。

**[`proposal.vue` の余白の段数が実物と合わない]** → `px-4` の1箇所は何を出しているかを見てから
決める（D4）。見ずに畳むと、意図のあった違いを潰す。

**[E2E が余白に依存している]** → `data-testid` で取っているので class の変更では壊れないが、
折り返しやスクロール量が変わると可視性・クリック位置の判定に影響しうる。`yarn test:e2e` を通す。

**[change 名と実体がずれる]** → 名前は「本家の token を採用する」だが、実体は「ストロークの様式の
定義を作る」に移っている。名前を変えると ticket・ディレクトリ・`docs/specs/plan/mainline-merge.md` の
参照が動くので、この change では変えない（proposal の末尾に指摘を残す）。

## Migration Plan

段階は3つ。**互いに独立していて、個別に revert できる。**

1. **直し漏れの是正**（D6）— 状態のドット4個。`MarkdownDiagram` のエラー表示は本家を確認して振り分ける
2. **ハイライト5色の確認**（D9）
3. **ストローク区画を作って寄せる**（D1〜D4）— 区画を作り、`.vue` の直書きを外す

**戻し方**: 3 は `@layer components` の1区画に集まるので、区画ごと外して `.vue` の class を戻せば
元に戻る。1・2 はそれぞれ小さな差分である。
