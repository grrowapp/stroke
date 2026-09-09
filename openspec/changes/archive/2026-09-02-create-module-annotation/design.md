## Context

動機は `proposal.md` の Why、満たすべき振る舞いは `specs/annotation/spec.md` を参照。

**この change は artifact の作られた順が逆である。** `specs/annotation/spec.md` と `tasks.md` が先に在り、`proposal.md` と `design.md` を後から補った。したがってこの2本は既存の要件と作業の分解から**逆算して書かれている**。要件を新たに起こしてはおらず、`specs/annotation/spec.md` の Requirement は1つも動かしていない（2026-09-01 に capability 名を `annotation/module` から `annotation` へ改め、Purpose から「1つの場所に閉じる」を外した。決定13）。`ui.md` は作れない — あれは「ユーザーが実際にブラウザで見た prototype の結果を記録するもの。想像で書いてはならない」と定められており、prototype を経ていないためである。

**先に在った `tasks.md` は、この design と `specs/project/ui` `specs/stroke/frontier` の2本が揃った後に全面改訂した。** 逆算で書いた下流が先に在ると、下流に無い作業（`sourceShown` の配線・妥当性の述語・ストローク側の画面・上位資料への整合反映）が作業リストから落ちる。**tasks は下流の3点をすべて読んだ後の版だけが有効である。**

実装を制約する条件が8つある。

**1. 位置の口は在るが、使われていない。** `modules/markdown/runtime/position/types.ts` の `PositionPort` は `toSourceRange(range: Range): SourceRange | null` と `toDomRange(source: SourceRange): Range | null` の2つで、整形の面（`MarkdownView.vue:141`）と生テキストの面（`MarkdownSource.vue:77`）が**同じ `defineExpose` で出している**。外から見て両者は区別が付かない。だが `app/` と `test/e2e/` にこの2つの呼び出しは1件も無く（在るのは `test/modules/markdown/` の、モジュール自身の単体だけである）、**`MarkdownSource.vue` は実コードからの import が0件**である。この change が最初の使い手になる。

**2. いまの塗りは要素を作る。** `AnnotateSource.vue` は本文を注釈の境界で切って断片に分け、覆われている断片を `<mark>` にし、覆っているコメントの数だけ `inset box-shadow` の下線を積む（`:83-88`）。生テキストは1つの text ノードなので切れるが、整形された本文は要素の入れ子を持つので、境界を跨いだ選択を包むと構造が壊れる。**要素を作らずに塗る手段でなければ整形の面には載らない。**

**3. 注釈の面は2つの画面に別々に組まれている。** ポータルの承認画面（`app/components/review/ApprovalAnnotator.vue`）と、ストローク側の proposal 確認画面（`app/pages/strokes/[sessionId]/proposal.vue:161-194`）である。どちらも面が3つ（`preview` / `annotate` / `side-by-side`・`左右`）で、`AnnotateSource` と `useAnnotations` を共有している。**面を2つにする作業は2箇所に要る。** 改訂前の `tasks.md` はストローク側の2ファイルの名前を一度も出していなかった。改訂版は 1.5・1.6 と 6.5〜6.8 で名指しする（決定9）。

**4. 座標の基準は決着している。** オフセットの基準は「本家から取得した文書の中身そのもの」で、食い違いを吸収するのは面の内側である（`adr0017-sub-fix-normalization-offset`、archive 済み）。**注釈の側は取得したままの文字列を渡してよく、揃える手続きを持たない。** `MarkdownView` は `createSourceMapping` で写像を持ち、`sourceShown` も同じ写像を通してから降ろしている（`MarkdownView.vue:101-109`）。

**5. 外へ出る保存形は本家が読む。** `Annotation`（`#shared/stroke:60-78`）は `startOffset` / `endOffset` / `selectedText` / `highlightColor` を持ち、差し戻し（`needs-revision`）で本家へそのまま渡る。本家はオフセットを数値として解釈しないが、系の中で唯一それを文書へ当てる実装（本家ダッシュボードの SPA）は生ファイルへ当てる。**この形は触らない。**

**6. 色の定義が composable に在り、部品が逆向きに import している。** `useAnnotations.ts` の `highlightColors`（5色。`bg` と `border` の実値）を `CommentModal.vue:5` が直接 import している。塗りが inline style だからこの形が成立している。

