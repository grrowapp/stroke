# create-module-annotation

## Why

**整形された本文を読みながら指摘を付けられない。** 承認画面も、ストローク側の proposal 確認画面も、面は3つ（整形されたプレビュー / 生テキスト / 両方を並べる）で、**指摘を付けられるのは生テキストが出ている面だけ**である（`app/components/review/ApprovalAnnotator.vue:121` の `annotatable` と `:463-465` の断り書き、`app/pages/strokes/[sessionId]/proposal.vue:169-177`）。読むのはプレビュー、指摘は別の面、という切り分けになっており、気になった箇所へ指摘を付けるたびに面を切り替えることになる。

面を並べる形（`side-by-side` / `左右`）はその回避策として在る。**読む面と指摘する面が別だったことに由来する面**であり、どちらでも付けられるなら要らない。

**なぜ生テキストにしか付けられないのか。** 注釈の塗りが本文を `<mark>` で包む方式だからである（`app/components/review/AnnotateSource.vue`。本家 `react-text-annotate-blend` の写し）。本文を注釈の境界で切って断片に分け、覆っているコメントの数だけ `box-shadow` の下線を積む。生テキストは1つの text ノードなので切れるが、**整形された本文は強調・リンク・見出しが要素になっており、その境界を跨いだ選択を `<mark>` で包むと要素の入れ子が壊れる**。包める場所にしか注釈を置けない、という制約が面の制約になって表に出ている。

**注釈の実体が画面側に散っている。** 塗り（`AnnotateSource.vue` 140行）、状態と差し戻しペイロード（`app/composables/useAnnotations.ts` 206行）、ハイライト5色の定義（同 `highlightColors`。`CommentModal.vue` が composable を逆向きに import している）、面の組み立て（`ApprovalAnnotator.vue` と `proposal.vue` に二重）。**注釈が markdown の描き方を知っている**うえ、同じ注釈の面が2つの画面で別々に組まれている。

**位置の口には利用者が居ない。** 親 `create-module-markdown`（archive 済み）は「描いた本文と生テキストの位置の対応」を `PositionPort` として公開し、整形の面（`MarkdownView`）と生テキストの面（`MarkdownSource`）の双方が同じ形で出すところまでを終えた。だが **`toSourceRange` / `toDomRange` の呼び出しは実コードに1件も無く**（在るのは `test/modules/markdown/` の、モジュール自身の単体だけである）、**`MarkdownSource.vue` に至っては実コードからの import が0件**である。図に生テキストを添える口（`sourceShown` / `SOURCE_SHOWN_KEY`）も同じで、踏んでいるのはモジュール自身の単体だけである。口の形が正しいかどうかは、消費者が現れるまで確かめられない。**この change がその最初の消費者になる。**

急ぐ理由が2つある。

- **未使用の口は、誤ったまま固まる。** 親が archive され、位置の口は本体 specs（`openspec/specs/markdown/module`）に入った。使われないまま次の change が上に積まれると、口の形を直す機会が失われる
- **注釈の面をいま2つの画面が別々に持っている。** 面を触る change（`update-ui-approval-review`・`add-full-width-markdown-editor`）が並んでおり、閉じないまま進めると同じ直しを2箇所へ入れ続けることになる

## What Changes

