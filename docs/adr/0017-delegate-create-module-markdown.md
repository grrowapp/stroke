# ADR-0017: create-module-markdown から切り出した change の委譲理由

- **状態**: 採用
- **日付**: 2026-08-29

## 決定

`create-module-markdown` の範囲を **markdown を1つのモジュールに閉じ、外から見える口を絞ること**に限り、そこに収まらないものを5本の change へ委譲する。

**委譲した5本は独立した change として扱う。** 親の範囲を割ったものではなく別の関心事なので、親の archive 条件に含まれず、着手の順も親に縛られない。したがって change-id に親の子であることを示す接頭辞を持たせない（2026-08-31 にユーザーの決定で `adr0017-sub-` を外した。改名前の名前は本 ADR の履歴と archive 済み change の記述に残る）。

| change | 委譲前の名前 |
| --- | --- |
| `create-module-annotation` | `adr0017-sub-create-module-annotation` |
| `add-full-width-markdown-editor` | `adr0017-sub-full-width-markdown-editor` |
| `update-ui-approval-review` | `adr0017-sub-update-ui-approval-review` |
| `separate-approval-decision-from-promotion` | `adr0017-sub-separate-approval-decision-from-promotion` |
| `update-docs-structure` | `adr0017-sub-update-docs-structure` |

**この5本が `create-module-markdown` から委譲されたという経緯は、本 ADR が唯一の記録である。** change-id からその手がかりが消えたので、由来を辿るときはここを見ること。

あわせて、**親の範囲に残った作業そのものを4本へ分割する**。委譲（別の関心事へ渡す）ではなく分割（親の範囲を割る）なので、親は4本が全部終わるまで archive しない。

- `adr0017-sub-create-position-port-preview` — **完了**（archive 済み）
- `adr0017-sub-add-detection-assumptions` — **完了**（archive 済み）
- `adr0017-sub-fix-normalization-offset` — **完了**（archive 済み）
- `adr0017-sub-create-reference-mdc` — **完了**（archive 済み）

**分割した4本はすべて完了した。** 親 `create-module-markdown` の archive を止めるものは、親自身に残る最終検証（tasks 6.9）だけである。

## 背景

markdown を扱う実体が `nuxt.config.ts`（parse 設定）・`app/components/global/`（フェンスの振り分け）・`app/components/workspace/`（コードブロック・図・本文の器・直す面）・`app/assets/css/main.css`（見た目）に散っており、描画の入口も3箇所に割れていた。どこに閉じるのかを定めた spec が無く、次に markdown へ触る作業がどこを触ればよいのか参照元を辿らないと分からない。この状態を解くために Nuxt 4 標準の `modules/` を置き場として用意し、markdown の操作をそこへ切り出した。

作業を進める過程で、3種類の「この change では扱えないもの」が現れた。

1つは**別の関心事**である。注釈は markdown と同じ画面に載るが、扱う対象も口も違う。

もう1つは**ユーザーが実物を触って挙げた指摘**である。markdown の切り出しとは独立した画面の改善で、この change の delta に混ぜると何を直したのかが読めなくなる。承認まわりの画面を直すと押し間違いの危険が増えるため、承認の判断と昇格を切り離す件もここから派生した。

最後の1つは**実装の結果として生じた資料の食い違い**である。切り出したこと自体が原因なので、切り出しの完了を待ってから直す。

## 委譲の内訳

委譲先を **拡張 / 資料化** に分ける。分類は本 ADR で定める。4件とも ticket に frontmatter を持たないため、ticket の tags には依存しない。

- **拡張** — 利用者にとってできること、または選べる幅が変わるもの
- **資料化** — 振る舞いを変えず、実装を文書へ写すもの

各節の見出しは change 名。`種別` は上の分類、`状態` は着手状況、`成果物` は change ディレクトリの現況。

### 拡張

利用者にとってできること、または選べる幅が変わるもの（4件）。

#### create-module-annotation