**7. prototype のコードが `ApprovalAnnotator.vue` の外側に乗っている（版は1つに収束済み）。** `add-full-width-markdown-editor` の `ui.md` を決めるための使い捨てで、`ApprovalAnnotator.vue` と `app/layouts/workspace.vue` を書き換えている。ticket は「2版入っている」（`usePrototypePanels.ts` と `usePrototypeFullWidth.ts`）と記しているが、**追随済みの現況では版は1つである**（実測 2026-09-01）。

- `app/composables/usePrototypePanels.ts` — 在る。`ApprovalAnnotator.vue:31` が import し、`:36` で `rightTucked` / `tuckRight` / `untuckRight` を受けている
- `app/composables/usePrototypeFullWidth.ts` / `PrototypeVariantBar.vue` — **どちらも存在しない**（`app/` `modules/` `test/` に参照0件）

**したがって「2版の食い違いに備える」指示は要らない。** 残る事実は「面の外側のレイアウトが prototype に書き換えられている」の1点で、この change は面の内側を作り替えるだけなので、外側には手を入れない（決定8）。

**8. `docs` が `AnnotateSource` を「据置」と判定している。** `docs/specs/plan/components-library-replacement.md:36` は理由を「Selection API の一回読取 + オフセット変換。vueuse `useTextSelection` はリアクティブ追跡で用途が異なり、代替できるライブラリが無い」としている。この判定は**部品の役目が変わらない前提**で下されている。役目が「生テキストを並べてオフセットを振る」から「位置の口を受け取って塗る」へ変わると、オフセット変換は口の側に移り、残るのは選択の追跡だけになる。据置の根拠が消える。

## Goals / Non-Goals

**Goals:**

- 注釈の実体が markdown の描き方を知らない状態にする（置き場は `app/` のまま。決定13）
- 読んでいる面のまま指摘を付けられるようにする。面の切り替えを指摘の前提にしない
- 位置の口を実際に使い、口の形が正しいかどうかを確かめる
- 塗りが本文の見え方（改行位置・字間・折り返し）を動かさない状態にする

**Non-Goals:**

- 位置の口そのものを直すこと。この change は利用者であり、提供者ではない（決定1）。例外は無い
- 保存形と外へ出る値を変えること（Context 5）
- 全体へのコメント、差し戻しの送信、承認・却下の置き場
- prototype の本実装化（決定8）

## Decisions

### 決定1: 口の利用者に徹する。`modules/markdown/` を触らない

`MarkdownView.vue` と `MarkdownSource.vue` は変更しない。**触る必要が出たら、それは親が公開した口の設計が誤っていた合図である。** 黙って直すと、口の検証というこの change の副次的な価値が失われるので、直したくなった箇所は記録して残す。

生テキストの面は `AnnotateSource` が自前で並べるのをやめ、`MarkdownSource` へ寄せる（tasks 3.2）。**これで `MarkdownSource` の最初の使い手が生まれる**（ticket「`MarkdownSource.vue` の最初の使い手になる」）。同時に、生テキストを `<pre>` に並べる実装が `AnnotateSource` と `MarkdownSource` の2箇所にあった重複が消える（`app-structure` の「`modules/` に置いたものの実体を `app/` の側に重複して持ってはならない」）。

**代替: 生テキストの面は `AnnotateSource` のまま残す。** 却下。塗りを口の上に載せる形にする以上、面が自前で `data-start` を振る理由が無くなる。残すと、生テキストの面だけが別の仕組みで動くことになり、「面の違いによる分岐が要らない」（`markdown/module`）が成立しない。

**例外は無い。** 以前は「承認画面のプレビューが `MarkdownEditor` を通っていて口が出ていない」ため素通しの例外を持っていたが、承認画面は編集できない（本家どおり。ユーザー決定 2026-09-01）と決まり、`add-full-width-markdown-editor` がプレビューを `MarkdownView` 直置きにする。`MarkdownView` は既に口を出している（`:141`）ので、呼ぶ側はその `ref` から受けるだけでよい。

### 決定2: `SourceRange` を branded type にしない（ticket「引き継いだ判断」）

`adr0017-sub-add-detection-assumptions` が「型で分ける案は後続 `create-module-annotation` の API を先に縛るため、**消費者が実在してから判断する**」として先送りにした件である。消費者はこの change であり、**答えは「しない」**。