- **注釈の実体は `app/` に置いたままにする。`modules/annotation/` は作らない**（2026-09-01 ユーザー判断。design 決定13）。`app/composables/useAnnotations.ts` と `app/components/review/AnnotateSource.vue` は動かさない。注釈は差し戻しペイロードと承認・proposal の画面の流れに埋まった業務の部品であり、`app-structure` の「画面の都合を持つものは `modules/` に置かない」側に当たる。目的（プレビュー面でも付けられる・両面に出る・面2つ・要素を作らない塗り）はどれも置き場に依らない
- **塗りを CSS Custom Highlight API に置き換える。** `<mark>` で包む方式をやめ、**本文の要素構造に一切触れずに範囲を塗る**。色ごとに1つの `Highlight` を持ち、重なりは `priority` で解決させる。本文を注釈の境界で切る処理と、重なりの下線を積む処理は消える
- **選択の検出を VueUse の `useTextSelection` に置き換える。** `mouseup` を拾って `window.getSelection()` を一回読む自前実装をやめる
- **生テキストの面を markdown モジュールの `MarkdownSource` に寄せる。** 注釈の面は生テキストを自分で並べるのをやめ、位置の口を受け取って塗るだけになる。**注釈は本文がどう描かれているかを知らなくなる**
- **整形された本文の面でも注釈を付けられるようにする。** どちらの面も同じ `PositionPort` を出すので、注釈の側に面の分岐は入らない
- **付けた注釈は両方の面に出る。** 一方で付けた注釈がもう一方にも出て、一方で消せば両方から消える
- **図として描かれる箇所に注釈が付いたら、整形された本文の面はその図のもとになった生テキストを添える。** 添える範囲（`sourceShown`）は注釈の側が渡す。図は消さず、注釈の付いていない図には添えない
- **本文の色とコメントの一覧を互いに辿れるようにする。** 本文 → 一覧は座標から文字位置を引く（`caretPositionFromPoint` と `caretRangeFromPoint` の両方を見る）。一覧 → 本文は位置の口から範囲を得る（座標を使わない）
- **BREAKING: 面を2つ（整形された本文・生テキスト）に絞り、両方を並べて見せる面を落とす**（ユーザー指示。ADR-0017）。「切り替えるとコメントを付けられます」の断り書きも外す。**失われる操作は無い** — 並べる面でできたことは、どちらの面でもできるようになる

**対象外**

- **注釈の保存形と外へ出る値。** `Annotation`（`startOffset` / `endOffset` / `selectedText` / `highlightColor`）も、差し戻しのペイロード（`SendBackPayload` / `ApprovalRevisionPayload`）も変えない。本家が読む形であり、この change は塗り方と付けられる面を変えるだけである
- **オフセットの基準。** 「本家から取得した文書の中身そのもの」で確定済み（`adr0017-sub-fix-normalization-offset`。archive 済み）。食い違いを吸収するのは面の内側であり、注釈の側は取得したままの文字列を渡す
- **全体へのコメント（箇所に紐づかない指摘）と、差し戻しの送信経路。** 位置を持たないので面の話に関わらない
- **承認・却下の置き場と押し間違いの手当て。** `update-ui-approval-review` が持つ
- **編集面の全幅トグル。** `add-full-width-markdown-editor` が持つ
- **develop に入っている prototype（指摘の一覧を左右へしまう）の本実装化。** あれは `add-full-width-markdown-editor` の `ui.md` を決めるための使い捨てで、この change は畳むか避けるかを決めるだけである（design 決定8）
- **markdown の解釈・描画・見た目。** `modules/markdown/` には入らない。承認画面のプレビューは `add-full-width-markdown-editor` で `MarkdownView` 直置きになるので、口はそのまま届く
- **色の実値をデータから外すこと。** `Annotation.highlightColor` を色名だけにする案（`docs/specs/core/file-composables.md`）は保存形の変更にあたるので持ち込まない。塗りの実値が CSS へ移るのは、`::highlight()` が inline style を受け取れないことによる帰結にとどめる

## Capabilities

### New Capabilities

- `annotation`: 文書へ指摘を付ける働き。位置の持ち方（生テキストの位置1本）、本文の色と脇のコメント一覧の分担、どの面でも付けられること、面が2つであること、どちらの面にも出ること、要素をまたぐ選択・フェンスの内側・図の中の一語・重なった注釈の扱い、そして markdown の描き方を知らないこと

### Modified Capabilities

