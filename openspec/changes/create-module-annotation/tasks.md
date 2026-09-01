この作業リストは、`proposal.md` / `design.md` / `specs/project/ui` / `specs/stroke/frontier` が揃った後に全面改訂した版である。**下流を読む前の版（11+12 の23件）は使わない** — 中核（`sourceShown` の配線）とストローク側の画面が落ちていた。

2026-09-01 に **`modules/annotation/` を作らない**と決まり（design 決定13）、1章（器を作って移す）を落とした。注釈の実体は `app/components/review/AnnotateSource.vue` と `app/composables/useAnnotations.ts` のまま。

**着手は `add-full-width-markdown-editor` の完了後。** あちらが同じ `ApprovalAnnotator.vue` / `approvals/[approvalId].vue` で prototype を撤去し配線する。完了していれば design 決定8（prototype に触らない）は対象が無くなっているので、着手時に `PROTOTYPE` の印が残っていないことを確かめてから進む。

行番号はすべて実測（2026-09-01）。着手時にずれていたら、実ファイルを正とする。

## 1. 下ごしらえ

- [ ] 1.1 置き場を変えないことを確かめる。`modules/annotation/` も `#annotation` も作らない（design 決定13）。`useAnnotations.ts` は動かさない
- [ ] 1.2 **`SourceRange` の妥当性を判定する述語を1つ置く**（`start < end` かつ両端が本文の長さの内側）。design 決定2 が「branded type にしない代わりに置く」と定めたもの。いまは `AnnotateSource.vue:45` の `clamp` と `:56` の `start < end` に散っており、同じ判定を2箇所へ増やさない
- [ ] 1.3 注釈の実体（`AnnotateSource.vue` / `useAnnotations.ts`）が markdown の解釈の仕組みを参照していないことを grep で確かめる。見る対象は design 決定6 が固定している（`parseMarkdown` / `MDC` / `mdc` / `remark` / `shiki` / `prose` / フェンスの部品、`#markdown/render/` と `#markdown/assets/`）。`#markdown` の位置の型への **type-only import は許す側**

## 2. 塗りを CSS Custom Highlight API に置き換える

- [ ] 2.1 `::highlight()` に効くプロパティを**実測する**（文字色・背景色・下線の類・文字の影は効き、枠・余白・`box-shadow` は効かない見込み）。結果を design 決定3 の制約と突き合わせ、食い違ったら記録する（R2）
- [ ] 2.2 色ごとに1つの `Highlight` を `CSS.highlights` に登録し、`::highlight(<名前>)` で見た目を当てる。5色の実値を CSS の規則として `app/assets/css/main.css` に持つ（`::highlight()` は inline style を受け取れない）。`useAnnotations` の `highlightColors` は動かさない（`CommentModal` の色見本と保存形が使う）
- [ ] 2.3 **重なりは `priority` では表さない。** 2件以上に覆われている範囲だけを集めた `Highlight` を**1本**持ち、下線で示す（design 決定3・R2・R3）。`priority` は同じ範囲を1つに畳むので、`annotation` spec:207-210「同一範囲に2件」を満たせない。**積まず、1本である**（いまの「下線積み」とは別物）
- [ ] 2.4 断片分割と重なりの下線積みを消す（`AnnotateSource.vue:58-93`。下線を 2px ずつ積むのは `:83-88`）
- [ ] 2.5 **`Highlight` を保持せず、作り直す。** 本文・注釈・DOM の変化を引き金に組み直す（R1。`MarkdownView.vue:120`「呼ばれるたびに作る。保持しない」に倣う）。`toDomRange` が `null` を返した範囲は塗らずに落とす
- [ ] 2.6 塗りが使えるかどうかの判定を `CSS.highlights` の有無で行う。ブラウザの版番号を直書きしない（design 決定11）
- [ ] 2.7 塗れない環境でも本文が読め、脇の一覧からコメントの編集と削除に入れ、選択して注釈を付けられることを確かめる。**代替の塗りは用意しない**（design 決定11）

## 3. 位置の口の上に2つの面を載せる

