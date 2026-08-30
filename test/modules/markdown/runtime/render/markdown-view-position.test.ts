// @vitest-environment happy-dom
/**
 * 整形された本文を描くコンポーネント（`#markdown/render/MarkdownView.vue`）が、位置の対応を
 * **外から引ける形で公開している**ことを固定する。
 *
 * 見るのは公開されているかどうかだけである。変換そのものの正しさは
 * `../position/preview.test.ts`（35本）が実物の解析結果で固定しており、ここで重ねない。
 * 重ねると同じことを2箇所で固定して、片方が腐る。
 *
 * **`<MDC>` はスタブに差し替える。** 実物を通すと解析（`parseMarkdown`）と色付け（shiki）を
 * 単体テストへ引き込む。ここで要るのは「器の中に位置の印が在るとき、コンポーネントが
 * それを対応として出せるか」だけなので、`markSourcePosition` が付けるのと同じ形の包みを
 * スタブが直に置く。
 *
 * `#components` と `#imports` は `vitest.config.ts` の alias で解決している。Nuxt を
 * 立てないのは `@vitest-environment nuxt` がこのリポジトリで動かないためで、経緯は
 * `openspec/changes/adr0017-sub-create-position-port-preview/design.md` の決定4にある。
 */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, type VNodeChild } from 'vue';

import type { PositionPort, SourceRange } from '../../../../../modules/markdown/runtime/position/types';
import MarkdownView from '../../../../../modules/markdown/runtime/render/MarkdownView.vue';

/** 2段落。`これは本文です。` が 0..8、`次の段落。` が 10..15 */
const SOURCE = 'これは本文です。\n\n次の段落。\n';

/**
 * `<MDC>` が実際に描かれた回数と、そのとき受け取った props。
 *
 * **これが「解析の段を自前で組み直していない」ことの主の証拠である**
 * （`openspec/changes/adr0017-sub-add-detection-assumptions/design.md` の決定2）。
 * `<MDC>` をやめて `parseMarkdown` を自分で呼ぶ形に戻すと、スタブは一度も作られず
 * `count` が 0 のままになる。
 */
const mdc: { count: number; props: Record<string, unknown> | null } = { count: 0, props: null };

/**
 * `<MDC>` の代わり。解析を走らせず、`markSourcePosition` が付けるのと同じ包みを直に置く。
 * 属性の名前は `../position/source-span.ts` の `SOURCE_START_ATTR` / `SOURCE_END_ATTR` に揃える。
 */
const MDC_STUB = {
  name: 'MDC',
  props: { value: { type: String, default: '' }, parserOptions: { type: Object, default: null } },
  created(this: { value: string; parserOptions: Record<string, unknown> | null }) {
    mdc.count += 1;
    mdc.props = { value: this.value, parserOptions: this.parserOptions };
  },
  template:
    '<div>' +
    '<p><span data-src-start="0" data-src-end="8">これは本文です。</span></p>' +
    '<p><span data-src-start="10" data-src-end="15">次の段落。</span></p>' +
    '</div>',
};

function mountView(value: string | null, stub: unknown = MDC_STUB) {
  return mount(MarkdownView, {
    props: { value },
    attachTo: document.body,
    global: { stubs: { MDC: stub, MDCRenderer: MDCRendererStub } },
  });
}

beforeEach(() => {
  mdc.count = 0;
  mdc.props = null;
  renderedBodies.length = 0;
});

/**
 * `defineExpose` が実際に出したものだけを取り出す。
 *
 * **`wrapper.vm` を見てはならない。** `<script setup>` の `vm` は setup スコープの
 * バインディングをそのままプロキシするので、`defineExpose` を丸ごと外しても
 * `vm.toSourceRange` はローカル関数として引けてしまう（実測。この検査は最初それで
 * 書かれており、`defineExpose` を消しても4本とも緑のままだった）。
 *
 * `instance.exposed` は `defineExpose` が渡したものだけを持つ。外すと中身が空になり、
 * `toSourceRange` を引いた時点で `undefined` になって下の検査が落ちる（実測。
 * `expected 'undefined' to be 'function'` で4本とも赤くなる）。
 */
function exposedOf(wrapper: ReturnType<typeof mountView>): Record<string, unknown> | null {
  return (wrapper.vm.$ as { exposed: Record<string, unknown> | null }).exposed;
}

function portOf(wrapper: ReturnType<typeof mountView>): PositionPort {
  const exposed = exposedOf(wrapper);
  if (!exposed) throw new Error('defineExpose が呼ばれていない');
  return exposed as unknown as PositionPort;
}

