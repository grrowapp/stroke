## 1. 分からないことを先に測る

design.md 決定3 が「解析する側と同じ手続きで写像を作る」と定めている。それが実際に可能かを先に測る。ここの結果で2章の形が決まる。

- [x] 1.1 front matter を落とす実装（`remark-mdc` の `parseFrontMatter`）を `modules/markdown/` から呼べるか測る。**呼べなければ 1.4 で代案を決める**
  - **呼べる。** `@nuxtjs/mdc/dist/runtime/parser/index.js:4` が `import { parseFrontMatter } from "remark-mdc"` で使っているものと同一。ただし `remark-mdc` は `package.json` に無い**推移的依存**で、`@nuxtjs/mdc` が落とせば消える（R として design に記録）
- [x] 1.2 「CRLF を潰す → front matter を落とす」の2手続きで作った文字列が、`parseMarkdown` が実際に解析した文字列と一致することを、反例2件で確かめる
  - **7件すべてで印の不一致 0件。** 2手続きは解析された文字列を完全に再現する
- [x] 1.3 落ちる量の測り方を確かめる。書き方を変えて測る
  - 実測（raw / lf / content の長さ）: CRLF 18/12/12 ・ front matter 23/23/11 ・ FM＋CRLF 29/23/11 ・ **空の FM `---\n---` 14/14/14（落ちない）** ・ 末尾改行なし 18/18/6 ・ **水平線 11/11/11（落ちない）** ・ 素 6/6/6
  - **content は全件で lf の接尾辞だった**（`lf.endsWith(content)`）。したがって front matter のずれは定数 `lf.length - content.length` で表せる。落ちた量を数える必要がない
- [x] 1.4 測った結果を design.md 決定3 に追記する
  - 代案は不要（1.1 で呼べた）。代わりに**推移的依存であること**をリスクとして記録した

## 2. 写像を作る

- [x] 2.1 `modules/markdown/runtime/position/normalize.ts`（新規）を作る。渡された文字列から、解析に使われる文字列と**双方向の写像**を返す純関数を置く。作れなければ `null` を返す
- [x] 2.2 CRLF の写像を入れる。`\r\n` のたびに1文字ぶん詰まるだけで並びは変わらないので、累積のずれの配列1本で表す
- [x] 2.3 front matter の写像を入れる。**落ちた量を定数で決め打ちしない**（design.md 決定3）。1章で決めた手続きで求める
- [x] 2.4 作った文字列が、CRLF を潰した文字列の**接尾辞であることを必ず確かめる**。確かめられなければ写像を作らない
- [x] 2.5 単体テストを書く（`test/modules/markdown/runtime/position/normalize.test.ts`）。CRLF のみ / front matter のみ / 両方 / どちらも無い（写像は恒等）/ 空文字列 / front matter だけで本文が無い / 境界（先頭・末尾・`\r\n` の直前と直後・落ちた前置きの直後）
- [x] 2.6 **わざと壊して落ちることを確かめる。** 接尾辞の確認を外す・ずれの累積を1つずらす・front matter の分を足し忘れる、の3つで実際に赤くなることを目で見る
  - ずれの累積を1つずらす → **9本落ちた**／front matter の分を足し忘れる → **3本落ちた**／復元 → 17本緑
  - **接尾辞の確認を外しても1本も落ちなかった。** 実物の `parseFrontMatter` は front matter を先頭からしか落とさないので、返る文字列は必ず接尾辞になり、このガードは実物では一度も効かない。**パーサが変わったときのための防具**である
  - `vi.doMock('remark-mdc')` で偽の実装（接尾辞でない文字列を返す／例外を投げる）を差す2本を足して塞いだ。塞いだ後は 接尾辞の確認を外す → 1本落ちる／例外を握らず素通しする → 1本落ちる
  - 実装の欠陥を2件見つけた。(a) `parseFrontMatter` は**区切りの改行を1つ残す**（`'---\na: b\n---\nab\n'` → `'\nab\n'`）。親 design.md が記録していたのに使っていなかった。(b) **半開区間の終わりの写し方が誤り**で、`x\r\n` の `x` を選ぶと範囲が `x\r` になっていた。終わりは「直前の文字の終わり」へ写す形に直した