- **種別**: 拡張
- **状態**: 未着手（tasks 0/23）
- **成果物**: specs + tasks（**0/23**。proposal・design 未作成）
- **触るファイル**: `modules/annotation/`（新規）、注釈の面を持つ画面

**対応内容** — 注釈を `modules/annotation/` に閉じ、markdown の描き方を知らずに済むようにする。整形された本文の面でも注釈を付けられるようにし、どちらの面で付けた注釈も両方の面に出るようにする。面を2つ（整形された本文・生テキスト）に絞る。

注釈は本家（`react-text-annotate-blend`）の写しで、生テキストの面にしか付けられない。整形された本文を読みながら指摘したい場でも、指摘のためだけに面を切り替えることになる。

**並列表示を落とす**（ユーザー指示）。読む面と指摘する面が別だったことに由来する面であり、どちらでも付けられるなら並べる理由が無い。

**完了判定** — 次をすべて満たしたとき完了とする。

- 注釈の実体が `modules/annotation/` に閉じ、markdown の描き方に依存しない
- 整形された本文の面で注釈を付けられる
- どちらの面で付けた注釈も、両方の面に出る
- 面が2つに絞られ、並列表示が無くなっている

**親との関係** — 後続。親 change は markdown を扱う実体をモジュールに閉じ、「描いた本文と生テキストの位置の対応」を口として公開するところまでを持つ。この change はその口の利用者として注釈の側を扱う。したがって親の口が確定してから着手する。

#### add-full-width-markdown-editor

- **種別**: 拡張
- **状態**: 未着手（成果物が proposal のみ）
- **成果物**: proposal のみ（design・specs・tasks 未作成）
- **触るファイル**: 共通の編集 UI（`modules/markdown/runtime/edit/MarkdownEditor.vue`。親 change が `app/components/workspace/DocumentEditor.vue` から移設済み）と、それを載せる仕様書・承認・ステアリングの3画面

**対応内容** — マークダウン編集画面に全幅トグルを付ける。仕様書・承認・ステアリングの3画面で共通の編集 UI にトグルを置き、ON でサイドバーを隠して広く編集、OFF で元のレイアウトに戻す。

**「全幅」は雰囲気であって、厳密な寸法の要件ではない。** 左右に一定の余白が無いと読み書きしづらくなるので、左右の隙間はある程度あってよい（ユーザーの判断）。ビューポート幅ぴったりに寄せることを目的にしない。

**ただし固定幅の指定はしない（MUST NOT）。** 余白を作るために編集領域へ固定の幅（`max-width` や px 指定の桁幅）を与えてはならない。幅はビューポートに追従して伸び縮みし、余白は相対的な padding として残す。「読みやすい行長に収める」ことを理由に固定幅へ寄せる案は却下する。

境界は proposal で切られている。**ヘッダーは隠さない。** ストローク側の proposal 確認画面（注釈 UI）は対象外。

**完了判定** — 次をすべて満たしたとき完了とする。

- 編集 UI にトグルがあり、ON でサイドバーが隠れて編集領域が広がる（左右の余白は残ってよいが、固定幅は与えない）
- 編集領域の幅がビューポートに追従する。ウィンドウを広げれば編集領域も広がる
- OFF で元のレイアウトに戻る
- ヘッダーは常に見えている
- 適用先は仕様書・承認・ステアリングの3画面。注釈 UI には出ない

**親との関係** — 後続。markdown を扱う実体をモジュールに閉じた後、その編集面の見せ方を変える。着手前に `replace-handrolled-with-libraries`（archive 済み）が同じ編集 UI を部分置換していることを確認すること。競合するのは同一コンポーネントの内部だけで、外から見た振る舞いは独立している。

#### update-ui-approval-review