**理由1: 消費者から見て、その区別は既に `null` が持っている。** 懸念は「offset 0」と「位置が無い」を型で分けられないことだった。だが注釈の側が触るのは `PositionPort` の2つのメソッドだけで、位置が無いことは `SourceRange | null` の `null` として届く。**`SourceRange` の中に「無い」を表す値が入ってくる経路が消費者側に存在しない。** 素の `number` のまま困らない。

**理由2: 縛ると、外へ出る形との間に変換が要る。** `Annotation.startOffset` / `endOffset` は素の `number` で、本家へ JSON として渡る（Context 5）。`SourceRange` を branded にすると、口から受けた値を保存形へ入れるところと、保存形から口へ戻すところの両方でキャストが要る。**キャストは型の保証を捨てる操作である。** 境界の両側に置くと、守りたかったものが境界で消える。

**理由3: 残る弱さはモジュールの内側にある。** 実際に踏んだ不具合は「offset 0 から始まる要素の `position` が `undefined` になり、そこに 0 を書くと文書の冒頭が `[0,0)` を指す」で、`MDCNode.position` が `position?` であることに由来する（`docs/specs/reference/mdc-observations.md`）。これは `modules/markdown/` の内側の話であり、`fence.ts:237-248` のコメントで固定され（`:249` が `if (!position) return null;` の本体）、実際に踏みうる2つは既に塞がっている。**消費者の型を縛っても、この弱さは1ミリも動かない。**

**代わりに置くもの（tasks 1.7、押さえは 7.11）。** `SourceRange` の妥当性を判定する述語を注釈モジュール側に1つ持つ（`start < end` かつ両端が本文の長さの内側）。いまは `AnnotateSource.vue:45` の `clamp` と `:56` の `start < end` に散っており、移設先で同じ判定が2箇所に増えるのを防ぐ。**型ではなく関数で塞ぐ**という `adr0017-sub-add-detection-assumptions` の構えをそのまま引き継ぐ。

**代替1: `SourceOffset` の branded type を作り、`start` / `end` をそれにする。** 却下。理由2のとおり境界でキャストが要る。

**代替2: `SourceRange` を `{ start: number; end: number } | null` ではなく `Result` 型にする。** 却下。口の形（`| null`）は親が公開して本体 specs に入っており、利用者の都合で変える対象ではない（決定1）。

**この判断は先送りの終点である。** ticket の「引き継いだ判断」は、これで閉じる。

### 決定3: 塗りは CSS Custom Highlight API。色ごとに1つの `Highlight` を持つ（tasks 2.2〜2.4）

`CSS.highlights` に色ごとの `Highlight` を登録し、`::highlight(<名前>)` で見た目を当てる。**DOM を1文字も書き換えないので、本文の要素構造も改行位置も折り返しも動かない**（`annotation` spec の「注釈を付ける前後で本文が動かない」）。断片分割と下線積み（`AnnotateSource.vue:58-93`）は消す。

**重なりは `Highlight.priority` では解決しない。** `priority` は同じ範囲を1つに畳むので、`annotation` spec:207-210「同一範囲に2件」を満たせない。表し方は下の「重なりをどう見せるか」に従う。

**副次の効き目が2つある。**

- **SSR と噛み合う。** 塗りはブラウザの側だけで起き、サーバーが描く markup に現れない。`<mark>` を挿す方式は SSR と client で markup が割れうるが、この方式は割れようが無い
- **塗りの実値が CSS へ移る。** `::highlight()` は inline style を受け取れないので、5色は CSS の規則（`app/assets/css/main.css`）として持つほかない。`useAnnotations` の `highlightColors` は動かさない（`CommentModal` の色見本と保存形が使う。Context 6 の逆向き import はこの change では解かない）

**制約を1つ抱える。** `::highlight()` に効くプロパティは限られる（文字色・背景色・下線の類・文字の影の系統）。**枠・余白・`box-shadow` は効かない。** いまの重なりの表し方（下線を2px ずつ内側へ積む）はそのまま移せない。

