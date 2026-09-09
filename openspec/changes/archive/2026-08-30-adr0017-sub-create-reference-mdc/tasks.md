## 1. 移設前の基準を控える

移設は「移動のみで結果が変わらない」ことが完了条件なので、**先に基準を取る**。取らずに移すと、あとから同一性を言えない（design.md R3）。

- [x] 1.1 `yarn test` を実行し、**総本数・ファイル数・失敗の集合**を控える。あわせて移設対象3本それぞれの本数を控える（現時点の見込みは `markdown-sanitize` 6本 / `markdown-fence-position` 19本 / `markdown-roundtrip` 2本）
- [x] 1.2 移設対象3本が**相対 import を1つも持たない**ことを確かめる（import は npm パッケージと `vitest` だけ）。持っていたら移設先からのパスに書き換えが要るので、その分をここで洗い出す
- [x] 1.3 3本のテスト名（`describe` と `it` の文言）を控える。移設後に**同じ名前で同じ本数が通る**ことの突き合わせに使う

## 2. テストを写し元と同じ構造の位置へ移す

design.md 決定4・決定5。**`git mv` で移し、ファイルの中身は1行も変えない。**

- [x] 2.1 `test/app/components/workspace/markdown-sanitize.test.ts` → `test/modules/markdown/sanitize.test.ts`
- [x] 2.2 `test/app/components/workspace/markdown-fence-position.test.ts` → `test/modules/markdown/fence-source.test.ts`
- [x] 2.3 `test/app/components/workspace/markdown-roundtrip.test.ts` → `test/modules/markdown/runtime/edit/roundtrip.test.ts`
- [x] 2.4 空になった `test/app/components/` を削除する。**`test/app/composables/useRelativeTime.test.ts` は動かさない**（写し元 `app/composables/useRelativeTime.ts` が動いていない）
- [x] 2.5 `git diff -M --stat` で、3本が**内容変更を伴わない改名（R100%）**として出ることを確かめる。1バイトでも変わっていたら戻してやり直す

## 3. 移設が結果を変えていないことを確かめる

- [x] 3.1 `yarn test` を実行し、1.1 の基準と**総本数・ファイル数・失敗の集合が一致**することを確かめる。「緑であること」を判定にしない（0本実行でも緑になる）
- [x] 3.2 移設した3本が実際に走っていることを、テスト名の一覧で確かめる（1.3 で控えた名前が全部出ること）
- [x] 3.3 `yarn typecheck` が通る

## 4. 観測を資料に落とす（事実の部分）

`docs/specs/reference/mdc-observations.md` を新規作成する。枠は `upstream-observations.md` に倣う（design.md 決定1）。**ADR を参照しない**（`docs → ADR` は「参照の方向」で禁止。design.md Context 1）。

出どころは3箇所 — 親 `create-module-markdown` の tasks.md（6.1〜6.7・6.10・6.14）、コミット `82a96e0`、既存テストの冒頭コメント。

- [x] 4.1 「この資料の扱い」を書く。**観測した事実だけを書き、決定は書かない**こと。食い違ったときは**実物のコードとテストが勝つ**こと。**この資料自身は検知を持たない**こと（R1）
- [x] 4.2 「出典と時点」を書く。`@nuxtjs/mdc@0.23.1`（**これが最新で上げ先が無い**）、調査した日、測り方（パーサを直接変異させて落ちる本数を数えた）。**行番号は書かない**（動くため。シンボルで探すよう注記する）
- [x] 4.3 件1 を書く。**解析を自前で組み直すとハイドレーションが壊れる。** クライアントの再解析で shiki の色が SSR とずれ、**アプリ全体のアイコンが消える**。markdown 本文には症状が出ず、全画面のピクセル差分だけが捕まえた
- [x] 4.4 件2 を書く。**offset 0 から始まるノードは `position` を落とす。** `parser/compiler.js` の `node.position?.start?.offset && …` に 0 が偽として落ちるため。**フェンスに限らずあらゆるノードが該当する**（「フェンスだけの話」と思っていたのが崩れた点）。0 を書くと文書の冒頭が `[0,0)` を指す
- [x] 4.5 件3 を書く。**`position` が記号を含むのはインラインコードだけ。** 強調・リンク・見出し・リスト・引用・表・打ち消しはすべて内側どうしで揃う。**「記号を持つ記法は含むはず」という当たりの付け方は通らない。** 長さを按分すると1〜2文字ずれた位置を黙って返す
- [x] 4.6 件4 を書く。**`keepPosition` は `MDCParseOptions` であって `ModuleOptions` ではない。** module の設定ブロックに書いても効かない
- [x] 4.7 件5 を書く。**`pre` の `position` も `code` も DOM に出ない。** `MDCRenderer` が `node.position` を捨て、`code` はコンポーネントの props 宣言で `attrs` から抜ける
- [x] 4.8 件6 を書く。**フェンスの生テキストと表示文字列の差は5つ** — 4桁のタブストップ・器のインデント剥がし・引用記号の剥がし・末尾改行の付与・メタの分離。**行の並びは保たれる。** 「タブ展開だけが差」ではなかった点を明示する
- [x] 4.9 件7 を書く。**CRLF と front matter は実際に含まれうる。** 本家は `readFile` / `writeFile` で素通しし、改行を触るコードが `dist` に0件。front matter を作る依存も無いが、文書を書くのは AI か人間である。アプリ側の正規化も0件。**基準がずれたとき `null` に倒れず、黙って別の場所を返す**（CRLF の文書で3つめの段落の `x` を選ぶと2つめの段落の `x` が返り、返る字が同じなので受け取る側から見えない）
- [x] 4.10 「検知力の実測」を書く。パーサを変異させた5件（タブストップ幅・offset 0 の真偽判定・末尾改行の付与・`rehype-raw` の無効化・`pre` の範囲）で **14〜58本が落ちる**こと。**素通りした変異が3件ある**こと（`li` の段落ほどき・改行だけの text ノードの除去・見出しの id）。素通りの意味 — テストはフェンスの幾何と text ノードの位置をよく固めているが、**AST の構造を何も固めていない**。マイナーリリースが最も変えやすいのがこの層である
- [x] 4.11 「ハイドレーション検知が拾えない範囲」を書く。**属性だけのずれが拾えない**（Vue は本番ビルドで要素の属性のずれを直さないため、SSR と客側で色だけが違う場合に素通りする。実測: 配る HTML の `style` を書き換えても、ハイドレーション後の DOM はサーバの値のまま残った）。**この環境ではアイコン消失そのものが再現しない**（`@nuxt/icon` のカスタムコレクションが 404 で読めておらず、SSR も客側も空の `<svg>` が出るだけ）
- [x] 4.12 「参照」を書く。ファイルとシンボルで示す（`modules/markdown/index.ts` の `installModule` / `runtime/position/*` / `runtime/render/*` / `e2e/markdown-hydration.spec.ts`）。**行番号は書かない**
- [x] 4.13 書いたもの全体を読み返し、**「口」という語が1つも無い**ことを確かめる