- **種別**: 拡張
- **状態**: 未着手（tasks 0/26）
- **成果物**: proposal + design + specs + tasks（**0/26**）
- **触るファイル**:
  - `app/components/review/ApprovalAnnotator.vue` — 差し戻しボタンを右サイドバー最下部から面の切替の並びへ。却下を追加
  - `app/components/workspace/ApprovalCard.vue` — 却下の理由をカード下の欄からモーダルへ。「却下」→「即時却下」
  - `app/components/review/CommentModal.vue` — 全体コメントのモーダル。却下の理由入力が同じ形を採るので、共通化するか写すかを design で決める
  - `app/pages/projects/[projectId]/approvals/index.vue` — 「レビューする」をその場で開く形に
  - `app/pages/projects/[projectId]/approvals/[approvalId].vue` — 承認依頼の URL は残す（`document-editing` が「編集は文書の URL の上で行う」と定めており、承認依頼の URL もその実体を指す）
  - サーバーは変更なし。`POST /api/projects/:projectId/approvals/:id/:action` の呼び方も送る中身も変わらない

**対応内容** — ユーザーが実物を触って挙げた5点を直す。

1. 差し戻しボタンを面の切替と同じ並びへ移す。現状は面の切替が本文の上、差し戻しが右サイドバーの最下部にあり離れている
2. 承認一覧の「レビューする」を、別画面へ遷移せずその場で開く。**5点のうち一番重い**
3. 「却下」を「即時却下」に改める。差し戻しとの違い（やり直しを求めるのか、その場で終わらせるのか）が名前から読めるようにする
4. レビュー画面に却下を置く。現状この画面にあるのは差し戻しだけで、承認・却下は承認一覧のカードにしかない
5. 却下の理由入力をモーダルにする。カードの下に開く欄をやめ、レビュー画面の「全体へのコメント」と同じ形にする

5 について、いまの分かりづらさの実体は「理由が入ると上の却下ボタンが送信になる」という設計ではないことにある。上の「却下」は入力欄の開閉を反転するだけで、送信は下の「却下する」が行う。成功すると欄が閉じて一覧を取り直すため、**成功したときのフィードバックが無い**。

**機能そのものは変えない。** 承認・却下・差し戻しが何をするか、本家へ何を送るかは今のままである。変えるのは置き場・名前・開き方・入力の取り方だけで、利用者にとってできることは増えも減りもしない。

**完了判定** — 次をすべて満たしたとき完了とする。

- 差し戻しが面の切替と同じ並びにある
- 承認一覧の「レビューする」が画面遷移なしにその場で開く
- レビュー画面に「即時却下」があり、押すとモーダルで理由を入力して 却下する／やめる のどちらかを選べる
- 却下が成功したことが画面から分かる
- 承認・却下・差し戻しがサーバーへ送る中身が変わっていない

**親との関係** — 後続。markdown の切り出しとは独立した画面の改善であり、親の delta に混ぜると何を直したのかが読めなくなるため分けた。

#### separate-approval-decision-from-promotion

- **種別**: 拡張
- **状態**: 未着手（成果物が `.openspec.yaml` のみ）
- **成果物**: `.openspec.yaml` のみ（proposal 以降すべて未作成）
- **触るファイル**: `POST /api/strokes/:id/approve` の実装と、その後始末を抱える範囲

**対応内容** — 承認の判断と、その結果として起きること（昇格・steering の起動）を切り離す。判断・昇格・起動を別々に扱えるようにし、押し間違いを取り消せる余地と、失敗した段だけをやり直せる形を作る。

いま `POST /api/strokes/:id/approve` が1回の呼び出しで3つを行っている。

1. 承認の判断を確定する（`phase: 'approved'`）
2. プロジェクトへ昇格させる（セッションディレクトリの改名）
3. steering のエージェントを起動する

`CONTEXT.md` は「承認はプロジェクト生成の唯一の引き金」と定める。**引き金であること自体は変えない。引き金であることと、同じ操作の中で全部を走らせることは別である。**

いまの形には次が付いてくる。