**重なりをどう見せるか。** 色ごとの `Highlight` に加えて、**2件以上に覆われている範囲だけを集めた `Highlight` を1本持ち、下線で示す。** 半透明の背景は重なった分だけ濃くなるので「飲み込まれた注釈」は色でも分かるが、**同一範囲・同色の2件目は背景だけでは判別できない**（`annotation` spec の「同一範囲に2件」が要求している）。覆っている件数から作る 1本の `Highlight` なら、色が同じでも「2件ある」ことが本文の上に出る。これは tasks 2.4 が消す「重なりの**下線積み**」ではない — 積まず、1本である。

**代替1: `<mark>` のまま整形の面にも載せる。** 却下。強調やリンクを跨いだ選択で要素構造が壊れる（Context 2）。これが面の制約そのものだった。

**代替2: 本文の上に絶対配置の矩形を重ねて塗る。** 却下。`Range.getClientRects()` から矩形を起こす形になり、折り返し・スクロール・フォントの読み込み・ウィンドウ幅の変化のたびに追随が要る。塗りが本文と別のレイヤーに居るので、**ずれても症状が「少し違う場所が塗られている」にしかならない**。黙って壊れる形を増やさない。

**代替3: 本家と同じライブラリ（`react-text-annotate-blend` 相当）を探す。** 却下。`<mark>` で包む方式の系統であり、代替1と同じ壁に当たる。

### 決定4: 選択の検出は VueUse の `useTextSelection`（tasks 3.1）

`mouseup` を拾って `window.getSelection()` を一回読む自前実装（`AnnotateSource.vue:106-117`）をやめる。**塗りが `Range` を要るようになるので、選択を「その瞬間の値」ではなく「追跡している状態」として持つほうが噛み合う。**

`docs/specs/plan/components-library-replacement.md:36` はこれを「用途が異なり代替できない」として据置にしているが、その判定は部品の役目が変わらない前提で下されている（Context 8）。**据置の根拠が消えることを、上位資料へ反映する提案として下に置く。**

空白だけの選択を捨てる判定（`AnnotateSource.vue:114`）は残す。振る舞いを変えない。

### 決定5: 本文 → 一覧は座標で引き、一覧 → 本文は口で引く（tasks 5.1〜5.3）

**塗られた範囲は要素ではないので、クリックの当たり判定が無い。** 本文の側から一覧のコメントへ辿るには、器に置いたクリックから座標を取り、座標から文字位置を引くほかない。`caretPositionFromPoint` と `caretRangeFromPoint` の**両方を見る** — ブラウザによってどちらが在るかが違う。

覆っているコメントが複数あるときは、**最後に付けたものを開く。** いまの `paint.id`（`AnnotateSource.vue:72` の `marks[marks.length - 1]`）と同じ決め方で、振る舞いを変えない。

逆向き（一覧のコメント → 本文の範囲）は**座標を使わない**。`toDomRange` に位置を渡して範囲を得る。座標で往復させると、面が変わるたびに当たり判定を作り直すことになり、「面の違いによる分岐が要らない」が崩れる。

### 決定6: 注釈の側は `#markdown` の位置の口の**型だけ**を参照する（tasks 1.3・3.4）

`annotation` spec の要件は「markdown の解釈の仕組み・フェンスの扱い・本文の見た目の指定に依存してはならない。依存してよいのは、生テキストと、描いた本文と生テキストの位置の対応だけ」である。**位置の口は依存してよい側に入っている。**

そこで `PositionPort` / `SourceRange` は `modules/markdown/` に置いたまま、注釈の側が **type-only import** で参照する。実行時の依存は持たない。

**代替: 口の型を `#shared` へ移し、どちらのモジュールも他方を知らない形にする。** 却下。位置の口は markdown モジュールが公開する契約そのものであり（`markdown/module` の「描いた本文と生テキストの位置の対応を公開する」）、置き場を移すと**契約の持ち主が2人になる**。片方だけ直る余地を作らない。

**代替: 注釈の側が同じ形の interface を自分で宣言する（構造的に合わせる）。** 却下。同じ契約の写しが2つできる。片方が変わっても、もう片方は黙って通る。

**tasks 1.3 の grep が見るもの。** 「markdown の解釈の仕組み」への参照である。具体的には `parseMarkdown` / `MDC` / `mdc` / `remark` / `shiki` / `prose` / フェンスの部品、および `#markdown/render/` と `#markdown/assets/` への参照。`#markdown/position/types` への type-only import は**許す側に置く**。許す線をここで固定しておかないと、grep が通ることを目的に契約の写しを作る方向へ倒れる。

