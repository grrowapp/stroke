## Context

動機は `proposal.md` の Why。この change は仕様を持たない（`skip_specs: true`）ので、満たすべき振る舞いの参照先も無い。ここで決めるのは**資料の形と、テストの置き場**の2つだけである。

実装を制約する条件が5つある。

**1. `docs` は序列内の他層を参照できない。** `docs/agents/issue-tracker.md`「参照の方向」は `docs → 参照しない（例外: specs のみ）` と定める。新設する `mdc-observations.md` は `docs/` 配下なので、**ADR を参照できない**。手本にする `upstream-observations.md` は ADR-0006 / ADR-0008 を参照しているが、これは規定に反した既存の記述であり、倣う対象ではない。一方でツールの設定・スキーマ・コードは序列の外の実体なので、**テストのパスやパーサのバージョンを事実として指すのは自由である**。

**2. 事実の出どころは3箇所に散っている。** 親 `create-module-markdown` の tasks.md（6.1〜6.7・6.10・6.14 の見出しと本文）、コミット `82a96e0`（`test: 崩れた前提を、踏んだら止まる状態にする`）のメッセージ、そして既存テストの冒頭コメント（`markdown-fence-position.test.ts` の18行、`silent-failure.test.ts` / `edge-cases.test.ts` の前書き）である。**このうち tasks.md とコミットメッセージは archive と履歴の奥へ沈む。**

**3. 検知はまだ全部は揃っていない。** 現時点で在るのは `silent-failure.test.ts`（17本。`件1` / `件2` / `件3` の describe を持つ）、`edge-cases.test.ts`（20本）、`pre-mark.test.ts`（8本）、`fence.test.ts`（30本）、`preview.test.ts`（29本）、`plain.test.ts`（26本）、`markdown-view-position.test.ts`、`e2e/markdown-hydration.spec.ts` である。親 tasks の 6.1〜6.5・6.10・6.14 は未了で、`adr0017-sub-add-detection-assumptions` が引き取っている。**資料は「いま在るもの」を指し、無いところは無いと書く。**

**4. パーサは上げ先が無い。** `@nuxtjs/mdc@0.23.1` が最新である。したがって「パーサを上げたら落ちる」は検証できず、代わりに**パーサを直接変異させて**検知力を測っている（5件の変異で 14〜58本が落ち、3件は素通りした）。資料はこの測り方ごと残す必要がある。測り方が分からないと、次にパーサが上がったときに同じ判断ができない。

**5. `test/` の規範は既に在る。** `docs/specs/core/system-structure.md` §2 が「単体テストはソースと同居させない。`test/` にソースの構造をそのまま写した位置へ置く」と定める。**規範を変える必要は無い。** 変わったのは写し元の位置だけである（`app/components/workspace/` → `modules/markdown/`）。既存の `test/modules/markdown/runtime/position/` 6本は既にこの規範に従っており、残る3本だけが取り残されている。

## Goals / Non-Goals

**Goals:**

- change が archive されても、`@nuxtjs/mdc` の観測が日々読む場所に残る
- 事実の1件ごとに「踏んだら落ちる先」が示され、無いものは無いと分かる
- `test/` の markdown 系が例外なく写し元と同じ構造の位置に居る

**Non-Goals:**

- 検知を足すこと。`adr0017-sub-add-detection-assumptions` の範囲
- パーサの癖を直すこと・回避策を実装すること。資料は**現に起きることを書く**のであって、あるべき姿を書かない
- `upstream-observations.md` を直すこと（ADR 参照の件）。見つけた食い違いだが、あちらは本家の観測資料であり、この change の対象範囲の外にある
- テストの中身を良くすること。移設は**移動のみ**

## Decisions

### 決定1: 資料は `upstream-observations.md` の枠をそのまま踏襲し、ADR 参照だけ落とす

節の並びを揃える。