- `project/ui`: 要件「承認対象の文書に箇所を指した指摘を付けられる」が**面を3つと定め、指摘を付けられるのは素の本文の側だけと定めている**（`spec.md:166`、Scenario「承認画面を開いた直後」）。面が2つになり、どちらの面でも付けられるようになるので、ここは書き換わる
- `stroke/frontier`: 要件「proposal の見せ方」が同じく**3つの面と「指摘を付けられるのは素の本文の側」を定めている**（`spec.md:280`、Scenario「プレビューでは指摘を付けない」）。ストローク側の proposal 確認画面（`app/pages/strokes/[sessionId]/proposal.vue`）も注釈の面を持ち、`useAnnotations` と `AnnotateSource` を共有しているため、同じ書き換えが要る

**この2件の delta は `specs/project/ui/spec.md` と `specs/stroke/frontier/spec.md` に書いてある。** どちらも作成済みで、`openspec validate --strict` を通っている。**新しく作らないこと** — 作ると二重になる。

手法は2本で割れており、理由は要件名が変わるかどうかである（design 決定10）。`project/ui` は要件名が通るので **MODIFIED**、`stroke/frontier` は要件名が「見せ方を切り替えられる」から「見せ方は2つで、どちらでも指摘を付けられる」へ変わるので **REMOVED + ADDED** にした。

## Impact

**コード（新規）**

- `app/assets/css/main.css` — 5色の `::highlight(<名前>)` 規則。`::highlight()` は inline style を受け取れないので、塗りの実値はここに置く

**コード（組み替える）**

- `app/composables/useAnnotations.ts` — 動かさない。状態と差し戻しペイロードはこのまま
- `app/components/review/AnnotateSource.vue` — 生テキストを自分で並べる役目を失い、位置の口を受け取って塗る形になる。断片分割と下線積みは消える。置き場は変えない
- `app/components/review/ApprovalAnnotator.vue` — 面を2つにし、どちらにも注釈の面を載せる。`ViewMode`（`:106`）と `MODES`（`:108-112`）から `side-by-side` が消え、`annotatable`（`:121`）の分岐と `:463-465` の断り書きも消える。`PROTOTYPE` のコメントが付いた外側のレイアウトには手を入れない（design 決定8）
- `app/pages/strokes/[sessionId]/proposal.vue` — **同じ書き換えが要る。** ここも3つの面を持ち（`:72-76`）、`ReviewAnnotateSource` を2箇所（`:170` と `:181`）で使っている
- `app/composables/useProposalReview.ts` — `ViewMode`（`:16`）の取りうる値が変わる
- `app/pages/projects/[projectId]/approvals/[approvalId].vue` — **承認画面のプレビューの中身を置いているのはここである**（`#preview` slot）。`add-full-width-markdown-editor` が編集を外して `MarkdownView` 直置きにするので、その `ref` から位置の口を受ける
- `modules/markdown/` — **変更しない。** この change は口の利用者であり、口の提供者ではない。直す必要が出たら、それは口の設計が誤っていた合図である（design 決定1）

**テスト**

- `test/e2e/approval-annotation.spec.ts` — 生テキストの面の振る舞いは変えないが、**面の DOM が変わるので選択を作る補助関数（`selectRange`。`:27-57`）は書き換わる**（`data-start` の断片が無くなるため）。`approval-mode-side-by-side` を `:85` と `:111` で踏んでいる。整形された本文からの往復（散文・コードブロックの内側・図の3種）を足す
- `test/e2e/upstream-style.spec.ts` — `approval-mode-side-by-side` を踏んでいる（`:286`）。2つの面に合わせる
- `test/app/components/review/` と `test/app/composables/` の単体テスト（新規。写し元の構造に従う）— `annotation` spec の Scenario（同じ語の重複・要素をまたぐ選択・本文が動かないこと・フェンスの内側・言語指定の無いフェンス・フェンスをまたぐ選択・図の中の一語・図に添えても本文が動かないこと・図の注釈の差し戻し・重なりの3種）、範囲の妥当性の述語、位置の口が `null` を返したときの倒れ方、差し戻しペイロードの形（tasks 7章）
- `yarn test:e2e` はこの change の artifact 作成時には実行していない