## 3. 面の内側で吸収する

- [x] 3.1 `position/preview.ts` の `PreviewSurface.source` の意味を反転させる。「`parseMarkdown` が実際に解析した文字列でなければならない」→「**面に渡された文字列**」。ドキュメントの「揃えるのは呼ぶ側の責任である」も併せて書き換える
- [x] 3.2 ポートを作るときに写像を作り、照合は解析される側の文字列に対して行う。**照合そのものには触らない**（design.md Non-Goals）
- [x] 3.3 `toSourceRange` の出口で逆写像を通し、渡された文字列の座標へ戻してから返す
- [x] 3.4 `toDomRange` の入口で順写像を通し、解析される側の座標へ写してから引く
- [x] 3.5 写像が作れないときは両方向とも `null` を返す。**推測で答えない**
- [x] 3.6 `position/types.ts` の但し書きを置き換える。「誰が揃えるかはまだ決まっていない」「渡す前に揃えておくこと」を消し、**面が吸収すること**と**渡された文字列を作り変えないこと**を書く
- [x] 3.7 `render/MarkdownView.vue` が `props.value` をそのまま渡していることを確かめる（**変えない**。design.md 決定2）
  - `MarkdownView.vue:107` が `createPreviewPositionPort({ container, source: props.value ?? '' })`。変更なし
- [x] 3.8 `yarn typecheck` が通る

**3章の実測（2026-08-30）。**

- **`createSourceMapping` は同期にできた。** `parseFrontMatter` は Promise を返さない（`remark-mdc/dist/index.mjs:48` が素の関数）。面はポートを呼ばれるたびに同期で作るので、非同期だとその形を崩すところだった
- 内部は解析側の座標のまま動かし、**外向きの2つだけを包んで写像を通す**形にした（`inParsed` を内側に置き、`toSourceRange` の出口と `toDomRange` の入口で変換）。照合そのものには触っていない
- この時点で `test/modules/markdown/runtime/position/` は **244 passed / 3 failed**。落ちた3本は 5章 で反転させる反例そのもの（CRLF・front matter・「ずれが小さければ null に倒れる」）

## 4. `sourceShown` も同じ基準で読む

返す側だけ直すと、ここが新しい食い違いの置き場になる（design.md 決定4）。

- [x] 4.1 `render/MarkdownView.vue` が `provide(SOURCE_SHOWN_KEY, …)` する前に、渡された範囲を解析される側の座標へ写す
  - `shownInParsed` を `computed` で置き、`createSourceMapping(props.value ?? '')` の `toParsed` を通してから `provide(SOURCE_SHOWN_KEY, () => shownInParsed.value)` する。鍵は `MaybeRefOrGetter` を受けるので getter で渡す
- [x] 4.2 写せない範囲は落とす。**推測で添えない**（`readFenceRange` が読めないときに図だけを出す既存の構えと同じ）
  - `toParsed` が `null` を返した範囲は `filter` で落とす。写像そのものが作れないとき（`createSourceMapping` が `null`）は空の配列を返し、図だけが出る側へ倒す
- [x] 4.3 CRLF と front matter を持つ文書で、フェンスに生テキストが正しく添えられることを単体で押さえる。**写しを外すと落ちること**を目で見る
  - `test/modules/markdown/runtime/render/markdown-view-source-shown.test.ts`（新規9本）。front matter のみ / CRLF のみ / 両方 の3文書で、降ろされた値が解析側の座標になっていること・フェンスと重なって添えられること・前置きの中を指す範囲が落ちること・混ざっていたら写せるものだけが降りることを固定した
  - **期待値は数え上げで書かない。** 解析される文字列を解析する側と同じ2手続き（CRLF を潰す → `parseFrontMatter`）で作り、`indexOf` で位置を引く。写像の実装を呼ばないので期待値が実装の写しにならない
  - **写しを外すと 9本中7本が落ちた**（実測）。落ちなかった2本のうち1本は CRLF の文書の重なり判定で、**落ちる量が小さく写さなくても重なりが残る**ため。だから主の検知は値そのものを見る「渡された座標のままでは降りてこない」の側に置き、写しが成否を左右する場面は前置きの長い文書で別に1本立てた（`overlaps` が偽になる配置であることを確かめる）
  - 復元後 `test/modules/markdown/runtime/render/` は 19 passed

