# ADR-0017: create-module-markdown から切り出した change の委譲理由

- **状態**: 採用
- **日付**: 2026-08-29

## 決定

`create-module-markdown` の範囲を **markdown を1つのモジュールに閉じ、外から見える口を絞ること**に限り、そこに収まらないものを5本の change へ委譲する。

- `adr0017-sub-create-module-annotation`
- `adr0017-sub-full-width-markdown-editor`
- `adr0017-sub-update-ui-approval-review`
- `adr0017-sub-separate-approval-decision-from-promotion`
- `adr0017-sub-update-docs-structure`

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

#### adr0017-sub-create-module-annotation

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

#### adr0017-sub-full-width-markdown-editor

- **種別**: 拡張
- **状態**: 未着手（成果物が proposal のみ）
- **成果物**: proposal のみ（design・specs・tasks 未作成）
- **触るファイル**: 共通の編集 UI（`DocumentEditor`）と、それを載せる仕様書・承認・ステアリングの3画面

**対応内容** — マークダウン編集画面に全幅トグルを付ける。仕様書・承認・ステアリングの3画面で共通の編集 UI にトグルを置き、ON でサイドバーを隠してビューポート全幅で編集、OFF で元のレイアウトに戻す。

境界は proposal で切られている。**ヘッダーは隠さない。** ストローク側の proposal 確認画面（注釈 UI）は対象外。

**完了判定** — 次をすべて満たしたとき完了とする。

- 編集 UI にトグルがあり、ON で編集領域がビューポート全幅になる
- OFF で元のレイアウトに戻る
- ヘッダーは常に見えている
- 適用先は仕様書・承認・ステアリングの3画面。注釈 UI には出ない

**親との関係** — 後続。markdown を扱う実体をモジュールに閉じた後、その編集面の見せ方を変える。着手前に `replace-handrolled-with-libraries`（archive 済み）が同じ編集 UI を部分置換していることを確認すること。競合するのは同一コンポーネントの内部だけで、外から見た振る舞いは独立している。

#### adr0017-sub-update-ui-approval-review

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

#### adr0017-sub-separate-approval-decision-from-promotion

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

- **押し間違いが取り消せない。** 承認は1押しで確定し、その瞬間に改名とエージェントの起動まで進む。`adr0017-sub-update-ui-approval-review` で承認と即時却下を同じ並びに置くと、隣り合うぶんこの危険が増える
- **失敗の戻し方が endpoint の中に埋まっている。** 改名が失敗したら `phase` を書き戻す、steering のキックが届かなければ `invocation` を `failed` に倒す、という後始末を1つの関数が抱えている。どの段で失敗したかによって戻す先が変わる
- **昇格した後にしか steering を起こせない。** 起動が失敗しても昇格は残るので、`failed` を拾って起こし直す巡回が要る

**完了判定** — 次をすべて満たしたとき完了とする。

- 承認の判断・昇格・steering の起動が別々に扱える
- 承認を確定した後、昇格の前に取り消せる余地がある
- 失敗した段だけをやり直せ、後始末が段ごとに分かれている
- 承認がプロジェクト生成の唯一の引き金であることは変わっていない

**親との関係** — 後続。`adr0017-sub-update-ui-approval-review` が承認と即時却下を同じ並びに置くため、押し間違いの危険がそちらの実施で増える。両者の順序を決めてから着手する。

### 資料化

振る舞いを変えず、実装を文書へ写すもの（1件）。

#### adr0017-sub-update-docs-structure

- **種別**: 資料化
- **状態**: 未着手（tasks 0/26）
- **成果物**: proposal + design + specs + tasks（**0/26**）
- **触るファイル**:
  - `docs/specs/core/system-structure.md` — ディレクトリ構造に `modules/` を追加。`app/components/` の切り方の規範を `app-structure` と揃える
  - `docs/specs/core/file-components.md` — `MarkdownPre` / `CodeBlock` / `MermaidDiagram` / `DocumentView` / `DocumentEditor` の行を落とす
  - `docs/specs/core/file-composables.md` — 移設分を落とす
  - `docs/specs/plan/structure-migration.md` — `MarkdownPre` の例外の行を解消済みに
  - `test/app/components/workspace/markdown-*.test.ts` — 写し元がモジュールへ移ったので置き場を合わせる

**対応内容** — 親 change の実装で生じた、構造の資料と実態の食い違いを直す。

- `system-structure.md` のディレクトリ構造に `modules/` を加える。画面の階層に属さない自己完結の機能の置き場として定義する
- `file-components.md` / `file-composables.md` の棚卸しから、モジュールへ移した分を落とす
- `structure-migration.md` の「`global/MarkdownPre.vue` は規範の区切りに従えない唯一の例外」を解消済みとして更新する。Nuxt module の `addComponent({ global: true })` が同じ登録を行うため、置き場の制約は無くなった
- `test/` の置き場を実態に合わせる。規範は「ソースの構造をそのまま写す」だが、写し元がモジュールへ移った
- **構造の規範が2つある状態を解く。** `openspec/specs/app-structure` は「`app/components/` と `app/composables/` の配下は階層ディレクトリ（`workspace/` / `shared/`）で分ける」と定め、`docs/specs/core/system-structure.md` は「`ui/` ＋機能単位で切る」と定める。どちらが正かを決め、もう一方をそれに従わせるか役割を分ける。親 change では前者に delta を当てたが、後者は手つかずである

**振る舞いは変えない。** コードに手を入れるのは `test/` の置き場だけで、それも移動である。

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