- [ ] 3.1 選択の検出を VueUse の `useTextSelection` に置き換える（`AnnotateSource.vue:106-117` の `mouseup` + `getSelection()` の自前実装をやめる。design 決定4）。空白だけの選択を捨てる判定（`:114`）は残し、振る舞いを変えない
- [ ] 3.2 生テキストの面を `modules/markdown/runtime/render/MarkdownSource.vue` へ寄せる。`AnnotateSource` は生テキストを自分で並べる役目を失い、`PositionPort` を受け取って塗るだけになる。**これで `MarkdownSource` の最初の使い手が生まれる**（実コードからの import が現在0件）
- [ ] 3.3 整形された本文の面（`MarkdownView`）にも同じ塗りを載せる。**面の分岐を注釈の側に入れない** — どちらの面も同じ `PositionPort` を `defineExpose` で出している（`MarkdownView.vue:141` / `MarkdownSource.vue:77`）
- [ ] 3.4 `PositionPort` / `SourceRange` を **type-only import** で参照する。実行時の依存を持たない（design 決定6）
- [ ] 3.5 `modules/markdown/` を1行も変えないまま 3.2・3.3 が成立することを確かめる（design 決定1）。直したくなった箇所は**直さずに記録する**（R5）。**この章に例外は無い** — 決定1 が持つ例外は 6.4 の素通し1件だけである
- [ ] 3.6 `data-testid="approval-annotate-source"` を新しい面へ引き継ぐ。掴み所を変えると、変わっていないことを確かめられなくなる（design 決定12）

## 4. 図に注釈が付いたら生テキストを添える（`sourceShown` の配線）

design 決定7 が定める中核。**`MarkdownView` の `sourceShown` に注釈の範囲を渡す作業は、ここにしか無い。**

- [ ] 4.1 位置を持つ注釈の範囲を `SourceRange[]` に組み、`MarkdownView` の `sourceShown` prop（`MarkdownView.vue:76`、既定は空配列）へ渡す。**これが `SOURCE_SHOWN_KEY` の最初の使い手になる** — `:109` の `provide(SOURCE_SHOWN_KEY, () => shownInParsed.value)` を実コードから踏むのはこの配線だけで、現在の使い手はモジュール自身の単体（`test/modules/markdown/runtime/render/markdown-view-source-shown.test.ts`）しか無い
- [ ] 4.2 渡すのは「**位置を持つ注釈の範囲**」であって「図に付いた注釈の範囲」ではない。**注釈の側に図の分岐を入れない**（design 決定7。図の対応表は `fence.ts` が持つ）
- [ ] 4.3 注釈が1件も無いときは空の配列を渡し、図に生テキストが添えられないことを確かめる（`annotation` spec:172-175「注釈の付いていない図」）
- [ ] 4.4 基準は**取得したままの文字列のまま**渡す。揃える手続きを注釈の側に持たない（`MarkdownView.vue:103-107` が `createSourceMapping` の写像を通してから降ろす。Context 4）
- [ ] 4.5 注釈が増減するたびに新しい配列の参照を渡してよいことを確かめる。`MarkdownView.vue:101` が写像を別の `computed` へ分けているのは、まさにこの配線を見込んだ手当てである（archive 済み `adr0017-sub-fix-normalization-offset` の tasks 9.1 の直し）

## 5. 本文の色と脇の一覧を互いに辿る

- [ ] 5.1 本文 → 一覧: 塗られた範囲は要素ではないので、器に置いたクリックの座標から文字位置を引く。`caretPositionFromPoint` と `caretRangeFromPoint` の**両方を見る**（design 決定5・R4）。**片方しか見ない実装にしない**
- [ ] 5.2 覆っているコメントが複数あるときは、**最後に付けたもの**を開く。いまの `AnnotateSource.vue:72` の `marks[marks.length - 1]` と同じ決め方で、振る舞いを変えない
- [ ] 5.3 一覧 → 本文: `toDomRange` に位置を渡して範囲を得る。**座標を使わない**（design 決定5）
- [ ] 5.4 座標が引けない環境では「一覧へ辿れない」に倒れるだけで、指摘は付けられることを確かめる（R4）

## 6. 面を2つに絞る（**承認画面とストローク側の proposal 確認画面の両方**）

現状の面は3つ（整形だけ／生テキストだけ／両方を並べる）で、脇のコメント一覧はどの面でも出したまま。**注釈を付けられる面の制限を外し、面を2つに絞る。**

**この章は2つの画面が対象である**（design 決定9・R7）。同じ実体（`useAnnotations` / `AnnotateSource`）を2つの画面が共有しているので、片方だけ2面にすると、閉じたはずの実体が面の数で分岐する。