### 決定7: 図に添える生テキストの範囲は、注釈の側が渡す（tasks 4章）

`MarkdownView` の `sourceShown` は「元の生テキストを見せたい範囲」を外から受け取る口で、**モジュールはそれが注釈かどうかを知らない**（`markdown/module` の「元の生テキストを見せたい範囲は外から受け取る」）。注釈の側が、位置を持つ注釈の範囲をそのまま渡す。

**この配線がこの change の中核であり、作業として現れるのは tasks 4章だけである。** 触る先は次の3点で、いずれも実測（2026-09-01）。

- `MarkdownView.vue:76` — `sourceShown?: readonly SourceRange[]`。既定は `:78` の空配列。**注釈の側がここへ渡す**
- `MarkdownView.vue:103-107` — `createSourceMapping` の `toParsed` を通し、写せない範囲を落とす
- `MarkdownView.vue:109` — `provide(SOURCE_SHOWN_KEY, () => shownInParsed.value)`。フェンスの側（`render/source-shown.ts:87` の `inject`）がここから受ける

**`SOURCE_SHOWN_KEY` を実コードから踏むのは、この配線だけになる。** 現在の使い手はモジュール自身の単体（`test/modules/markdown/runtime/render/markdown-view-source-shown.test.ts`）しか無い。archive 済みの `adr0017-sub-fix-normalization-offset` は tasks 9.1 の直しについて「いまは呼び出し元が無いので実害は無いが、後続 `create-module-annotation` が指摘のたびに新しい配列を渡すと効いてくる」と記して閉じている — その呼び出し元がこの change である。**写像を別の `computed` へ分けた手当て（`MarkdownView.vue:101`）が効いているかどうかは、ここで初めて確かめられる**（tasks 4.5）。

これで「注釈が1件も付いていない図に生テキストを添えてはならない」も「図の中の一語に付けた注釈が、添えられた生テキストの上でその一語だけを指す」も、注釈の側に図の知識を持たずに満たせる。添えられた生テキストは `MarkdownView` の位置の口の一部として扱われる（`fence.ts` が対応表を持つ）ので、**注釈の側には図とそれ以外の分岐が入らない。** 渡すのは「位置を持つ注釈の範囲」であって「図に付いた注釈の範囲」ではない。

`sourceShown` は正規化の写像を通ってから降ろされる（`MarkdownView.vue:103-107`）。注釈の側は取得したままの文字列の基準で渡してよい（Context 4）。

### 決定8: prototype のコードは、この change で本実装にしない

`ApprovalAnnotator.vue` は面の外側のレイアウト（`grid` → `flex`、指摘の一覧をしまうつまみ）を prototype に書き換えられている。**この change が作り替えるのは面の内側**（どの面を出すか・そこに何を塗るか）であり、外側のレイアウトには用が無い。

**prototype の記述はそのまま残して、面の内側だけを差し替える。** 畳むのは `add-full-width-markdown-editor` の役目であり、この change が先に畳むと、あちらが `ui.md` を書くための材料を失う。

**版は1つに収束している。** ticket（`:49-51`）は「2版入っている」と記しているが、追随済みの現況では `usePrototypePanels.ts` だけが在り、`usePrototypeFullWidth.ts` も `PrototypeVariantBar.vue` も**存在しない**（`app/` `modules/` `test/` に参照0件。実測 2026-09-01）。`ApprovalAnnotator.vue:31` は `usePrototypePanels` を import している。**存在しない衝突に備える必要は無い。** ticket の記述は実測に当たらないので、直すかどうかをユーザーに諮る（tasks 10.7）。

**取り違えないための印。** `PROTOTYPE` のコメントが付いている箇所は触らない — `ApprovalAnnotator.vue` では `:30` `:35` `:39` `:306` `:360` `:369` `:384` `:411` `:448` である。一方 **`ViewMode`（`:106`）・`MODES`（`:108-112`）・`annotatable`（`:121`）・`:463-465` の断り書きは prototype ではなく本実装**で、ここは触る。

### 決定9: 面を2つにするのは、承認画面とストローク側の proposal 確認画面の両方（Context 3）

2つの画面が同じ実体（`useAnnotations` / `AnnotateSource`）を共有している以上、**片方だけを2面にすると、同じ実体が面の数で分岐する。**