// ---------------------------------------------------------------------------
// スロットの中の経路（位置の印が DOM へ出るまで）
// ---------------------------------------------------------------------------

/**
 * `MDCRenderer` へ渡った AST を控える。**印が DOM に出る経路はここを通る。**
 *
 * `#components` の解決先（`test/stubs/nuxt-components.ts`）は何も描かないので、
 * スロットの中を見るテストだけがこのスタブへ差し替える。
 */
const renderedBodies: unknown[] = [];

interface AstNode {
  type: string;
  tag?: string;
  props?: Record<string, unknown>;
  children?: AstNode[];
  value?: string;
  position?: { start: number; end: number };
}

/** AST を DOM へ。`MDCRenderer` が要素と text ノードに対してすることの写し */
function renderNodes(nodes: AstNode[]): VNodeChild[] {
  return nodes.map((node) =>
    node.type === 'text' ? (node.value ?? '') : h(node.tag ?? 'div', node.props ?? {}, renderNodes(node.children ?? [])),
  );
}

const MDCRendererStub = defineComponent({
  name: 'MDCRenderer',
  props: {
    body: { type: Object as () => AstNode, required: true },
    tag: { type: String, default: 'div' },
    data: { type: Object, default: () => ({}) },
    unwrap: { type: [Boolean, String], default: false },
  },
  setup(props) {
    renderedBodies.push(props.body);
    return () => h(props.tag, renderNodes(props.body.children ?? []));
  },
});

/**
 * スロットを描く `<MDC>` の代わり。
 *
 * 実物は解析した AST を `#default` へ渡す。ここは解析を走らせず、手で組んだ AST を渡して
 * **`MarkdownView` がその AST に何をしてから `MDCRenderer` へ送るか**だけを見る。
 */
function slotStub(body: AstNode): unknown {
  return defineComponent({
    name: 'MDC',
    created() {
      mdc.count += 1;
    },
    setup(_props, { slots }) {
      return () => h('div', slots.default?.({ body, data: {} }) ?? []);
    },
  });
}

/**
 * `SOURCE` を解析した結果と同じ形の AST。
 *
 * @param positioned 位置を載せるか。`false` は `keepPosition` が渡らなかった場合
 *   （`parser-options` の経路が消えた場合）の姿
 */
function bodyOf(positioned: boolean): AstNode {
  const text = (value: string, start: number, end: number): AstNode =>
    positioned ? { type: 'text', value, position: { start, end } } : { type: 'text', value };

  return {
    type: 'root',
    children: [
      { type: 'element', tag: 'p', props: {}, children: [text('これは本文です。', 0, 8)] },
      { type: 'element', tag: 'p', props: {}, children: [text('次の段落。', 10, 15)] },
    ],
  };
}

/**
 * 器の中ぜんたいを選ぶ。
 *
 * **`wrapper.element` を器と見なしてはならない。** `MarkdownView` は本文と `#empty` の
 * 2つを根に持つ（片方は `v-if` で消える）ので断片になり、`wrapper.element` は
 * `@vue/test-utils` が被せた親を指すことがある。器は `data-testid` で引く
 * （その既定値は `MarkdownView` の props にある）。
 */
function selectAll(wrapper: ReturnType<typeof mountView>): Range {
  const range = document.createRange();
  range.selectNodeContents(wrapper.get('[data-testid="document-content"]').element);
  return range;
}

/** 器の中に出ている位置の印（`data-src-start` を持つ要素）の数 */
function marksIn(wrapper: ReturnType<typeof mountView>): number {
  return wrapper.element.querySelectorAll('[data-src-start]').length;
}

describe('MarkdownView は位置の対応を公開する', () => {
  it('defineExpose で2つのメソッドだけを公開している', () => {
    const exposed = exposedOf(mountView(SOURCE));

    // `defineExpose` を外すと null になる
    expect(exposed).not.toBeNull();
    expect(typeof exposed!.toSourceRange).toBe('function');
    expect(typeof exposed!.toDomRange).toBe('function');

    // 器の要素そのものを外へ出していないこと（spec「面の内部を見に行けない」）
    expect(Object.keys(exposed!).sort()).toEqual(['toDomRange', 'toSourceRange']);
  });

  it('本文が描かれていなければ、どちらの向きも null を返す', () => {
    // 器そのものが描かれないので、指す先が無い。誤った範囲を返してはならない
    const port = portOf(mountView(null));

    const range = document.createRange();
    range.selectNodeContents(document.body);

    expect(port.toSourceRange(range)).toBeNull();
    expect(port.toDomRange({ start: 0, end: 5 })).toBeNull();
  });

  it('描かれた範囲から生テキストの位置が引ける', () => {
    const wrapper = mountView(SOURCE);
    const port = portOf(wrapper);

    const second = wrapper.element.querySelectorAll('p')[1];
    expect(second).toBeDefined();

    const range = document.createRange();
    range.selectNodeContents(second!);

    expect(port.toSourceRange(range)).toEqual<SourceRange>({ start: 10, end: 15 });
  });

  it('生テキストの位置から描かれた範囲が引ける', () => {
    const port = portOf(mountView(SOURCE));

    const range = port.toDomRange({ start: 10, end: 15 });

    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('次の段落。');
  });
});