**依存**

追加なし。`@vueuse/core` は導入済み（`^14.4.0`）。CSS Custom Highlight API はブラウザの機能で、ライブラリを足さない。

**資料（上位資料への整合反映。design で提案し、ユーザー承認まで着手しない）**

- `docs/specs/plan/components-library-replacement.md:36` — `review/AnnotateSource` を**据置**とし、理由を「vueuse `useTextSelection` はリアクティブ追跡で用途が異なり、代替できるライブラリが無い」としている。この change は据置を覆す
- `docs/specs/core/file-components.md` — `:59` の `AnnotateSource.vue` の行（props / emit が変わる。行数も 132 とあるが実測 140）、`:60` の `ApprovalAnnotator.vue` の行数（430 とあるが実測 577）

**他の change との関係**

- 前提: `create-module-markdown`（archive 済み）。位置の口が無いと整形の面に注釈を載せられない
- 前提: `adr0017-sub-fix-normalization-offset`（archive 済み）。2つの面の座標系が揃っていないと、面をまたいだ注釈が別の場所を指す
- 前提: `add-full-width-markdown-editor`。承認画面から編集を外し、プレビューを `MarkdownView` 直置きにする。これが先に入れば `MarkdownEditor` を触らずに口が届く。同じ `ApprovalAnnotator.vue` の外側（コメント欄の開閉と幅）もあちらが持つ
- 並走: `update-ui-approval-review`（0/26）。同じ `ApprovalAnnotator.vue` を触る。あちらは差し戻しボタンの置き場と却下の追加で、面の数には触らない
- 並走: `add-full-width-markdown-editor`。その prototype が `ApprovalAnnotator.vue` の外側のレイアウトを書き換えている（design 決定8）。**この change は外側に手を入れず、prototype を畳まない** — 畳むとあちらが `ui.md` を書くための材料を失う
- ADR-0017「委譲の内訳」の `create-module-annotation`。完了判定はあちらが定める

## 私が取った決め（未承認の仮定）

このセッションではユーザーへの grilling を行っていない（`/AskUserQuestion` を使う相手が居ない、artifact の補作である）。**次の決めは私が取ったもので、ユーザーの承認を得ていない。** 差し戻す場合はこの表の行を指すこと。

| 件 | 決め | 理由 |
| --- | --- | --- |
| 面を2つにする対象 | **ポータルの承認画面と、ストローク側の proposal 確認画面の両方** | 2つの画面が同じ実体（`useAnnotations` / `AnnotateSource`）を共有している。片方だけ2面にすると、同じ実体が面の数で分岐する |
| `project/ui` と `stroke/frontier` の扱い | **delta を2本作った。`project/ui` は MODIFIED、`stroke/frontier` は REMOVED + ADDED** | どちらも「指摘を付けられるのは素の本文の側だけ」を定めており、この change と正面から食い違う。足さずに進めると、本体 specs に反する実装が入る。手法が割れるのは要件名が変わるかどうかによる（design 決定10）|
| 保存形を触らない | **`Annotation` と差し戻しペイロードは1バイトも変えない** | 本家へ出て行く契約である。塗り方を変えるのに保存形を巻き込む理由が無い |
| 色の実値の行き先 | **CSS へ移すが、データからは外さない** | `::highlight()` は inline style を受け取れないので、塗りの実値は CSS に置くほかない。一方 `Annotation.highlightColor` は本家へ渡る値なので、そこから色を抜くのは保存形の変更にあたる |
| `MarkdownView` / `MarkdownSource` を触らない | **口の利用者に徹する** | 触る必要が出たら、それは親が公開した口の設計が誤っていた合図である。黙って直すと、口の検証という**この change の副次的な価値**が失われる |

**`MarkdownEditor` に位置の口が無い件は消えた。** 承認画面は編集できない（本家どおり。ユーザー決定 2026-09-01）ので、プレビューは `MarkdownView` 直置きになり、口は最初から出ている。決定1 に例外は無い。