**触る先は実測で次のとおり。** tasks はこれを 6章（6.5〜6.8）で名指しする。

- `app/pages/strokes/[sessionId]/proposal.vue` — `modes` が3つ（`:73` `preview` / `:74` `annotate` / `:75` `左右`）。`ReviewAnnotateSource` を2箇所で使っている（`:170` の注釈の面、`:181` の並べる面の左）。並べる枝は `:180-194`
- `app/composables/useProposalReview.ts` — `:16` に `export type ViewMode = 'preview' | 'annotate' | 'side-by-side'`、`:13` に `useAnnotations` の import、`:111` に初期値 `ref<ViewMode>('annotate')`

**改訂前の tasks はこの2ファイルの名前を一度も出していなかった。** 「移設の時点で気付く」に頼ると、面を2つにする作業がポータル側だけで終わる。作業として明示する。

### 決定10: `project/ui` と `stroke/frontier` の delta は書いてある。手法は片方だけ MODIFIED

この2つの本体 specs は**「指摘を付けられるのは素の本文の側だけ」「面は3つ」を明文で定めている**（`project/ui/spec.md:166` と Scenario「承認画面を開いた直後」、`stroke/frontier/spec.md:280` と Scenario「プレビューでは指摘を付けない」）。この change はどちらとも正面から食い違うので、**delta を2本置いた**（`specs/project/ui/spec.md` と `specs/stroke/frontier/spec.md`。どちらも作成済みで、`openspec validate --strict` を通っている）。

**手法が2本で割れているのは、要件名が変わるかどうかによる。**

- **`specs/project/ui/spec.md` は MODIFIED。** 本体の要件名「承認対象の文書に箇所を指した指摘を付けられる」がそのまま通る。面の数と「素の本文の側だけ」を書き換え、Scenario「承認画面を開いた直後」の「この面からは指摘を付けられない」を落とし、Scenario を3つ足した。**オフセットの基準の規定（`:170`）は1文字も触らない** — `adr0017-sub-fix-normalization-offset` が確定させたもので、この change の対象外である（proposal「対象外」）。本体の6段落・7 Scenario はすべて保持している
- **`specs/stroke/frontier/spec.md` は REMOVED + ADDED。** 本体の要件名は「proposal の**見せ方を切り替えられる**」で、新しい要件は「proposal の**見せ方は2つで、どちらでも指摘を付けられる**」である。**要件名が変わるので MODIFIED では見出しが一致せず、本体のどの要件を書き換えたのかを OpenSpec が突き合わせられない。** 名前を据え置いて中身だけ差し替える手もあるが、「切り替えられる」は3つの見せ方があることを前提にした名であり、前提そのものが無くなる。**要件ごと置き換えるのが実態に合う。** REMOVED の `Reason` / `Migration` に、Scenario「見せ方を切り替える」がそのまま移っていること・失われた操作が無いことを明記してある

**`markdown/module` の delta は要らない。** 位置の口は既に本体 specs に在り、この change は利用者として使うだけである（決定1）。

### 決定11: 塗りが使えない環境では、本文と一覧が壊れないことだけを保つ（tasks 2.6・2.7）

`CSS.highlights` が無い環境では色が付かない。**対応の判定は `CSS.highlights` の有無で行い、ブラウザの版番号を直書きしない。**

塗れないときに保つのは次である。

- 本文がそのまま読める（塗りは加算であり、本文の描画に関与しない）
- 脇の一覧にコメントが出ており、そこから編集と削除に入れる
- 選択して注釈を付ける操作は動く（選択の検出と位置の変換は塗りに依存しない）

**代替の塗りを用意しない。** `<mark>` へ倒す道を残すと、整形の面で要素構造を壊す経路が残る（Context 2）。塗れないことは色が出ないことであって、指摘が付けられないことではない。

### 決定12: `test/e2e/approval-annotation.spec.ts` の補助関数は書き換わる（tasks 8.1・8.2 の読み方）

tasks 8.2 は「生テキストの面の振る舞いが変わっていないこと」を求めている。**振る舞いは変わらないが、DOM は変わる。**

いまの `selectRange`（`:27-57`）は `[data-start]` の断片を探して、その中で `Range` を組んでいる。断片分割が消えるので `data-start` は無くなる（決定3）。**補助関数は足場であって振る舞いではない**ので、書き換える。書き換えないのは**確かめている中身**のほうで、選んだ範囲・付いた注釈・本家へ渡る値は同じでなければならない。