## 5. 反例を反転させる

`test/modules/markdown/runtime/position/edge-cases.test.ts` の2本は現象を固定しているので、直すと落ちる。**消さずに反転させる**（design.md 決定5）。

- [x] 5.1 「CRLF: 生ファイルを渡すと、黙って別の段落を指す」を、生ファイルを渡して正しい位置（`15`）が返る側へ書き換える。**入力の文字列は変えない**
- [x] 5.2 「front matter: 生ファイルを渡すと、黙って front matter の中を指す」を、生ファイルを渡して本文の `b`（`19`）が返る側へ書き換える。同上
- [x] 5.3 「正規化して渡せば正しく引ける」の2本を残す。面から見ればそれが渡された文字列なので、その文字列を基準に正しく答える。**意味づけが変わったこと**を説明文に書く
- [x] 5.4 「ずれが小さければ `null` に倒れることも多い」の1本を見直す。吸収した後は `null` に倒れる理由が無くなるので、**正しく引ける側へ移す**か、写像が作れない別の入力に置き換える
- [x] 5.5 説明文に「かつてはここで別の場所が返っていた」ことを残す（design.md R6）

**5章の実測（2026-08-30）。** 反転前は3本が落ちていた。返っていた値は正しい答えそのもので、`{15,16}`（CRLF の3つめの段落の `x`。かつては 10 = 2つめの段落）と `{19,20}`（本文の `b`。かつては 7 = front matter の `a: b` の `b`）。「ずれが小さければ `null` に倒れる」の1本は倒れる理由が無くなったので、**正しく引ける側へ移した**（題も変えた）。入力の文字列は3本とも変えていない。反転後 `edge-cases.test.ts` は 40 passed。

## 6. 外へ出る値の基準を固定する

- [x] 6.1 `e2e/fixtures/upstream-stub.mjs` の `request-approval` に承認対象の本文を渡せるようにし、`GET /approvals/:id/content` がそれを返すようにする。**アプリ側にテスト専用の抜け道を足さない**（design.md 決定7）
  - 承認の一覧に載せず `project.approvalContents`（承認 id → 本文）に別に持つ。本家が返す承認の形に無いフィールドを足すと、アプリが受け取る payload が本家と違うものになるため
  - 見る順は「保存された文書 → 仕込み → 既定」。承認画面から直した結果が勝つ既存の振る舞いを変えない
- [x] 6.2 `e2e/support.ts` の `stub.requestApproval` に本文を渡す引数を足す（`content?: string`。渡さなければ既定の本文で、既存の試験はそのまま）
- [x] 6.3 CRLF を含む承認対象文書で、指摘を付けて差し戻し、本家へ渡ったオフセットが**本家が持っている本文へ当てて**引用文字列と一致することを確かめる（`e2e/approval-annotation.spec.ts`）
- [x] 6.4 front matter を持つ承認対象文書で同じことを確かめる
- [x] 6.5 **前置き（front matter）の中にも指摘を付けられる**ことを確かめる。面から取り除かれていないこと（`specs/project/ui` の追加シナリオ）
- [x] 6.6 期待値を数値の直書きにしない。**本文を変えるたびに壊れる形にしない**
  - 選ぶのもオフセットで指さず、**DOM に出ている語を探して選ぶ**形にした。こちらが数えた位置を面へ教えると、面が自分で数えた位置と食い違っても分からない
  - 確かめるのは「送られたオフセットで本家の本文を切ると、選んだ語になる」こと
- [x] 6.7 **わざと壊して落ちることを確かめる。** `approvals/[approvalId].vue` の `source` に正規化を足すと 6.3 / 6.4 が赤くなることを目で見る（確かめたら戻す）
  - **新規3本だけが落ち、既存10本は緑のまま**（実測）。復元後は 13 passed
  - **`yarn test:e2e` はビルド済みの `.output/server/index.mjs` に対して走る**（`playwright.config.ts` の webServer）。アプリ側を変えたら `yarn build` を挟まないと結果が嘘になる。最初の毒見は古いビルドに当たって13本とも緑のままだった