- [ ] 6.1 ポータルの承認画面 `app/components/review/ApprovalAnnotator.vue` — `ViewMode`（`:106`）と `MODES`（`:108-112`。`:111` が `side-by-side`）から並列表示を落とし、`:339` の並べる面の枝（`:340-355` の中身）を消す
- [ ] 6.2 同 — `annotatable`（`:121` の `mode.value !== 'preview'`）の分岐を消し、`:463-465` の「「注釈」か「並列表示」に切り替えると、本文を選んでコメントを付けられます。」の断り書きを外す（付けられない面が無くなるため）
- [ ] 6.3 同 — `:315` のプレビューの枝（`v-show="mode === 'preview'"`）と `:327` の注釈の枝の双方に注釈の面を載せる。`:321` の「指摘を付けられるのはこの面だけ」のコメントを実態に合わせて書き換える
- [ ] 6.4 **承認画面のプレビューの中身は呼ぶ側が置いている。** `ApprovalAnnotator.vue:317` の `<slot name="preview" />` へ、`app/pages/projects/[projectId]/approvals/[approvalId].vue:113-137` が `MarkdownEditor`（`:119-126`。編集できる文書）または `MarkdownView`（`:129-135`。編集できない文書）を差し込んでいる。**整形された本文の面で注釈を付けるには、この経路を通す必要がある**
  - **`MarkdownEditor.vue`（`modules/markdown/runtime/edit/`）は `MarkdownView` を内側に持つ（`:259` と `:269`）が、`PositionPort` を `defineExpose` で出し直していない**（実測。`defineExpose` が1件も無い）。編集できる文書のプレビューには、外から位置の口が届かない
  - **`MarkdownEditor` に `PositionPort` を `defineExpose` で出させる**（design 決定1 の例外1件・R11）。**素通しだけを書く。** `MarkdownView.vue:141` の `defineExpose({ toSourceRange, toDomRange } satisfies PositionPort)` と同じ形にし、`MarkdownSource.vue:77` とも揃える。ここで範囲を加工しない・面を選び直さない・注釈の存在を持ち込まない
  - 具体化: 内側の `MarkdownView` を `useTemplateRef`（`#imports` から。`MarkdownView.vue:37` の import と同じ）で受け、`toSourceRange(range)` / `toDomRange(source)` は受けた面の同名メソッドを呼んで `?? null` で返すだけにする。`PositionPort` / `SourceRange` は `../position/types` から **type-only import** で引く
  - **`ref` は `:259`（プレビューの `MarkdownView`）と `:269`（読みの `MarkdownView`）の両方に同じ名前で置く。** `v-if` / `v-else-if` / `v-else` の排他なので、どの瞬間も高々1つしか mount されていない。生テキストを編集している枝（`:262-268` の `textarea`）では整形された面が無いので `null` が返る — 面が無いときに `null` を返すのは `MarkdownView.vue:127-131` と同じ倒れ方である
  - **プレビューの枝が指すのは直しかけ（`draft`）である**（`:259` の `:value="draft"`）。保存済みの本文と食い違っている間は、口が返す位置も直しかけを基準にする。**口は面が今描いているものをそのまま指す**という形を崩さない。保存前の本文へ注釈を出すかどうかは注釈の側の判断で、ここでは決めない
  - **これで呼ぶ側は2つの差し込みを分岐せずに済む。** `MarkdownEditor`（`:119-126`）も `MarkdownView`（`:129-135`）も同じ `PositionPort` として `ref` で受けられる。編集できる文書かどうかで注釈の載せ方を変えない（`markdown/module`「面の違いによる分岐が要らない」と同じ形）
  - **素通し以上のことをやりたくなったら、そこで手を止める。** それは口の設計が誤っていた合図であり、design 決定1 の但し書き（直さずに記録する）へ戻る（R5）
