# adr0017-sub-create-reference-mdc

## Why

`@nuxtjs/mdc` について実測で分かった事実が、**親 change の tasks とコミットメッセージの中にしか無い。** 親 `create-module-markdown` が archive されれば、それらは `openspec/changes/archive/` へ移り、日々読む場所からは消える。

消えると困る理由は、事実の7件が**実装の途中で崩れた前提**だからである。読まなかった人は同じ穴に落ちる。しかも7件のうち3件は**黙って壊れる** — 症状が出ないまま誤った位置を返す、あるいは markdown 本文とは別の場所が壊れる。

- 解析を自前で組み直すと、クライアントの再解析で shiki の色が SSR とずれ、ハイドレーションが壊れて**アプリ全体のアイコンが消える**（markdown 本文には症状が出ない）
- offset 0 から始まるノードは `position` を丸ごと落とす。そこへ 0 を書くと文書の冒頭が `[0,0)` を指す
- 記法によって `position` が記号を含むかが違う。長さを按分すると1〜2文字ずれた位置を黙って返す

`docs/specs/reference/upstream-observations.md` は同じ問題に対する既存の答えである。本家 spec-workflow-mcp を読んで分かった事実を「調査を繰り返さないために残す」枠で置いている。`@nuxtjs/mdc` についても同じ枠が要る。**決定ではなく観測なので ADR にはしない。**

あわせて、`test/` の置き場が写し元とずれている。`docs/specs/core/system-structure.md` は「単体テストは `test/` にソースの構造をそのまま写した位置へ置く」と規定するが、markdown 系3本の写し元は `app/components/workspace/` から `modules/markdown/` へ移った。テストだけが元の場所に残っている（親 change の tasks 3.7 が未了）。

## What Changes

- **`docs/specs/reference/mdc-observations.md` を新設する。** `upstream-observations.md` と同じ枠（この資料の扱い / 出典と時点 / 観測した事実 / 参照）で、崩れた前提7件を事実として書く。加えて、検知力を実測した結果（パーサを変異させて何本落ちるか、素通りした変異3件）も観測として載せる
- **7件それぞれに、それを固定しているテストを併記する。** 踏んだときに落ちる先を示すためである。テストが無く型で落ちる件（`keepPosition` の置き場）は、型で落ちることをそう書く
- **`CLAUDE.md` の Docs 節の `docs/specs/reference/` に1行足す。** 目録から辿れるようにする
- **`docs/specs/reference/stroke-modules.md` の「関連」から参照させる。** モジュールの使い方を読んだ人が、モジュールが乗っているパーサの癖へ辿れるようにする
- **markdown 系の単体テスト3本を、写し元と同じ構造の位置へ移す。** `test/app/components/workspace/` → `test/modules/markdown/` 配下。**移動のみで、テストの中身と結果は変えない。** 親 change の tasks 3.7 を閉じる
  - `markdown-fence-position.test.ts` は 3.7 に項目が無いが、モジュールのコードを見ているのに `app/` の下に居るため同じ移設の対象とする

**`adr0017-sub-update-docs-structure` との重複は解消済みである。** あちらの「触るファイル」に `test/app/components/workspace/markdown-*.test.ts` が挙がっていたが、ADR-0017 の該当記述は既に落としてあり、`adr0017-sub-update-docs-structure` の節には「`test/` の置き場を実態に合わせる件は `adr0017-sub-create-reference-mdc` が引き取った」と明記されている（`docs/adr/0017-delegate-create-module-markdown.md`）。この change で ADR を書き換える必要は無い。

**対象外**

- **コードの変更。** モジュールの実装にも設定にも触れない。テストは位置を移すだけで、中身は1文字も変えない
- **新しい検知の追加。** 7件を「踏んだら止まる」状態にするのは `adr0017-sub-add-detection-assumptions`（親 tasks 6.1〜6.5・6.6.2・6.9・6.10・6.14）の範囲である。この change は**既に在る検知を資料の側から指し示すだけ**で、足りない検知を埋めない。足りないところは「まだ固定されていない」とそう書く
- **`docs/specs/core/system-structure.md` の構造図に `modules/` を足すこと。** 図は `modules/` を知らないままだが、それは `adr0017-sub-update-docs-structure` の範囲である。この change が拠り所にするのは同ファイル §2 の「ソースの構造をそのまま写す」という既存の規定であり、その規定自体は変わらない
- **正規化を誰が行うかの決め。** `adr0017-sub-fix-normalization-offset` が決める。この change はいまの穴を**事実として記録するだけ**で、塞がない
- **「口」という語の一括置換。** 既存資料とコードコメントに残るが、この change が新しく書くものには使わない

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

なし。

**`skip_specs: true` を `.openspec.yaml` に設定する。** 根拠は次の3つ。

1. **振る舞いが1つも変わらない。** 足すのは `docs/` の資料1本と目録の1行と参照の1行だけで、実行されるコードに届かない
2. **テストの移設は位置だけを変える。** `vitest.config.ts` の `include` は `test/**/*.test.ts` なので、移動しても同じ集合が同じ結果で走る。テストが固定している振る舞いは移設の前後で同一である
3. **既存の要件を弱めも強めもしない。** `openspec/specs/markdown/module` が定める要件（位置の対応を外から引ける形で公開する等）に対し、この change は資料からの参照を足すだけで、要件文には触れない