```
# @nuxtjs/mdc の観測記録
## この資料の扱い          ← 何を書き、何を書かないか
## 出典と時点              ← バージョン・調査日・測り方
## 崩れた前提 7 件          ← 件1〜件7。各件に「固定しているもの」を併記
## 検知力の実測             ← 変異させて何本落ちたか / 素通りした3件
## ハイドレーション検知が拾えない範囲
## 参照                    ← ファイルとシンボル
```

「この資料の扱い」には**決定は書かないこと**を明記する。そのうえで、`upstream-observations.md` が「食い違ったら ADR が勝つ」と書いている位置には、**代わりに「食い違ったら実物のコードとテストが勝つ」**と書く。観測資料が指せる上位が `docs` と `specs` しか無く、`@nuxtjs/mdc` の挙動を規定する `docs` も `specs` も存在しないためである（決定の根拠は Context 1）。

**代替1: ADR として起こす。** 却下。ADR は「後から変えにくい決定の記録」であり、ここに書くのは他人（`@nuxtjs/mdc`）の挙動の観測である。こちらが決めたことは1つも無い。加えて ADR は他の ADR を参照できないため、7件が相互に絡む記述と相性が悪い。

**代替2: `openspec/specs/markdown/module/spec.md` へ Requirement として足す。** 却下。specs は振る舞いの規定であって、依存ライブラリの癖の記録ではない。「パーサは offset 0 で position を落とす」は SHALL で書ける形をしていない。

**代替3: 既存の `docs/specs/reference/stroke-modules.md` に節を足す。** 却下。あちらは「使い方だけを書く」と自分で宣言しており（引数・返り値・依存・設置手順・呼び出し例に限る）、観測を混ぜると宣言が壊れる。参照で繋ぐ。

### 決定2: 7件の番号は親 tasks の 6.1〜6.7 に合わせ、件1〜件7 とする

既存の `silent-failure.test.ts` が黙って壊れる3件を `describe('件1: …')` / `件2` / `件3` と名乗っており、これは親 tasks の 6.1 / 6.2 / 6.3 に対応する。資料が別の番号を振ると、テストと資料の突き合わせが人手の作業になる。

| 件 | 内容 | 黙って壊れるか |
| --- | --- | --- |
| 件1 | 解析を自前で組み直すとハイドレーションが壊れ、markdown の外（アイコン）が消える | **黙る** |
| 件2 | offset 0 から始まるノードは `position` を落とす。フェンスに限らない | **黙る** |
| 件3 | `position` が記号を含むのはインラインコードだけ。他の記法は内側どうしで揃う | **黙る** |
| 件4 | `keepPosition` は `MDCParseOptions` であって `ModuleOptions` ではない | 型で落ちる |
| 件5 | `pre` の `position` も `code` も DOM に出ない | — |
| 件6 | フェンスの生テキストと表示文字列の差は5つ。行の並びは保たれる | — |
| 件7 | CRLF と front matter は実際に含まれうる。基準がずれると `null` に倒れず別の場所を返す | **黙る**（親 tasks 6.7 の実測） |

件3 について、**「記号を持つ記法は含むはず」という当たりの付け方が通らない**ことを資料に書く。強調・リンク・見出し・リスト・引用・表・打ち消しはすべて内側どうしで揃い、インラインコードだけが記号を含む。これは推論では出ない。

**代替: 資料の側で読みやすい順に並べ替える（黙る4件を先頭へ）。** 却下。並べ替えは番号の対応を壊す。読みやすさは表の「黙って壊れるか」の列で足りる。

### 決定3: 「どのテストが固定しているか」はファイル名 ＋ describe 名で書き、本数を添える

パスだけでは、どの記述が落ちるのか分からない。行番号は動くので書かない（`upstream-observations.md` が「行番号は当てにせずシンボルで探せ」と自分で注意しているのと同じ理由）。

書式は次で揃える。

```
固定しているもの — `test/modules/markdown/runtime/position/silent-failure.test.ts`
  の `件2: offset 0 と「位置が無い」を取り違えない`（N本）
```