- [ ] 6.5 ストローク側の proposal 確認画面 `app/pages/strokes/[sessionId]/proposal.vue` — `modes`（`:72-76`。`:75` が `左右`）から並べる面を落とし、`:180-194` の枝を消す。`:170` の `ReviewAnnotateSource` は残し、`:161` の `MarkdownView` にも注釈を載せる。**こちらはプレビューが `MarkdownView` を直に置いているので、6.4 の素通しは要らない**（口は最初から出ている）
- [ ] 6.6 同 — `:155` の「ここからは指摘を付けられない」と `:169` の「指摘を付けられるのはこの面だけ」のコメントを実態に合わせて書き換える
- [ ] 6.7 同 — 承認後は `shownMode`（`:70`）が `preview` へ倒れる扱いを、面が2つになった後も保つ（承認後は注釈も差し戻しもしない）
- [ ] 6.8 `app/composables/useProposalReview.ts:16` の `ViewMode = 'preview' | 'annotate' | 'side-by-side'` から並べる面を落とす。`:111` の初期値（`'annotate'`）を、読む面のままで指摘を付けられるようになったことに合わせてどちらにするか決める
- [ ] 6.9 一方の面で付けた注釈が、もう一方の面にも出ることを確かめる（spec:99-109）
- [ ] 6.10 一方の面で消した注釈が、もう一方の面からも消えることを確かめる（spec:111-114）
- [ ] 6.11 面を切り替えても脇の一覧は出たままで、コメントが消えないことを確かめる（spec:39-42「面を切り替える」）
- [ ] 6.12 面が2つであることと、失われた操作が無いことを両画面で確かめる（spec:82-91）

## 7. 注釈の単体テスト（新規。`test/app/components/review/` と `test/app/composables/`）

`annotation` spec の Scenario を、面の実装から切り離して押さえる。置き場は写し元の構造に従う（`app-structure`「テストは写し元の構造に従う」）。

- [ ] 7.1 同じ語が本文に何度も現れるとき、**選んだ箇所だけ**に注釈が付き、他の箇所には付かないことを確かめる（spec:20-24）
- [ ] 7.2 強調やリンクを跨いだ選択に注釈が付き、強調や段落の表示が崩れないことを確かめる（spec:122-125）
- [ ] 7.3 注釈を付ける前後で、本文の**改行位置と折り返し**が変わらないことを確かめる（spec:127-130）。DOM を1文字も書き換えない方式であることの根拠
- [ ] 7.4 コードブロックの内側の一部に注釈を付けられ、どちらの面でも同じ範囲を指すことを確かめる（spec:138-141）
- [ ] 7.5 **言語の指定が無いコードブロック**の内側の一部にも注釈を付けられることを確かめる（spec:143-146）
- [ ] 7.6 コードブロックの手前の段落からコードブロックの中ほどまでを選ぶと、**生テキストの上で連続した1つの範囲**になることを確かめる（spec:148-151）
- [ ] 7.7 図の中の一語に付けた注釈が、添えられた生テキストの上で**その一語だけ**を指すことを確かめる。整形された本文の面で図に添えられた生テキストの一部を選んでも、図全体に広がらないことも押さえる（spec:161-165・167-170）
- [ ] 7.8 図に注釈を付けて生テキストが添えられても、**本文の他の箇所の位置が変わらない**ことを確かめる（spec:183-186）
- [ ] 7.9 図に付けた注釈を差し戻しで送ると、送られる位置が**付けたときの範囲のまま**で、図全体に広がっていないことを確かめる（spec:177-181）
- [ ] 7.10 重なった注釈・飲み込まれた注釈・**同一範囲の2件目**が、どちらの面でも判別できることを確かめる（spec:196-210）。2.3 の1本の `Highlight` が落ちたら**ここで止まる**（R3）
- [ ] 7.11 1.2 の妥当性の述語 — 長さの外側、開始が終了以上、`toSourceRange` の `null` を、それぞれ落とすこと
- [ ] 7.12 位置の口が `null` を返したときの倒れ方 — 塗らずに落とし、例外にしない（R1）
- [ ] 7.13 差し戻しのペイロード（`SendBackPayload` / `ApprovalRevisionPayload`）が、**どちらの面で付けても同じ形**であることを確かめる。`Annotation`（`startOffset` / `endOffset` / `selectedText` / `highlightColor`）は1バイトも変えない（Context 5）
- [ ] 7.14 **6.4 の素通しを押さえる。** `MarkdownEditor` が `PositionPort`（`toSourceRange` / `toDomRange`）を外へ出しており、呼びが内側の `MarkdownView` へ届くこと。整形された面が無いとき（生テキストを編集している枝）は両方向とも `null` で、例外にしないこと。**置き場だけこの章の他と違う** — 対象が `modules/markdown/` なので `test/modules/markdown/runtime/edit/` に置く（隣は `roundtrip.test.ts`）。形は `test/modules/markdown/runtime/render/markdown-view-position.test.ts`（内側を差し替えて口が出ているかだけを見る）に倣い、変換そのものの正しさをここで重ねない。**この1本が落ちたら、承認画面の整形された面へ口が届かなくなっている**

