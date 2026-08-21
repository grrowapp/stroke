/**
 * md4x の AST を Vue のノードに落とす。
 *
 * md4x の `parseAST` は `{ nodes: [...] }` を返し、要素は `[tag, props, ...children]`、
 * テキストは素の文字列で入る（`md4x/lib/types.d.mts` の `ComarkElement` / `ComarkText`）。
 *
 * **生 HTML は描かない。** md4x は markdown 中の生 HTML を `['html', {}, '<script>']` の
 * ような専用ノードに隔離して返すので、この種別を落とすだけで文書側の HTML が実行される
 * 経路が無くなる。`v-html` を使わないのも同じ理由（stroke-board は本家のファイルを読んで
 * 出すだけで、文書の中身を信用して実行する立場にない）。
 */

import { defineComponent, h, type PropType, type VNodeChild } from 'vue';

/** md4x の ComarkNode。テキストは文字列、要素は [tag, props, ...children] */
type MarkdownNode = string | MarkdownElement;
type MarkdownElement = [tag: string | null, props: Record<string, unknown>, ...children: MarkdownNode[]];

/**
 * リンクと画像の行き先。`javascript:` などのスキームは通さない。
 * markdown のリンクは本文が持ち込むもので、こちらが用意した値ではない。
 */
const SAFE_URL = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;

function isElement(node: MarkdownNode): node is MarkdownElement {
  return Array.isArray(node);
}

function attributesOf(tag: string, props: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(props)) {
    // `on...` は markdown から来る属性としては筋が通らない。付いていても渡さない
    if (name.startsWith('on')) continue;

    if ((tag === 'a' && name === 'href') || (tag === 'img' && name === 'src')) {
      if (typeof value !== 'string' || !SAFE_URL.test(value)) continue;
    }

    attributes[name] = value;
  }

  // 外部リンクを開いたときに元の画面を触らせない
  if (tag === 'a') {
    attributes.rel = 'noopener noreferrer';
    attributes.target = '_blank';
  }

  return attributes;
}

function render(nodes: MarkdownNode[]): VNodeChild[] {
  const rendered: VNodeChild[] = [];

  for (const node of nodes) {
    if (!isElement(node)) {
      rendered.push(node);
      continue;
    }

    const [tag, props, ...children] = node;

    // 生 HTML。描かずに捨てる
    if (tag === 'html') continue;

    // tag が無いノードは入れ物なので、中身だけ出す
    if (tag === null) {
      rendered.push(...render(children));
      continue;
    }

    rendered.push(
      children.length === 0
        ? h(tag, attributesOf(tag, props))
        : h(tag, attributesOf(tag, props), render(children)),
    );
  }

  return rendered;
}

export default defineComponent({
  name: 'MarkdownNodes',
  props: {
    nodes: { type: Array as PropType<MarkdownNode[]>, required: true },
  },
  setup(props) {
    return () => h('div', { class: 'sb-markdown', 'data-testid': 'document-content' }, render(props.nodes));
  },
});
