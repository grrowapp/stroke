// @vitest-environment happy-dom
/**
 * `MarkdownView` が `sourceShown`（図に生テキストを添えたい範囲）を、**降ろす前に解析側の
 * 座標へ写している**ことを固定する。
 *
 * **なぜ要るか。** 外から渡る範囲は `props.value`（本家から取得したままの文字列）を基準に
 * している（`../position/types.ts`）。一方、フェンス側が突き合わせる `data-src-*` は
 * `parseMarkdown` が実際に解析した文字列を指す。`parseMarkdown` は解析の前に CRLF を潰し、
 * front matter を落とすので、この2つは食い違う。返す側（`toSourceRange` / `toDomRange`）
 * だけを写すと、ここが新しい食い違いの置き場になる
 * （`openspec/changes/adr0017-sub-fix-normalization-offset/design.md` の決定4）。
 *
 * 写像そのものの正しさは `../position/normalize.test.ts` が固定しているので、ここでは
 * 重ねない。見るのは**降ろす経路が写像を通っているか**だけである。
 *
 * **期待値は数え上げで書かない。** 解析される文字列を、解析する側と同じ2手続き
 * （CRLF を潰す → `parseFrontMatter`）で作り、その中の位置を `indexOf` で引く。本文を
 * 書き換えても壊れない。
 */
import { mount } from '@vue/test-utils';
import { parseFrontMatter } from 'remark-mdc';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, inject, toValue } from 'vue';

import { SOURCE_SHOWN_KEY, useSourceShown } from '../../../../../modules/markdown/runtime/render/source-shown';
import MarkdownView from '../../../../../modules/markdown/runtime/render/MarkdownView.vue';

import type { SourceRange } from '../../../../../modules/markdown/runtime/position/types';

/**
 * 前置きが長い文書。**落ちる量がフェンスの長さを超える**ように作ってある。
 *
 * こう作ると、写さずに降ろした範囲はフェンスと重ならなくなる。写像が載っていることが
 * 図の添え書きの成否を実際に左右する配置であり、下の「写さないと重ならない」で確かめる。
 */
const FRONT_MATTER_DOC = [
  '---',
  'title: 長めの前置きを持つ文書',
  'author: someone',
  'reviewers: [a, b]',
  '---',
  '',
  '```mermaid',
  'graph TD',
  '  A --> B',
  '```',
  '',
].join('\n');

/** 改行が CRLF の文書。前置きは無い */
const CRLF_DOC = ['# 見出し', '', '本文の段落。', '', '```mermaid', 'graph TD', '  A --> B', '```', ''].join('\r\n');

/** 前置きと CRLF の両方を持つ文書 */
const BOTH_DOC = ['---', 'title: 前置きも CRLF もある', '---', '', '```mermaid', 'graph TD', '```', ''].join('\r\n');

/**
 * 解析される文字列。**解析する側と同じ2手続きで作る**（`@nuxtjs/mdc` の
 * `dist/runtime/parser/index.js`）。写像の実装を呼ばずに作るので、期待値が実装の写しに
 * ならない。
 */
function parsedOf(given: string): string {
  return parseFrontMatter(given.replace(/\r\n/g, '\n')).content;
}

/** 文字列の中のフェンスの範囲（開きの ``` から閉じの ``` の後ろまで） */
function fenceRangeIn(text: string): SourceRange {
  const start = text.indexOf('```mermaid');
  const end = text.indexOf('```', start + 3) + 3;
  return { start, end };
}