`data-testid="approval-annotate-source"` は新しい面へ引き継ぐ。掴み所を変えると、変わっていないことを確かめられなくなる。

**`yarn test:e2e` はこの artifact 作成では実行していない。**

### 決定13: `modules/annotation/` は作らない。注釈の実体は `app/` のまま（2026-09-01 ユーザー判断）

置き場は現状どおり `app/components/review/AnnotateSource.vue` と `app/composables/useAnnotations.ts`。alias `#annotation` も作らない。

- **`modules/` の条件に当たらない。** `app-structure`「画面の階層に属さない機能は `modules/` に置く」は、画面の都合を持つものを `modules/` に置くことを禁じている（MUST NOT）。`useAnnotations` は差し戻しペイロード（`SendBackPayload` / `ApprovalRevisionPayload`）を組む承認・proposal の業務そのもので、`CommentModal` / `CommentCard` と一体である。markdown（描画という汎用機能）とは性格が違う
- **目的は置き場に依らない。** プレビュー面でも付けられる・両面に出る・面2つ・要素を作らない塗り — どれも `app/` のままで満たせる
- **`modules/annotation/` の出どころ** は親 `create-module-markdown` の proposal で、ユーザー指示の印は「並列表示を落とす」にしか付いていなかった

これに伴い、旧 tasks 1章（器を作って移す）と、移設に伴う docs の棚卸し更新（`file-components.md` の `review/` 節、`file-composables.md` の `useAnnotations` 節、`system-structure.md` の `modules/`）は消えた。

## Risks / Trade-offs

| # | リスク | 緩和 |
| --- | --- | --- |
| R1 | **`Range` は DOM が変わると無効になる。** 整形の面は `<MDC>` の解析完了と図の描画完了で中身が入れ替わる。塗った時点の `Range` を持ち続けると、黙って別の場所を塗る | 口を保持しない（`MarkdownView.vue:120`「呼ばれるたびに作る。保持しない」）のに倣い、**塗りも保持せず作り直す**（tasks 2.5）。本文・注釈・DOM の変化を引き金にして `Highlight` を組み直す。作れない範囲は塗らない（`toDomRange` の `null` をそのまま落とす） |
| R2 | `::highlight()` に効かないプロパティ（枠・余白・`box-shadow`）で重なりを表そうとして、行き詰まる | 重なりは**件数から作る 1本の `Highlight` を下線で**出す（決定3）。tasks 2.1 で効くプロパティを実測してから作る |
| R3 | **同一範囲・同色の2件目が本文の上で消える。** 色ごとに1つの `Highlight` にまとめると、同じ範囲は1つの範囲でしかない。`priority` で重なりを解こうとすると必ずここに落ちる | R2 と同じ 1本で塞ぐ（tasks 2.3）。`annotation` spec:207-210「同一範囲に2件」が落ちる形なので、**踏んだら止まる**（tasks 7.10） |
| R4 | 座標から文字位置を引く経路（決定5）がブラウザで割れる。`caretPositionFromPoint` と `caretRangeFromPoint` のどちらが在るかが違う | tasks 5.1 が両方を見ることを明示している。**片方しか見ない実装にしない**。塗れない環境と同じく、引けなければ「一覧へ辿れない」に倒れるだけで、指摘は付けられる（tasks 5.4） |
| R5 | **口が足りないと分かったとき、`modules/markdown/` を直したくなる**（決定1と正面からぶつかる） | 直さず記録する。直しが要るという事実が、この change の成果の一部である。直すなら別 change として起こし、口の利用者を1つ持った状態で判断する |
| R6 | prototype の書き換えた外側のレイアウトを、面の内側と取り違えて触る（決定8） | 触らない印は `PROTOTYPE` のコメントである（`ApprovalAnnotator.vue` の `:30` `:35` `:39` `:306` `:360` `:369` `:384` `:411` `:448`）。**版の食い違いはもう無い** — `usePrototypeFullWidth.ts` / `PrototypeVariantBar.vue` は存在せず、`:31` は `usePrototypePanels` を import している（実測 2026-09-01） |
| R7 | **ストローク側の proposal 確認画面が抜け落ちる**（決定9） | tasks が `app/pages/strokes/[sessionId]/proposal.vue` と `app/composables/useProposalReview.ts` を 6.5〜6.8 で**名指しする**。6章の見出しにも両画面が対象であることを書いた。「移設の時点で気付く」には頼らない |
| R8 | `project/ui` と `stroke/frontier` の delta が無いまま実装に入り、**本体 specs に反する実装が残る**（決定10） | **2本とも作成済みで、`openspec validate --strict` を通っている。** 本体 specs への反映は archive の工程が行う。この change 側でやることは残っていない |
| R9 | 色の実値が CSS へ移ることで、`Annotation.highlightColor` に入っている実値と**二重管理**になる | 保存形は触らない（Context 5）。塗りは色**名**（`HighlightColorName`）で引き、`bg` / `border` の実値は塗りに使わない。ペイロードに残る実値は本家へ渡すためのものと割り切る |
| R10 | `AnnotateSource` を「据置」とした資料（Context 8）と食い違ったまま進む | 上位資料への整合反映として下に出し、ユーザー承認まで着手しない |
| R11 | **`add-full-width-markdown-editor` より先に着手すると、承認画面のプレビューがまだ `MarkdownEditor` で、位置の口が届かない** | 着手順を守る（あちらが先。proposal「他の change との関係」）。先に入っていなければ着手しない |