- **判断を取り下げる道が系に無い。** 承認は1押しで確定し、その瞬間に改名とエージェントの起動まで進む。戻す手段は「プロジェクトごと消す」しかなく、それはストロークの往復の記録ごと消すことになる（`docs/specs/api/contract.md:184` が U11 は `approved` を受理しないと規定）
- **失敗の戻し方が endpoint の中に埋まっている。** 改名が失敗したら `phase` を書き戻す、steering のキックが届かなければ `invocation` を `failed` に倒す、という後始末を1つの関数が抱えている。どの段で失敗したかによって戻す先が変わる
- **昇格した後にしか steering を起こせない。** 起動が失敗しても昇格は残るので、`failed` を拾って起こし直す巡回が要る

**完了判定** — 次をすべて満たしたとき完了とする。

- 承認の判断・昇格・steering の起動が別々に扱える
- 承認を確定した後、昇格の前に取り消せる余地がある
- 失敗した段だけをやり直せ、後始末が段ごとに分かれている
- 承認がプロジェクト生成の唯一の引き金であることは変わっていない

**親との関係** — 後続。markdown の切り出しとは独立した、承認まわりの構造の整理である。

**当初「`update-ui-approval-review` が承認と即時却下を並べるので危険が増える。両者の順序を決めてから着手する」と書いていたが、これは誤りだった**（2026-09-01 に実測で判明）。**2つは別の承認である。**

- この change が触る `POST /api/strokes/:id/approve` を叩くのは**ストローク側の proposal 確認画面**（`app/pages/strokes/[sessionId]/proposal.vue`）。**既に確認モーダルが挟まっており1押しでは確定しない**。隣に並ぶのは差し戻しだけ
- `update-ui-approval-review` が触るのは**本家 spec-workflow の承認依頼画面**（`app/components/workspace/ApprovalCard.vue` ほか）。送り先は `POST /api/projects/:projectId/approvals/:id/:action` で別物

**順序の依存は無く、どちらを先に通してもよい。** 取り消しが要る理由は押し間違いではなく、判断を取り下げる道が系に無いことである。完了判定4項目は変わらない。

### 資料化

振る舞いを変えず、実装を文書へ写すもの（1件）。

#### update-docs-structure

- **種別**: 資料化
- **状態**: 未着手（tasks 0/26）
- **成果物**: proposal + design + specs + tasks（**0/26**）
- **触るファイル**:
  - `docs/specs/core/system-structure.md` — ディレクトリ構造に `modules/` を追加。`app/components/` の切り方の規範を `app-structure` と揃える
  - `docs/specs/core/file-components.md` — `MarkdownPre` / `CodeBlock` / `MermaidDiagram` / `DocumentView` / `DocumentEditor` の行を落とす
  - `docs/specs/core/file-composables.md` — 移設分を落とす
  - `docs/specs/plan/structure-migration.md` — `MarkdownPre` の例外の行を解消済みに

**対応内容** — 親 change の実装で生じた、構造の資料と実態の食い違いを直す。

- `system-structure.md` のディレクトリ構造に `modules/` を加える。画面の階層に属さない自己完結の機能の置き場として定義する
- `file-components.md` / `file-composables.md` の棚卸しから、モジュールへ移した分を落とす
- `structure-migration.md` の「`global/MarkdownPre.vue` は規範の区切りに従えない唯一の例外」を解消済みとして更新する。Nuxt module の `addComponent({ global: true })` が同じ登録を行うため、置き場の制約は無くなった
- `test/` の置き場を実態に合わせる件は **`adr0017-sub-create-reference-mdc` が引き取った**。同じ移設が2つの change に載っていたため、資料化の側へ寄せた
- **構造の規範が2つある状態を解く。** `openspec/specs/app-structure` は「`app/components/` と `app/composables/` の配下は階層ディレクトリ（`workspace/` / `shared/`）で分ける」と定め、`docs/specs/core/system-structure.md` は「`ui/` ＋機能単位で切る」と定める。どちらが正かを決め、もう一方をそれに従わせるか役割を分ける。親 change では前者に delta を当てたが、後者は手つかずである