/** 2つの範囲が重なるか。`source-shown.ts` の `overlaps` と同じ判定 */
function overlaps(a: SourceRange, b: SourceRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** 降ろされた範囲と、フェンスに添えるかどうかの判定の結果を控える */
const probe: { ranges: readonly SourceRange[] | null; shown: boolean | null } = { ranges: null, shown: null };

/**
 * `MarkdownView` の子として置く見張り。**フェンスの居る場所に立って、降ろされた値を見る。**
 *
 * `fence` には解析側の座標のフェンスの範囲を渡す。実物では `readFenceRange` が
 * `data-src-*` から読む値で、これも解析側の座標である。
 */
function probeFor(fence: SourceRange) {
  return defineComponent({
    name: 'Probe',
    setup() {
      const injected = inject(SOURCE_SHOWN_KEY, [] as readonly SourceRange[]);
      const visible = useSourceShown(() => fence);

      probe.ranges = [...toValue(injected)];
      probe.shown = visible.value;

      return () => h('span');
    },
  });
}

/**
 * `<MDC>` の代わりに見張りを描く。
 *
 * 実物の `<MDC>` は解析を走らせる。ここで要るのは「`MarkdownView` の中に立った子へ何が
 * 降りてくるか」だけなので、解析を通さず見張りだけを置く。
 */
function mdcStubRendering(child: ReturnType<typeof probeFor>) {
  return defineComponent({
    name: 'MDC',
    setup() {
      return () => h(child);
    },
  });
}

function mountWith(value: string, sourceShown: readonly SourceRange[], fence: SourceRange) {
  probe.ranges = null;
  probe.shown = null;

  return mount(MarkdownView, {
    props: { value, sourceShown },
    attachTo: document.body,
    global: { stubs: { MDC: mdcStubRendering(probeFor(fence)) } },
  });
}

/** 渡された文字列の座標で、フェンスの頭を指す範囲 */
function headOfFence(given: string): SourceRange {
  const { start } = fenceRangeIn(given);
  // ``` と言語名の途中まで。改行を跨がないので CRLF の文書でも長さが変わらない
  return { start, end: start + 6 };
}

describe.each([
  ['front matter を持つ文書', FRONT_MATTER_DOC],
  ['CRLF の文書', CRLF_DOC],
  ['前置きと CRLF の両方を持つ文書', BOTH_DOC],
])('%s では、降ろす前に解析側の座標へ写す', (_name, given) => {
  const parsed = parsedOf(given);
  const fenceInParsed = fenceRangeIn(parsed);
  const wanted = headOfFence(given);

  /** 上の `wanted` を解析側の座標で書いたもの */
  const wantedInParsed: SourceRange = {
    start: fenceInParsed.start,
    end: fenceInParsed.start + (wanted.end - wanted.start),
  };

  it('渡された座標のままでは降りてこない', () => {
    mountWith(given, [wanted], fenceInParsed);

    // 写しを外すと、ここに `wanted` がそのまま降りてきて落ちる
    expect(probe.ranges).toEqual<SourceRange[]>([wantedInParsed]);
    // 写す前と後で値が違うこと。同じなら、この文書はこの検査の役に立っていない
    expect(wantedInParsed).not.toEqual(wanted);
  });

  it('写した範囲がフェンスと重なるので、生テキストが添えられる', () => {
    mountWith(given, [wanted], fenceInParsed);

    expect(probe.shown).toBe(true);
  });
});

describe('写しが載っていることが、添えるかどうかを実際に左右する', () => {
  /**
   * 前置きが長い文書では、**落ちる量がフェンスの長さを超える**ので、写さずに降ろした範囲は
   * フェンスと重ならない。つまりこの文書では、写しを外すと図に生テキストが添わなくなる。
   *
   * CRLF だけの文書では落ちる量が小さく、写さなくても重なりが残ることがある。だから
   * 上の「渡された座標のままでは降りてこない」（値そのものを見る検査）が主で、これは
   * 写しが効いている場面を1つ実際に示すものである。
   */
  it('写さずに降ろした範囲は、前置きの長い文書ではフェンスと重ならない', () => {
    const parsed = parsedOf(FRONT_MATTER_DOC);
    const fenceInParsed = fenceRangeIn(parsed);
    const wanted = headOfFence(FRONT_MATTER_DOC);

    expect(overlaps(wanted, fenceInParsed), '写しが要らない配置になっている').toBe(false);
  });
});

describe('写せない範囲は落とす', () => {
  /**
   * 落とされた前置きの中を指す範囲は、解析側に対応する位置が無い。**推測で添えない**
   * （`readFenceRange` が読めないときに図だけを出す既存の構えと同じ）。
   */
  it('前置きの中を指す範囲は降りてこない', () => {
    const parsed = parsedOf(FRONT_MATTER_DOC);
    const fenceInParsed = fenceRangeIn(parsed);

    const inFrontMatter: SourceRange = { start: FRONT_MATTER_DOC.indexOf('title'), end: FRONT_MATTER_DOC.indexOf('title') + 5 };

    mountWith(FRONT_MATTER_DOC, [inFrontMatter], fenceInParsed);

    expect(probe.ranges).toEqual([]);
    expect(probe.shown).toBe(false);
  });

  it('写せる範囲と写せない範囲が混ざっていたら、写せるものだけが降りる', () => {
    const parsed = parsedOf(FRONT_MATTER_DOC);
    const fenceInParsed = fenceRangeIn(parsed);
    const wanted = headOfFence(FRONT_MATTER_DOC);
    const inFrontMatter: SourceRange = {
      start: FRONT_MATTER_DOC.indexOf('title'),
      end: FRONT_MATTER_DOC.indexOf('title') + 5,
    };

    mountWith(FRONT_MATTER_DOC, [inFrontMatter, wanted], fenceInParsed);

    expect(probe.ranges).toHaveLength(1);
    expect(probe.shown).toBe(true);
  });
});