**固定されていない件は、そう書く。** 例えば AST の構造（`li` の段落ほどき・改行だけの text ノードの除去・見出しの id）は、出力が実際に変わったのに 143本すべてが通過した。ここは「**現時点で固定するものが無い。`adr0017-sub-add-detection-assumptions` が入れる**」と書く。空欄にしない — 空欄は「調べていない」と区別が付かない。

**代替: テスト名を書かず「テストで固定済み」とだけ書く。** 却下。踏んだときに落ちる先を示すのが 6.8.2 の目的そのものであり、それが果たせない。

### 決定4: テスト3本の移設先は、そのテストが見ている**設定の在り処**で決める

3本とも `modules/markdown/` の実装を import していない。`markdown-sanitize` と `markdown-fence-position` は `@nuxtjs/mdc/runtime` の `parseMarkdown` を直に呼び、`markdown-roundtrip` は TipTap を呼ぶ。したがって「import しているファイルの写し」では置き場が決まらない。

代わりに、**そのテストが固定している設定・決めがどこに在るか**で決める。

| テスト | 固定している対象 | 対象の在り処 | 移設先 |
| --- | --- | --- | --- |
| `markdown-sanitize`（6本） | `rehype-raw` を切っていること。既定のサニタイズは属性しか落とさないこと | `modules/markdown/index.ts` の `installModule` | `test/modules/markdown/sanitize.test.ts` |
| `markdown-fence-position`（19本） | 同じ解析設定の下でのパーサの出力（生テキストと表示文字列の差） | 同上 | `test/modules/markdown/fence-source.test.ts` |
| `markdown-roundtrip`（2本） | 変換を挟まない編集を選んだ根拠（TipTap では表が潰れる） | `modules/markdown/runtime/edit/MarkdownEditor.vue` | `test/modules/markdown/runtime/edit/roundtrip.test.ts` |

**両テストとも冒頭に「`modules/markdown/index.ts` の `installModule` と同じ。片方だけ変えると意味を失う」と書いた `PARSE_OPTIONS` を持っている。** 写し元が `index.ts` であることは、テスト自身が既に宣言している。

接頭辞の `markdown-` は落とす。`test/modules/markdown/` の下に居る時点で冗長で、同居する既存6本（`fence` / `preview` / `plain` / `pre-mark` / `edge-cases` / `silent-failure`）も接頭辞を持たない。

**代替1: `markdown-fence-position` を `runtime/position/` へ入れる。** 却下。あそこは `position/*.ts` の写しで揃っている（`fence.test.ts` ↔ `fence.ts`）。`fence.ts` を import しないファイルを混ぜると、写し元の対応が1本だけ崩れる。ただし**このテストの読者は `fence.ts` を書く人**なので、資料と `fence.test.ts` の側から辿れるようにする（tasks で担保）。

**代替2: 3本まとめて `test/modules/markdown/` 直下へ置く（`roundtrip` も含む）。** 却下。`roundtrip` の写し元は `runtime/edit/MarkdownEditor.vue` で、解析設定とは無関係である。1箇所に集めると写し元の対応が読めなくなる。

**代替3: `test/app/components/workspace/` に置いたまま、資料で説明する。** 却下。`docs/specs/core/system-structure.md` §2 の規定に反した状態が残る。規定に例外を作るなら docs 側を直す話になり、それはこの change の範囲を超える。

### 決定5: 移設は `git mv` で行い、中身は1行も変えない

相対 import を1つも持たないことを先に確かめる（3本とも import は npm パッケージと `vitest` だけである）。持たないので、パスの書き換えは発生しない。

**移設の前後で `yarn test` の結果が同一であることを、本数とファイル数で確かめる。** 「同じ結果」の判定は、移設前の実行結果を控えておいて突き合わせる（tasks 3章）。テスト名も変えないので、突き合わせは機械的に済む。