**振る舞いは変えない。** `test/` の移設を切り出した結果、この change が触るのは資料だけになった。

## 分割の内訳

上の5件は**別の関心事へ委譲**したものである。これとは別に、親 change 自身の残作業を**分割**した4件がある。委譲先ではなく親の範囲そのものなので、親は子が全部終わるまで archive しない。

分割の区分は次の3つ。`資料化` は委譲の内訳と同じ定義を使う。

- **口** — モジュールが外へ公開する口が増えるもの
- **検知** — 振る舞いを変えず、踏んだら止まる状態を作るもの
- **不具合** — 黙って壊れる経路を塞ぎ、振る舞いが直るもの

### 口

#### adr0017-sub-create-position-port-preview

- **種別**: 口
- **状態**: 未着手
- **成果物**: 未作成
- **触るファイル**: `modules/markdown/runtime/render/MarkdownView.vue`、`modules/markdown/runtime/position/types.ts`、`test/modules/markdown/runtime/render/`（新規）
- **引き取る tasks**: 5.1

**対応内容** — 整形された本文の面から位置の口を出す。`specs/markdown/module` の「描いた本文と生テキストの位置の対応を公開する」が「外から引ける形で公開しなければならない（SHALL）」と定めているが、`MarkdownView` は口を出しておらず、`createPreviewPositionPort` の呼び出し元は単体テストのみである（実測）。生テキストの面（`MarkdownSource.vue:77`）は既に `defineExpose({ … } satisfies PositionPort)` で出しており、整形された本文の面だけが揃っていない。

5.1 は記帳漏れである。`keepPosition` は `MarkdownView.vue:118` の `parser-options` から既に渡っている。

**解析の段には触れない。** `<MDC>` のスロットだけを差し替えている形から外れると、クライアントの再解析で shiki の色が SSR とずれ、アプリ全体のアイコンが消える（実測）。この単位で足すのは器の `ref` と `defineExpose` だけである。

**完了判定** — 次をすべて満たしたとき完了とする。

- `MarkdownView` が `PositionPort` を `defineExpose` で出し、器の要素そのものは外へ出さない
- 本文が空のとき、口が `null` を返す
- 口が消えたら落ちるテストが在る
- 口が受け取る生テキストは「正規化後（CRLF → LF、front matter 除去後）」であることが明記されている
- 5.1 が閉じている

**親との関係** — 分割。親の Wave 0 であり、他の3件と `adr0017-sub-create-module-annotation` の前提になる。`design.md` が「`annotation-module` の着手前に対応が必要になる」と記していたのはこの穴である。

### 検知

#### adr0017-sub-add-detection-assumptions

- **種別**: 検知
- **状態**: 未着手
- **成果物**: 未作成
- **触るファイル**: `test/modules/markdown/runtime/position/*.test.ts`、`test/e2e/markdown-hydration.spec.ts`、`modules/markdown/runtime/position/types.ts` / `preview.ts` / `fence.ts`、`modules/markdown/runtime/render/MarkdownView.vue`（コメント）、`modules/markdown/index.ts`（コメント）
- **引き取る tasks**: 6.1・6.2・6.3・6.4・6.5・6.6.2・6.9・6.10・6.14

**対応内容** — 実装で崩れた前提7件を、踏んだら止まる状態にする。うち3件は**黙って壊れる**（症状が出ないまま誤った位置を返す、別の場所が壊れる）。資料に書くだけでは、読まなかった人が同じ穴に落ちる。

6.10 は検知力の測定で見つかった穴である。テストはフェンスの幾何と text ノードの位置をよく固めているが、**AST の構造を何も固めていない**。出力が実際に変わったのに143本すべてが通過した変異が3件あった。

6.14.2 は当環境でアイコン消失そのものが再現しない（`@nuxt/icon` のカスタムコレクションが 404）。再現環境の用意も完了条件に含める。