## 7. 上位資料への整合反映（ユーザー承認が要る）

`docs/agents/issue-tracker.md`「更新対応」により、**承認前に上位資料を書き換えない**。

- [x] 7.1 design.md「上位資料への整合反映」の提案をユーザーに諮る（2026-08-31 に諮り、7.2 は承認・7.3 は「起こさない」の決めを得た）
- [x] 7.2 承認されたら `docs/specs/core/file-composables.md` の `useAnnotations` の節を直す（「生テキストへの文字オフセット」→ 基準がどの文字列かまで具体化する）
  - 「基準は本家から取得した文書の中身そのもの」と、内部の作り変えの後の文字列を基準にしてはならないことを追記。**なぜ弾かれずに別の場所を指すか**（妥当性の判定を通ってしまう）まで書いた
  - 吸収するのが面の内側であること、呼ぶ側が揃える手続きを持たないことも併記し、`openspec/specs/markdown/module` の要件へ繋いだ
- [x] 7.3 ADR を起こすかどうかの決めを仰ぐ。**独断で立てない**
  - **起こさない**という決めを得た。記録は design.md「上位資料への整合反映」と、上の `file-composables.md` に残る

## 8. 検証

- [x] 8.1 着手時の `yarn test` の本数とファイル数を記録し、終わったとき**増分が 2章・4章・5章 で足した分だけ**であることを確かめる
  - **着手時の値は記録が残っていない**（2章・5章は前のセッションで済んでおり、そのときの基準が書かれていない）。確かめられたのは 4章の増分だけである
  - 4章の前 **487 passed / 31 files** → 後 **496 passed / 32 files**。増分は 4.3 で足した +9本 / +1ファイルちょうどで、他は動いていない
  - なお 487/31 は `adr0017-sub-add-detection-assumptions` が完了時に記録した値と一致する
- [x] 8.2 `yarn test:e2e` が着手時と同じ結果 ＋ 6章 で足した分であること。**この change による新規の失敗が無い**ことを、変更を戻して同じファイルを回して確かめる
  - フル実行で **220 passed / 1 failed**。並走した `adr0017-sub-add-detection-assumptions` の記録が 217 passed / 1 failed なので、**passed は 6章の +3本ちょうど、failed は増えていない**
  - 落ちた1本は実行のたびに別のテストへ移る（フル実行では `upstream-style.spec.ts:403`、単独実行では同 `:1002`）。**落ちる場所はどちらも `resetBoard`（`e2e/support.ts:125`）の WS 再接続待ち**で、テスト本体に入る前の共通処理である。この change が触った経路の外
  - `upstream-style.spec.ts` を単独で回し直すと **33 passed / 0 failed**。flake で確定（`adr0017-sub-add-detection-assumptions` が `workspace.spec.ts` で記録したものと同じ機構）
- [x] 8.3 `e2e/markdown-hydration.spec.ts` が通ること（解析の段に触っていないことの確認）（フル実行で緑）
- [x] 8.4 `yarn typecheck` が通り、`openspec validate adr0017-sub-fix-normalization-offset --type change --strict --store stroke` が valid であること。**`yarn check` は判定に使わない**（`yarn spec` が未着手の change を落とすため、通ったことがない。先行 change の記録を参照）
  - 両方とも通る。`yarn check` は使っていない

**8章の実測（2026-08-31）。**

- **`yarn test:e2e` はビルド済みの `.output/server/index.mjs` に対して走る**（`playwright.config.ts` の webServer が `node .output/server/index.mjs`）。**アプリ側を変えたら `yarn build` を挟まないと結果が嘘になる。** 6.7 の毒見は最初、古いビルドに当たって13本とも緑のままだった。ビルドし直して初めて新規3本だけが落ちた
- 9.1 のレビュー後の直し（写像の `computed` の分離）は、`sourceShown` を渡す呼び出し元がまだ無いため E2E からは触れられない。単体9本と typecheck で確かめている
- [x] 8.5 親 `create-module-markdown` の `tasks.md` の 6.11.1〜6.11.5 に済みを付け、決めた内容を1行ずつ書く
  - 5件とも `[x]` にし、保存する座標（生ファイル）・正規化の場所（面の内側）・写像の実体（`normalize.ts` の `createSourceMapping`）・E2E での固定・スタブの手当て を1件ずつ書いた。親は 64/74 → **69/74**

