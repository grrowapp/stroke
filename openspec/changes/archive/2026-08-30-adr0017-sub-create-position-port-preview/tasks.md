## 1. 分からないことを先に測る

design.md の R2 が未確認のまま残っている。実装の形（2.3 を足すかどうか）がこれで決まるので先に測る。

- [x] 1.1 `<MDC>` の解析が終わる前の器（`<div>` は在るが `data-src-start` の包みが1つも無い状態）に対して `createPreviewPositionPort` を呼び、`toSourceRange` / `toDomRange` が何を返すかを測る
- [x] 1.2 測った結果を design.md の R2 に追記する。**誤った範囲が返るなら 2.3 を実施する。`null` が返るなら 2.3 は不要**と明記する
  - 実測: 解析前の器は子ノードを持たないため両方向とも `null`。**2.3 は不要**
  - 別の穴を発見した。包みが1つも無い本文で器ぜんたいを選ぶと `null` に倒れず `{start:0,end:8}`（正解は `0..15` 相当）を返す。この change の範囲外なので design.md の R6 に記録し、`adr0017-sub-add-detection-assumptions` へ回す

## 2. 位置の対応を公開する

`MarkdownSource.vue:46-77` と同じ形にする（design.md 決定1・決定2）。

- [x] 2.1 `MarkdownView.vue` の器 `<div v-if="props.value">` に `ref="root"` を付け、`useTemplateRef<HTMLElement>('root')` で掴む。**`<MDC>` と `parser-options` には触れない**（触ると解析が二重に走り、ハイドレーションが壊れてアプリ全体のアイコンが消える。design.md Context 3）
- [x] 2.2 呼ばれるたびに `createPreviewPositionPort({ container, source: props.value ?? '' })` を作り、`defineExpose({ toSourceRange, toDomRange } satisfies PositionPort)` で出す。**器の要素そのものは外へ出さない**
- [x] 2.3 （1.2 の結果次第）包みが1つも無いときに `null` を返す分岐を足す → **1.1 の実測により不要。コードは足さない**
- [x] 2.4 `position/types.ts` の `PositionPort` に、返すオフセットの基準が「面に渡された文字列の先頭から」であることを書く。あわせて **`parseMarkdown` が内部で CRLF を LF に正規化し front matter を除くため、未正規化の文字列を渡すと基準が食い違い、`null` に倒れず黙って別の場所を返す**ことと、それを塞ぐのが `adr0017-sub-fix-normalization-offset` であることを書く
- [x] 2.5 `MarkdownView.vue` の冒頭コメントの「口」を普通の用語に直す（この change で触る範囲だけ。コード全体の置換は別 change に切ってある）
- [x] 2.6 `yarn typecheck` が通る

## 3. 公開が消えたら落ちる状態にする

いま `defineExpose` を外しても単体テスト358本は全部通る（design.md R5）。

- [x] 3.0 `vitest.config.ts` に alias を2本足す（`#imports` → `vue`、`#components` → `test/stubs/nuxt-components.ts`）。`test/stubs/nuxt-components.ts` は `MDCRenderer` のダミーを出すだけ
- [x] 3.1 `test/modules/markdown/runtime/render/markdown-view-position.test.ts` を `// @vitest-environment happy-dom` で作り、`@vue/test-utils` の `mount` でマウントする。`<MDC>` は `global.stubs` で差し替え、`markSourcePosition` が付けるのと同じ形の包みを直に置く（design.md 決定4。**当初の `@vitest-environment nuxt` はこのリポジトリで動かないことが実測で判明した**）
- [x] 3.2 マウント結果が `toSourceRange` と `toDomRange` の2つを持つことを確かめる
- [x] 3.3 `props.value` が空のとき、どちらも `null` を返すことを確かめる（器そのものが描かれないため）
- [x] 3.4 整形された本文の上の範囲から生テキストの位置が取れること、および生テキストの位置から範囲が引けることを確かめる。**変換の網羅はここでやらない**（`preview.test.ts` の35本が持つ）。見るのは経路が繋がっていることだけ
- [x] 3.5 **わざと壊して落ちることを確かめる。** `defineExpose` を外して 3.2 が赤くなること、`ref` を外して 3.4 が赤くなることを実際に目で見る。書いただけで検知できていない状態にしない
  - **1回目は検知できていなかった。** `wrapper.vm` で見ていたため、`<script setup>` の vm が setup スコープをそのままプロキシし、`defineExpose` を丸ごと外しても4本とも緑のままだった。`instance.exposed` を見る形に直した
  - 実測: `defineExpose` を外す → 4本とも赤（`expected 'undefined' to be 'function'`）。`ref="root"` を外す → 2本赤。復元 → 4本とも緑

## 4. 親 change の記帳を閉じる

- [x] 4.1 親 `create-module-markdown` の tasks.md の 5.1 に済みを付ける。`keepPosition` は `MarkdownView.vue:118` の `parser-options` から既に渡っており、記帳が漏れていただけである（親の残タスクは 37 → 36）

## 5. 検証

- [x] 5.1 `yarn test` が緑。基準は 358 passed / 19 files で、増えるのは 3章 で足した分だけであること（実測 **362 passed / 20 files**。増分は 3章 の4本・1ファイルのみ）
- [x] 5.2 `yarn test:e2e` が基準と同じ結果。**`e2e/markdown-hydration.spec.ts` を含む**（解析の段に触っていないことの確認）
  - 実測: **16 failed / 194 passed**。変更を戻して同じ4ファイルを回すと**同じ16件が同じ集合で落ちる**（差分ゼロ）。この change による新規の失敗は無い
  - `markdown-hydration.spec.ts` は通っている。解析の段に触っていないことの確認は取れた
  - **ただし親 tasks が記録する基準「失敗2件」とは合わない。** 落ちているのは design-token のアイコン・色、upstream-style の枠とトースト、agent-question、stroke-exit で、markdown 系ではない。うちアイコン系は親 tasks 6.14.2 が記録する `@nuxt/icon` のカスタムコレクション 404 と符合する。**基準そのものが古いか環境依存**であり、この change の範囲外
- [x] 5.3 `yarn typecheck` が通り、この change が `openspec validate --strict` で valid であること
  - 実測: `yarn typecheck` exit 0（エラー0件）/ `Change 'adr0017-sub-create-position-port-preview' is valid`
  - **当初は「`yarn check` が通る」と書いていた。判定条件が現実と合っていなかったので直した。** `yarn check` は `yarn spec`（`openspec validate --all`）を含み、あれは**未着手の change を「delta が無い」で落とす**。この session の時点で22本が該当し、うち19本はこの epic より前から在る。1つの change を仕上げても通らず、通ったことがない
  - **`yarn check` が品質ゲートとして機能していない件は、この change の範囲外**として残す。`yarn spec` の対象を絞る change を別途起票すること