**完了判定** — 次をすべて満たしたとき完了とする。

- 黙って壊れる3件（6.1 / 6.2 / 6.3）それぞれに、踏んだら赤くなるテストが在る
- 6.2.3 の3点が型で塞がっている
- 6.10 の3件を実際に変異させて落ちることを確かめている
- 6.14.2 について、再現環境を用意したか、再現しない前提で検知の設計を見直した結果が記録されている
- 追加したテストを壊して落ちることを一件ずつ確かめている

**親との関係** — 分割。`adr0017-sub-create-position-port-preview` の後続。6.1.1 と 6.4.2 が `MarkdownView` の形を固定するため、口が出そろってから書く。

### 不具合

#### adr0017-sub-fix-normalization-offset

- **種別**: 不具合
- **状態**: 未着手
- **成果物**: 未作成
- **触るファイル**: `app/pages/projects/[projectId]/approvals/[approvalId].vue`、`app/composables/useAnnotations.ts`、`modules/markdown/runtime/render/`、`test/e2e/fixtures/upstream-stub.mjs`、`test/e2e/approval-annotation.spec.ts`
- **引き取る tasks**: 6.11

**対応内容** — 本番の呼び出し側が、正規化していない生文字列を渡している。`approvals/[approvalId].vue:60` の `source` が `MarkdownView` にも注釈の基準にもそのまま渡っており、CRLF を含む文書が来ると、いま在る注釈機能が黙ってずれる。生ファイルを渡すと `null` には倒れず、**黙って別の場所を返す**（実測）。本家は `readFile` / `writeFile` で素通しするため、CRLF も front matter も含まれうる（実測）。

**決めが2件ある。** 注釈のオフセットは本家へ送られて保存される。正規化した座標で保存すると、ディスク上の生ファイルとずれた値が残る。

- 注釈のオフセットをどの座標で保存するか（生ファイル / 正規化後）。本家に保存された注釈を誰が読むかを調べてから決める
- 正規化をどこで行うか（モジュールの内側 / 呼ぶ側）。「呼ぶ側が忘れずにやる」は、いま潰そうとしている黙って壊れる形そのものである

**完了判定** — 次をすべて満たしたとき完了とする。

- 保存座標が決まり、本家に保存された注釈を誰が読むかを調べた結果が根拠として残っている
- 正規化を行う場所が決まり、「呼ぶ側が忘れずにやる」形になっていない
- 生ファイルの座標で保存すると決めた場合、正規化後 ↔ 生ファイル の対応が在る
- CRLF と front matter を含む文書で注釈が正しい位置に付くことを E2E で確かめている
- `test/e2e/fixtures/upstream-stub.mjs` が CRLF と front matter の2件を返す

**親との関係** — 分割。`adr0017-sub-create-position-port-preview` の後続。口の形が固まってから、口が受け取る座標の基準を決める。

### 資料化

#### adr0017-sub-create-reference-mdc

- **種別**: 資料化
- **状態**: 未着手
- **成果物**: 未作成
- **触るファイル**: `docs/specs/reference/mdc-observations.md`（新規）、`CLAUDE.md` の Docs 節、`docs/specs/reference/stroke-modules.md`、`test/app/components/workspace/markdown-*.test.ts`
- **引き取る tasks**: 6.8・3.7

**対応内容** — change が archive されても消えない記録を残す。`docs/specs/reference/mdc-observations.md` を `upstream-observations.md` と同じ「調べて分かった事実」の枠で新設する。決定ではないので ADR にしない。

7件それぞれについて、どのテストが固定しているかを書く。踏んだときに落ちる先を示すためである。

3.7（`test/app/components/workspace/markdown-roundtrip.test.ts` と `markdown-sanitize.test.ts` の移設）をここが引き取る。**`adr0017-sub-update-docs-structure` の「触るファイル」から `test/app/components/workspace/markdown-*.test.ts` の行を落とすこと。** 同じ移設が2つの change に載る。`markdown-fence-position.test.ts` も同じ移設の対象である（3.7 に項目が無いが、モジュールのコードを見ているのに `app/` の下に居る）。

