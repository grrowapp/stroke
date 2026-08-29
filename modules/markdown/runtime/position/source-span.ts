/**
 * 生テキストの位置を DOM に残すための AST 変換。
 *
 * **位置の口（`./types.ts`）はこれが土台になる。** 口は「DOM の選択範囲 → 生テキストの
 * 位置」を返すが、整形された本文の DOM には本来その手がかりが無い。`@nuxtjs/mdc` の
 * `keepPosition: true` は AST の各ノードに生テキストの文字オフセットを載せるものの、
 * `MDCRenderer` は text ノードを `h(Text, node.value)` で描くので位置は DOM へ出ないまま
 * 捨てられる（`@nuxtjs/mdc/dist/runtime/components/MDCRenderer.vue:136`。割り込む口は無い）。
 * そこで**描く前に AST の側で包み直す**。
 *
 * 包むのは text ノードだけである。位置は「本文のこの字はこの生テキストのここ」の対応が
 * 要るのであって、要素の範囲では字の粒度に届かない。text ノードを包めば、包みの中の
 * 文字数と生テキストの文字数が並び、DOM の選択範囲を生テキストの位置へ落とせる。
 *
 * **包みの中身と、その位置が指す生テキストは、いつも同じ文字列とは限らない。**
 * 散文はほぼ一致するが、インラインコードだけずれる（実測）。`` `インラインコード` `` は
 * text ノードの `value` が記号を含まない内側なのに、`position` は記号を含む外側を指す
 * （`**強調**` は内側どうしで揃うので、記号の扱いが要素によって違う）。位置を DOM へ
 * 残すのがここの仕事なので値はそのまま通すが、**包みの文字数を生テキストの文字数と
 * 見なす計算はできない**。走査する側でここを踏むこと。
 *
 * **位置を持たない text ノードは包まない。** フェンス（コードブロック）の中の text ノードが
 * これに当たる（実測。`keepPosition` を付けても position が乗らない）。持っていない位置を
 * でっち上げると、口が「対応が取れない場合は null」を返せなくなる。包まないことで、
 * 走査する側は包みの有無だけを見て対応の可否を判断できる。
 */
import type { MDCElement, MDCNode, MDCRoot } from '@nuxtjs/mdc';

/** 包みが持つ生テキストの開始位置（含む） */
export const SOURCE_START_ATTR = 'data-src-start';

/** 包みが持つ生テキストの終了位置（含まない） */
export const SOURCE_END_ATTR = 'data-src-end';

/**
 * 位置の印を打つ要素。
 *
 * フェンスの中の text ノードは位置を持たないため、包みでは中に手が届かない。
 * フェンス全体の範囲を `pre` に載せて、対応表（`./fence.ts`）へ渡す。
 */
const FENCE_TAG = 'pre';

/**
 * 包みのタグ。**inline でなければならない。**
 *
 * 本文の見え方（改行位置・折り返し・字間・余白）を1ピクセルも変えないのがこの変換の
 * 制約で、block を挟むと段落が割れる。`span` は既定で inline なので、`prose` にも
 * `.sb-markdown` にも `span` への指定が無い限り箱として現れない。
 */
const WRAPPER_TAG = 'span';

/**
 * 同じ AST には同じ結果を返すための控え。
 *
 * 呼ぶ側（`../render/MarkdownView.vue`）は `<MDC>` の slot から受けた AST をそのまま
 * ここへ通すので、描き直しのたびに呼ばれる。毎回新しい AST を作ると `MDCRenderer` の
 * `body` の同一性が壊れ、本文が変わっていなくても描き直しになる。`<MDC>` が既定で
 * 渡していたのは `useAsyncData` の中身そのもの（同一性が保たれる）なので、そこに揃える。
 *
 * 鍵は元の AST。解析し直されれば別物になるので、古い結果は GC に任せてよい。
 */
const marked = new WeakMap<MDCRoot, MDCRoot>();

/**
 * position を持つ text ノードを包んだ AST を返す。
 *
 * **元の AST を書き換えない。** 解析結果は `useAsyncData` の payload に載って使い回される
 * ので、その場で書き換えると二度目の描画で包みが二重になる。
 */
export function markSourcePosition(root: MDCRoot): MDCRoot {
  const cached = marked.get(root);
  if (cached !== undefined) return cached;

  const result: MDCRoot = { ...root, children: root.children.map(markNode) };
  marked.set(root, result);
  return result;
}

function markNode(node: MDCNode): MDCNode {
  if (node.type === 'text') {
    if (node.position === undefined) return node;

    return {
      type: 'element',
      tag: WRAPPER_TAG,
      props: {
        [SOURCE_START_ATTR]: node.position.start,
        [SOURCE_END_ATTR]: node.position.end,
      },
      // 包みの中は素の text ノードに戻す。位置は包みが持つので中には要らない
      children: [{ type: 'text', value: node.value }],
    };
  }

  if (node.type !== 'element') return node;

  const children = node.children ?? [];
  const marked = children.length === 0 ? children : children.map(markNode);

  // **フェンスの `pre` にも印を打つ。** 中の text ノードは位置を持たないので、
  // 包むだけではコードブロックの中に手が届かない。フェンス全体の範囲さえ DOM に
  // 出ていれば、`position/fence.ts` の対応表で中の桁まで引ける。
  //
  // 印が要るのは、**`position` が DOM へ出る経路が他に無い**ためである。
  // `MDCRenderer` は受け側へ `node.props` だけを渡して `node.position` を捨てる
  // （`MDCRenderer.vue` の `propsToData`）。`code` 属性も `MarkdownCode` が props で
  // 宣言しているため `v-bind="attrs"` から抜けて `pre` に戻らない（実測）。
  //
  // 打つのは `pre` だけにする。すべての要素に打つと DOM が属性で膨れるうえ、
  // 位置が要るのは「中の text ノードが位置を持たない領域」だけである。
  if (node.tag === FENCE_TAG && node.position !== undefined) {
    return {
      ...node,
      props: {
        ...node.props,
        [SOURCE_START_ATTR]: node.position.start,
        [SOURCE_END_ATTR]: node.position.end,
      },
      children: marked as MDCElement['children'],
    };
  }

  if (children.length === 0) return node;

  return { ...node, children: marked as MDCElement['children'] };
}