describe('解析の段は `<MDC>` に残っている', () => {
  /**
   * **これが主の検知である**（design.md 決定2）。`parseMarkdown` を自分で呼ぶ形に戻すと
   * `<MDC>` は一度も作られず、下の `count` が 0 になって落ちる。
   *
   * 従（ソースの文字列検査）は `../position/silent-failure.test.ts` の「件1」が持つ。
   * あちらは書き方に依存するので補助に留め、ここでは**実際に描かれたか**で見る。
   */
  it('本文があれば `<MDC>` が実際に描かれる', () => {
    mountView(SOURCE);

    expect(mdc.count, '`<MDC>` が一度も描かれていない。解析を自前で組み直していないか').toBe(1);
  });

  it('本文が無ければ `<MDC>` は描かれない（器ごと出ない）', () => {
    mountView(null);

    expect(mdc.count).toBe(0);
  });

  /**
   * `keepPosition` は `parser-options` からしか渡らない（module の `ModuleOptions` には
   * 無い。`@nuxtjs/mdc/dist/module.d.mts` の 63行目と 126行目）。**この経路が消えると
   * AST に位置が乗らず、印も DOM に出ない。**
   */
  it('`parser-options` で `keepPosition` を渡している', () => {
    mountView(SOURCE);

    expect(mdc.props).toEqual({ value: SOURCE, parserOptions: { keepPosition: true } });
  });
});

describe('位置の印が DOM へ出る経路', () => {
  /**
   * 経路は「`keepPosition` で位置の乗った AST → `markSourcePosition` → `MDCRenderer`」の
   * 一本道である。どこが切れても印は DOM に出ない。ここはその一本道を、スロットへ AST を
   * 直に渡して端から端まで通す。
   */
  it('スロットへ来た AST は、包まれてから `MDCRenderer` へ渡る', () => {
    const wrapper = mountView(SOURCE, slotStub(bodyOf(true)));

    // `markSourcePosition` を外すと 0 になる
    expect(marksIn(wrapper), '位置の印が DOM に1つも出ていない').toBe(2);
    expect(renderedBodies, '`MDCRenderer` へ渡っていない').toHaveLength(1);
    // 渡ったのは包んだ後の AST。元の AST をそのまま送っていたら包みが無い
    expect(JSON.stringify(renderedBodies[0])).toContain('data-src-start');
  });

  it('印が出ていれば、器ぜんたいの選択が本文の端から端までを指す', () => {
    const wrapper = mountView(SOURCE, slotStub(bodyOf(true)));

    expect(portOf(wrapper).toSourceRange(selectAll(wrapper))).toEqual<SourceRange>({ start: 0, end: 15 });
  });

  /**
   * **印が1つも無いと、`null` に倒れず切り詰めた範囲が返る**
   * （`openspec/changes/adr0017-sub-create-position-port-preview/design.md` の R6。実測）。
   *
   * 包みが無い面でも、先頭の字だけは照合で拾い直せる（`preview.ts` の「位置を落とすのは
   * 生テキストの先頭から始まるノードだけ」の手当て）。拾えるのは生テキストの頭と食い違う
   * ところまでなので、ここでは1段落めの `0..8` で止まる。**選んだのは本文ぜんたい（0..15
   * 相当）なのに、返るのはその一部である。**
   *
   * つまり `parser-options` の経路が消えても、位置の対応は黙って狭い範囲を返し続ける。だから
   * 上の2つ（印が出ていること）が要る。**この it は誤りを是としているのではなく、
   * 「印が消えたときに何が起きるか」を実測のまま留めるためのものである。**
   */
  it('印が1つも無いと、器ぜんたいを選んでも切り詰めた範囲が返る（`null` にならない）', () => {
    const wrapper = mountView(SOURCE, slotStub(bodyOf(false)));

    expect(marksIn(wrapper)).toBe(0);
    expect(portOf(wrapper).toSourceRange(selectAll(wrapper))).toEqual<SourceRange>({ start: 0, end: 8 });
  });
});