**完了判定** — 次をすべて満たしたとき完了とする。

- `docs/specs/reference/mdc-observations.md` が在り、崩れた前提7件が事実として書かれている
- 7件それぞれについて、どのテストが固定しているかが書かれている
- `CLAUDE.md` の Docs 節と `stroke-modules.md` から辿れる
- `test/` の markdown 系3本が、写し元と同じ構造の位置に居る
- 移設は移動のみで、テストの中身と結果が変わっていない

**親との関係** — 分割。`adr0017-sub-create-position-port-preview` の後続。6.8.2（どのテストが固定しているか）は `adr0017-sub-add-detection-assumptions` が加える検知の名前を突き合わせる必要があるため、その完了後に一度だけ確認する。

## 触らないと決めた契約

分解の作業台（ralph の epic）に、**どの change でも変えないと決めた契約**が2つ書かれていた。作業台は役目を終えて消したが、この2つは change の artifact にも specs にも書かれていないのでここへ移す。

| 契約 | 定義元 | 使う側 |
| --- | --- | --- |
| `SOURCE_START_ATTR` / `SOURCE_END_ATTR`（`data-src-start` / `data-src-end`） | `modules/markdown/runtime/position/source-span.ts` | 検知のテスト |
| `SOURCE_SHOWN_KEY`（provide/inject で「ソースを見せたい範囲」を降ろす） | `modules/markdown/runtime/render/source-shown.ts` | `create-module-annotation` |

**どちらも既定として扱い、この一連の change では変えない。** コードに実体はあるが「触ってはいけない契約」という位置づけがどこにも書かれておらず、名前を変えても `pre-mark.test.ts` は検知しない（属性名を実装と同じ定数で参照しているため。tasks 6.9.1 の変異で実測）。捕まるのは `preview.test.ts` と `markdown-view-position.test.ts` の計6本である。

`SOURCE_SHOWN_KEY` の**唯一の使い手は `create-module-annotation`** であり、まだ着手されていない。あの change が最初の外部利用者になる。

## 経緯の記録

`adr0017-sub-update-docs-structure` は**ユーザーが指示したものではない**。「markdown の今回実装に関する修正の change を作って」と言われた際に、エージェントが資料の食い違いを勝手に入れて立てた。その直後に「俺が言うからいれろ」と指示があり5件が口述されたが、エージェントはそれを別の器（`adr0017-sub-update-ui-approval-review`）へ入れたため、この change にはエージェントの作文が残っている。

## 根拠

- 注釈は markdown の口の利用者であり、扱う対象も口も違う。同じ change に置くと、モジュールの境界がどこにあるのかが読めなくなる
- 画面の指摘は markdown の切り出しと独立しており、混ぜると delta が何を直したのか読めなくなる
- 資料の食い違いは切り出しの結果として生じたものなので、切り出しの完了を待ってから直す

## 影響

- 委譲先はいずれも個別に ticket を持つ。親 ticket への集約はしない
- change ではなく資料へ入れたものが2件ある。change の命名規約（先頭に動詞、create / add / update / fix / remove、判定の軸）は `docs/agents/issue-tracker.md` と `docs/adr/0014-change-name-starts-with-verb.md` へ、用語（product / module / 機能）は `CONTEXT.md` へ置いた
- 4件とも ticket に frontmatter（status / tags）が無い。他の ticket は大半が持っており、揃えるかどうかは別途の判断。本 ADR の `種別` はこの frontmatter に依存しない
- 親 `create-module-markdown` は分割した4件が全部終わってから archive する。親の残タスクは4件が引き取ったので、親自身に開いた作業は無い
- 分割した4件の ticket は `status` / `change` / `tags` の frontmatter を持つ（`docs/agents/issue-tracker.md` の規定どおり）。委譲した5件と揃っていない
