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
import { describe, expect, it } from 'vitest';

import type { PositionPort, SourceRange } from '../../../../../modules/markdown/runtime/position/types';
import MarkdownView from '../../../../../modules/markdown/runtime/render/MarkdownView.vue';

/** 2段落。`これは本文です。` が 0..8、`次の段落。` が 10..15 */
const SOURCE = 'これは本文です。\n\n次の段落。\n';

/**
 * `<MDC>` の代わり。解析を走らせず、`markSourcePosition` が付けるのと同じ包みを直に置く。
 * 属性の名前は `../position/source-span.ts` の `SOURCE_START_ATTR` / `SOURCE_END_ATTR` に揃える。
 */
const MDC_STUB = {
  name: 'MDC',
  template:
    '<div>' +
    '<p><span data-src-start="0" data-src-end="8">これは本文です。</span></p>' +
    '<p><span data-src-start="10" data-src-end="15">次の段落。</span></p>' +
    '</div>',
};

function mountView(value: string | null) {
  return mount(MarkdownView, {
    props: { value },
    attachTo: document.body,
    global: { stubs: { MDC: MDC_STUB } },
  });
}

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