## 9. レビューと完了承認

- [x] 9.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。**レビューが完全にパスするまで続ける**
  - **`typescript-reviewer` はこの環境のエージェント一覧に存在しない。** ユーザーの決めで `review-master` による同等のレビューに代替した
  - 結果は **重大0 / 中0 / 軽微2**。2件とも直した
    - 写像づくりを `props.sourceShown` と同じ `computed` に入れており、範囲が差し替わるたびに `parseFrontMatter` が走り直す。`mapping` を別の `computed` へ分け、本文の変化だけを起点にした。**いまは呼び出し元が無いので実害は無いが、後続 `adr0017-sub-create-module-annotation` が指摘のたびに新しい配列を渡すと効いてくる**
    - テスト1本の入力範囲が `{ start: 4, end: 9 }` の直書きだった。同ファイルの他と揃えて `indexOf` から導く形にした
  - レビューが確かめた主な点: 呼ぶ側（`approvals/[approvalId].vue`）に差分が無いこと（決定6）／`.filter((r) => r !== null)` が TS 5.9.3 の inferred type predicates で `SourceRange[]` に絞れていること／新規テストの期待値が写像の実装を呼んでおらず循環していないこと／スタブが本家の payload の形を変えていないこと
  - 直した後 **496 passed / 32 files**、`yarn typecheck` EXIT=0
- [x] 9.2 成果物を commit する（`4c4851b`。6ファイル / +408 −8。ブランチ `create-module-markdown` へ直接）
- [x] 9.3 ユーザーから完了承認を得る（**ユーザーの委任を受けてエージェントが判定した。** ユーザーは「normalization の中身は自分が指示した内容ではないので完了かどうか判定できない。grilling が必要ならやってよいし、完了とみなせるなら自己判断しろ」と述べた）
  - **判定: 完了。** ADR-0017 の完了判定5項目を実測で突き合わせ、すべて満たしていることを確認した
    - 保存座標が決まり、誰が読むかを調べた結果が proposal に根拠として残っている
    - 正規化の場所が面の内側に決まり、呼ぶ側（`approvals/[approvalId].vue:60`）に差分が無い
    - 正規化後 ↔ 生ファイル の対応が `modules/markdown/runtime/position/normalize.ts` に在る
    - CRLF（`e2e/approval-annotation.spec.ts:388`）と front matter（同 `:398`・`:412`）の E2E が在る
    - スタブが両方を返す。`CRLF_CONTENT`（`.join('\r\n')`）と `FRONT_MATTER_CONTENT`（前置き4行、本文より長い）を `openWith` から `stub.requestApproval` の `content` へ渡す形
  - **grilling は行わない**と判断した。proposal「私が取った決め（未承認の仮定）」の7件のうち重い2件（保存座標＝生ファイル / 正規化は面の内側）は、好みではなく調査から一意に決まる。系全体でオフセットを文書へ当てる実装は本家ダッシュボードの SPA 1つだけで、そこへ渡る本文は正規化していない生ファイルである。正規化後の座標を保存すると front matter の分だけ値が小さくなり、あちらの妥当性判定（長さの範囲内・開始 < 終了）を**通ってしまう**ので、弾かれずに別の場所が塗られる。もう一方を選ぶ理由が無く、覆すと不具合が復活する
  - **archive できる。** proposal:69 は「`markdown/module` が `openspec/specs/` に未存在なので親より先に archive できない」と書いているが、**その前提は既に崩れている**。先行 `adr0017-sub-create-position-port-preview` が archive された時点で `openspec/specs/markdown/module/spec.md` が生まれており（要件2本を実測で確認）、delta のマージ先は在る。本 delta は `## ADDED Requirements` で別名の要件を足すので、既存2本と衝突しない