specs は振る舞いを記述するものであり、振る舞いが変わらないなら spec も変わらない。検証を通すために要件を捏造しない。

## Impact

**資料（新規）**

- `docs/specs/reference/mdc-observations.md` — 崩れた前提7件と、検知力の実測。`upstream-observations.md` と同じ枠

**資料（追記）**

- `CLAUDE.md` の Docs 節 `docs/specs/reference/` — 目録へ1行
- `docs/specs/reference/stroke-modules.md` の「関連」 — 参照を1行

**テスト（移設のみ）**

| 現在 | 移設先 | 何を見ているか |
| --- | --- | --- |
| `test/app/components/workspace/markdown-sanitize.test.ts`（6本） | `test/modules/markdown/sanitize.test.ts` | `modules/markdown/index.ts` の `installModule` が `rehype-raw` を切っていること。既定のサニタイズが属性しか落とさないこと |
| `test/app/components/workspace/markdown-fence-position.test.ts`（19本） | `test/modules/markdown/fence-source.test.ts` | 同じ解析設定の下で、フェンスの生テキストと表示文字列がどう食い違うか |
| `test/app/components/workspace/markdown-roundtrip.test.ts`（2本） | `test/modules/markdown/runtime/edit/roundtrip.test.ts` | TipTap の往復で表が潰れること（WYSIWYG を採らなかった根拠） |

移設後、`test/app/components/` は空になるので削除する。`test/app/composables/useRelativeTime.test.ts` は `app/composables/` に写し元が在るため動かさない。

**コード**

変更なし。

**依存**

追加なし。

**他の change との関係**

- 前提: `adr0017-sub-create-position-port-preview`（Wave 0。完了済み）
- **弱い依存**: `adr0017-sub-add-detection-assumptions` が7件の検知を足す。「どのテストが固定しているか」の突き合わせは**あちらの完了後に一度だけ**行う。あちらが未了のうちは、その時点で在る検知だけを書き、足りないところを「まだ固定されていない」と書く
- 重複解消済み: `adr0017-sub-update-docs-structure`（上記）
- 親 `create-module-markdown` は残る。archive は分割した4件が全部終わってから（ADR-0017）

## 私が取った決め（未承認の仮定）

スキーマの instruction は `/AskUserQuestion` による grilling を求めるが、**このセッションではユーザーが grilling を2度見送っており、質問ができない。** そこで決めが要る箇所は下のとおり仮に置いた。**いずれも未承認である。** 承認が取れるまで、これらを確定として他の資料へ持ち出さない。

| 件 | 決め | 理由 |
| --- | --- | --- |
| specs の要否 | `skip_specs: true` | 振る舞いが変わらない。上の Capabilities に根拠3点 |
| `markdown-sanitize` の移設先 | `test/modules/markdown/sanitize.test.ts` | 見ているのは `modules/markdown/index.ts` の `installModule` に渡す解析設定であって、`runtime/` のどのファイルでもない。写し元が `index.ts` なので `test/modules/markdown/` 直下に置く |
| `markdown-fence-position` の移設先 | `test/modules/markdown/fence-source.test.ts` | 同上。`position/fence.ts` を import しておらず、固定しているのは同じ解析設定の下でのパーサの出力である。`runtime/position/` へ入れると既存の `fence.test.ts`（`fence.ts` の写し）と写し元が食い違う |
| `markdown-roundtrip` の移設先 | `test/modules/markdown/runtime/edit/roundtrip.test.ts` | TipTap を採らなかった根拠であり、その決めが形になっているのは `runtime/edit/MarkdownEditor.vue`（変換を挟まず markdown を直接編集する）。写し元はそこ |
| ファイル名から `markdown-` を落とすか | 落とす | `test/modules/markdown/` の下に居る時点で冗長。既存の同居ファイル（`fence.test.ts` / `preview.test.ts` / `pre-mark.test.ts`）も接頭辞を持たない |
| `mdc-observations.md` から ADR を参照するか | **しない** | `docs/agents/issue-tracker.md`「参照の方向」で `docs → ADR` は禁止（docs が参照してよいのは docs と specs のみ）。手本の `upstream-observations.md` は ADR-0006/0008 を参照しているが、これに倣わない。そもそも `@nuxtjs/mdc` の観測に対応する ADR は無い（ADR-0017 は change の分割の記録であって、パーサの事実ではない） |
| 7件の番号 | 親 tasks の 6.1〜6.7 の順で 件1〜件7 とする | 既存の `silent-failure.test.ts` が黙って壊れる3件を `件1` / `件2` / `件3` と名乗っており、その番号は 6.1 / 6.2 / 6.3 に対応する。資料側で別の番号を振ると突き合わせが崩れる |
| 7件のほかに何を載せるか | 検知力の実測（パーサ変異5件で 14〜58本が落ちる・素通りした変異3件）と、ハイドレーション検知が拾えない範囲を載せる | どちらも「調べて分かった事実」であり、7件と同じ理由で change の外に出しておく必要がある。**検知を足すのは向こうの change だが、測った結果は事実として残る** |
| 突き合わせの時期 | `adr0017-sub-add-detection-assumptions` の完了後に一度だけ行う。未了なら「まだ固定されていない」と書いて先へ進む | epic が定めた弱い依存のとおり。あちらの完了を待って着手を止めると、資料が無い期間が伸びる |
| 「口」の語 | 新しく書くものには使わない | ユーザーの指示。既存資料に残るものはこの change では触らない |