## 上位資料への整合反映（提案。ユーザー承認まで着手しない）

`docs/agents/issue-tracker.md`「更新対応」に従い、提案として置く。**承認前に書き換えない。**

- **`docs/specs/plan/components-library-replacement.md:36`** — `review/AnnotateSource` の据置判定と、その理由「vueuse `useTextSelection` はリアクティブ追跡で用途が異なり、代替できるライブラリが無い」。部品の役目が変わることで根拠が消える（Context 8）。判定を改めるか、役目の変更によって評価対象から外れたことを追記するかを提案する
- **`docs/specs/core/file-components.md`** — `:59` の `AnnotateSource.vue` の行。props / emit が変わる（`source` を自分で並べなくなる）。行数も **132行**とあるが実測 **140行**。`:60` の `ApprovalAnnotator.vue` も **430行**とあるが実測 **577行**で、面の削減でさらに動く

移設が無くなったので（決定13）、`file-composables.md` の `useAnnotations` 節と `system-structure.md` の `modules/` は本 change の反映対象から外れた。

**ticket の誤記は 2026-09-01 に直した**（「prototype が2版」→ 1版に収束済み、`fence.ts:237-249` → `:237-248`）。

**ADR は起こさない。** 面を2つにする決めは ADR-0017 に既に入っている（「並列表示を落とす（ユーザー指示）」）。塗りの手段（CSS Custom Highlight API）は**外へ出る値を1つも変えない**ので、ADR を要する種類の決めではない（2026-09-01 ユーザー判断で確定）。

## Migration Plan

段階は無い。データの移行も無い。**保存された注釈の形も、本家へ渡る値も変わらない**（Context 5）ので、既に本家に在る注釈に当てる作業は生じない。

ユーザーに見える変化は2つで、どちらも一度に入る。

- 面が3つから2つになる。**失われる操作は無い** — 並べる面でできたことは、どちらの面でもできるようになる
- 整形された本文の面で指摘を付けられるようになり、「切り替えるとコメントを付けられます」の断り書きが消える

ロールバックは `AnnotateSource.vue` と面の組み立て（`ApprovalAnnotator.vue` / `proposal.vue`）を戻すだけで元に戻る。設定もデータも動かさない。`modules/markdown/` には入らない。

## Open Questions

- **色を CSS へ移したとき、`Annotation.highlightColor` の実値をどう扱うか。** 塗りは色名で引く（R9）ので実装は成立するが、ペイロードに実値を残し続けるか、いつか色名だけにするかは決めていない。**保存形の変更なので、この change では触らない**（proposal「対象外」）。`docs/specs/core/file-composables.md` が「検討」として持っている件であり、後から決めても specs も作業の分解も変わらない
- **塗りが使えない環境で、色の代わりに何かを出すか。** 決定11 は「出さない」で成立している（本文が読め、一覧から編集と削除に入れる）。それ以上の手当てが要るかは、実際に踏む環境が現れてから決めてよい