**`test/app/components/` は空になるので削除する。** `test/app/composables/useRelativeTime.test.ts` は写し元（`app/composables/useRelativeTime.ts`）が動いていないため、そのまま残す。

### 決定6: 資料を書く順は「事実 → 検知の突き合わせ」で、突き合わせは最後に一度だけ行う

`adr0017-sub-add-detection-assumptions` が検知を足すため、テスト名は動く。**事実の記述はあちらの進捗に依存しないので先に全部書き、テスト名の欄だけを最後に埋める。**

あちらが未完了のまま この change を締める場合、テスト名の欄には**その時点で在るもの**を書き、無い件には「まだ固定するものが無い」と明記する。資料が無い期間を伸ばすより、欠けを明示して出すほうがよい（epic が定めた弱い依存の趣旨）。

**代替: あちらの完了を待ってから着手する。** 却下。epic は D（この change）を B と並走させる Wave 1 に置いており、直列にすると資料が出るのが最後になる。7件のうち事実そのものは既に確定していて、待つ理由が無い。

## Risks / Trade-offs

| # | リスク | 緩和 |
| --- | --- | --- |
| R1 | テスト名を資料に書き写すため、テストの改名で資料が古くなる。しかも**古くなっても何も落ちない** | describe 名まで書いて突き合わせを容易にする。加えて、資料が指すテストは全部 `test/modules/markdown/` 配下に集まるので、改名する側から資料の存在に気付きやすい。`stroke-modules.md` の「関連」からも辿れる。**この資料は検知を持たない**ことを、資料自身の「この資料の扱い」に明記する |
| R2 | `adr0017-sub-add-detection-assumptions` が未完了のまま締めると、資料に「まだ固定するものが無い」が残る | 残ってよい（決定6）。**空欄にせず明示する**ことで、あちらの完了時に埋める場所が分かる。あちらの tasks から この資料を更新する項目が生えるかは、あちらの担当が決める |
| R3 | 移設でテストが1本も走らなくなっても、緑のままなので気付かない（`yarn test` は「0本失敗」を成功と見なす） | 移設前の本数とファイル数を控え、移設後と突き合わせる（決定5）。判定を「緑であること」にせず「**同じ本数が同じ名前で通ること**」にする |
| R4 | 資料が長くなり、読まれなくなる | 7件それぞれを「何が起きるか」「なぜそう思わなかったか」「固定しているもの」の3点に切り詰める。実測の再現手順や測定ログは書かない（コミット `82a96e0` と各テストの冒頭コメントに在る） |
| R5 | 「口」の語を使わない書き換えで、既存資料と用語が食い違う | この change が書くものだけを対象にする。既存資料（`stroke-modules.md` 本文・コードコメント41箇所・spec の要件見出し2本）は別 change の範囲。**参照を1行足すだけの `stroke-modules.md` の既存本文には触れない** |
| R6 | `upstream-observations.md` が `docs → ADR` を参照している食い違いを見つけたが、直さない | 見つけた食い違いは記録に残す（この design）。あちらは本家の観測資料で、参照先の ADR-0006 / ADR-0008 は方針と基準バージョンの決めであり、落とすと拠り所が消える。**落とすか docs へ確定させるかはユーザーの判断が要る**ので、この change では触らない |

## Migration Plan

段階は無い。資料は新設で、既存の記述を書き換えない。テストは位置が変わるだけで、実行の対象集合（`vitest.config.ts` の `include: ['test/**/*.test.ts']`）は変わらない。

ロールバックは、資料3箇所（新規ファイル・`CLAUDE.md` の1行・`stroke-modules.md` の1行）を戻し、テスト3本を元のパスへ戻すだけである。コードも設定もデータも動かさない。

## Open Questions

- `upstream-observations.md` の ADR 参照（R6）をどうするか。この change の範囲外だが、**同じ枠で2本目を作る以上、2本の書き方が違う状態が残る**。ユーザーの判断を仰ぐ余地がある