## 8. E2E

- [ ] 8.1 `test/e2e/approval-annotation.spec.ts` の `selectRange`（`:27-57`）を書き換える。断片分割が消えて `[data-start]` が無くなるため（design 決定12）。**補助関数は足場であって振る舞いではない**
- [ ] 8.2 同 — 生テキストの面の**振る舞いが変わっていない**ことを確かめる（選んだ範囲・付いた注釈・本家へ渡る値）
- [ ] 8.3 同 — `:85` と `:111` の `approval-mode-side-by-side` を踏む箇所を、2つの面に合わせる
- [ ] 8.4 同 — **整形された本文からの往復を足す**（散文・コードブロックの内側・図の3種）
- [ ] 8.5 `test/e2e/upstream-style.spec.ts:286` の `approval-mode-side-by-side` を2つの面に合わせる
- [ ] 8.6 `yarn build` を挟んでから `yarn test:e2e` を走らせる（E2E はビルド済みの `.output/server/index.mjs` に対して走る）。**artifact 作成時には実行していない**

## 9. 通しで確かめる

- [ ] 9.1 着手時の `yarn test` の本数とファイル数を記録する
- [ ] 9.2 `yarn typecheck` が通ること
- [ ] 9.3 `yarn test` が通ること。増分が7章で足した分だけであることを確かめる
- [ ] 9.4 `modules/markdown/` の差分が **`runtime/edit/MarkdownEditor.vue` の口の素通し（6.4）1件だけ**であることを `git diff --stat` で確かめる（design 決定1 の例外）。`MarkdownView.vue` / `MarkdownSource.vue` / `runtime/position/` は1行も動いていないこと。直したくなった箇所の記録（3.5）を成果として残す
- [ ] 9.5 `openspec validate create-module-annotation --strict --store stroke` が valid であること。**`yarn check` は判定に使わない**（未着手の change を落とすため）
- [ ] 9.6 ADR-0017「委譲の内訳」の完了判定4項目を実測で突き合わせる — 注釈の実体が markdown の描き方に依存しないこと／整形された本文の面で注釈を付けられること／どちらの面で付けた注釈も両方の面に出ること／面が2つに絞られ並列表示が無くなっていること

## 10. 上位資料への整合反映（ユーザー承認が要る）

`docs/agents/issue-tracker.md`「更新対応」により、**承認前に上位資料を書き換えない**。

残っているのは2件（2026-09-01 に整理。`file-composables.md` の節の移設・`system-structure.md` の `modules/`・ADR 要否・ticket の誤記は、移設を止めたこと／ユーザー判断／修正済みにより落ちた）。

- [ ] 10.1 次の2件をユーザーに諮る
  - `docs/specs/plan/components-library-replacement.md:36` の `review/AnnotateSource` の**据置**判定。部品の役目が「生テキストを並べてオフセットを振る」から「位置の口を受け取って塗る」へ変わり、据置の根拠（「vueuse `useTextSelection` は用途が異なる」）が消える（Context 8）
  - `docs/specs/core/file-components.md:59` の `AnnotateSource.vue` の行（props / emit と行数。132 とあるが実測 140）と `:60` の `ApprovalAnnotator.vue` の行数（430 とあるが実測 577）
- [ ] 10.2 承認されたら反映を入れる。承認されなければ入れない

## 11. レビューと完了承認

- [ ] 11.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。**レビューが完全にパスするまで続ける**（`openspec instructions tasks --change create-module-annotation --store stroke` の `rules`。**いかなるルールよりも優先する**）
  - `typescript-reviewer` は `/opt/projects/stroke-board/.claude/agents/typescript-reviewer.md` に在る store 直下の project agent で、**`.claude/agents/` を持たない worktree からは一覧に出ない**。実行時に呼び出せなければ、代替のレビュー手段をユーザーに確認してから進める。**独断で別のエージェントに差し替えない**
- [ ] 11.2 成果物を commit する（この worktree のブランチへ直接）
- [ ] 11.3 **ユーザーから完了承認を得る**（`rules`。MUST）