## 5. 「どのテストが固定しているか」を突き合わせる

design.md 決定3・決定6。**この章は 4章 の後に一度だけ行う。** `adr0017-sub-add-detection-assumptions` が検知を足すため、テスト名は動く。

- [x] 5.1 `adr0017-sub-add-detection-assumptions` が完了しているかを確かめ、**完了していればその成果を含めて**、していなければ**その時点で在るものだけ**で突き合わせる。どちらで書いたかを資料の「出典と時点」に1行残す
- [x] 5.2 件1〜件7 それぞれに「固定しているもの」を**ファイル名 ＋ `describe` 名 ＋ 本数**で書く。**パスだけで済ませない**（どの記述が落ちるのか分からなくなる）
- [x] 5.3 件4（`keepPosition` の置き場）は**テストではなく型で落ちる**（TS2353）ことを、そう書く。落ちる先が `yarn typecheck` であることを明記する
- [x] 5.4 **固定するものが無い件は「まだ固定するものが無い」と明記し、引き取り先（`adr0017-sub-add-detection-assumptions`）を書く。空欄にしない**（空欄は「調べていない」と区別が付かない）。現時点では 4.10 の AST 構造3件が該当する見込み
- [x] 5.5 書いたテスト名が実在することを、実際に `yarn test` の出力（またはファイルの `describe` 行）と1件ずつ突き合わせる。**存在しない名前を1つでも書かない**

## 6. 目録と参照から辿れるようにする

- [x] 6.1 `CLAUDE.md` の Docs 節の `docs/specs/reference/` に1行足す。既存2件（`stroke-modules.md` / `upstream-observations.md`）と同じ書式（`— ` 区切りの1行説明）で揃える
- [x] 6.2 `docs/specs/reference/stroke-modules.md` の「関連」に1行足す。**足すのは参照の1行だけで、既存本文には触れない**（R5）
- [x] 6.3 移設した `test/modules/markdown/fence-source.test.ts` の存在が、`runtime/position/fence.ts` を書く人から辿れることを確かめる。辿れなければ、**新設した資料の「参照」から指す**（テストのコメントを書き換えない。移設は移動のみという 2章 の条件を崩さない）
- [x] 6.4 新設した資料からの参照が「参照の方向」に反していないことを確かめる — **docs が参照してよいのは docs と specs のみ。ADR は不可。** コード・テスト・ツールの設定は序列の外の実体なので事実として参照してよい

## 7. 検証

- [x] 7.1 `yarn typecheck` が通る
- [x] 7.2 `yarn test` が 1.1 の基準と同じ結果（総本数・ファイル数・失敗の集合が一致）
  - **実測 487 passed / 31 files、失敗0。** 移設した3本は 27本のまま同じ結果で通っている（並行の2 change が足した分だけ総数が増えた）
- [x] 7.3 `yarn test:e2e` がこの change の前と同じ結果。**コードを触っていないので差は出ないはずである。** 出たら、それはこの change 由来ではないことを確かめて記録する
  - **実測（2026-08-30）。** `yarn build` → `.e2e-tmp/` を掃除 → `yarn test:e2e` で **217 passed / 1 failed**。落ちた1本は `workspace.spec.ts` の接続確立待ちで、単独実行では43本すべて緑（flake）。この change はコードを触っていないので差は出ていない
- [x] 7.4 `openspec validate adr0017-sub-create-reference-mdc --type change --strict --store stroke` が valid
- [x] 7.5 親 `create-module-markdown` の tasks.md の **3.7 と 6.8.1〜6.8.4 に済みを付ける**。3.7 には `markdown-fence-position.test.ts` も併せて移したことを1行添える
  - 親 tasks の 3.7 / 6.8.1 / 6.8.2 / 6.8.3 / 6.8.4 に済みを付けた（親の残は 36 → 31）

## 8. レビューと締め

- [ ] 8.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。**完全にパスするまで続ける**
  - **実行していない。** ユーザーがこの change の archive を指示したため、そこで打ち切った。走らせていない以上、済みは付けない
- [x] 8.2 ユーザーから完了の承認を得る。**`proposal.md` 末尾の「私が取った決め（未承認の仮定）」9件を、この場で1件ずつ承認してもらう**（grilling を見送ったまま進めた分がここに溜まっている）。承認が取れなかった決めは、その場で直してから締める
  - ユーザーが archive を指示した（2026-08-30）。これを完了承認として扱う
