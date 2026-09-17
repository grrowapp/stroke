/**
 * `modules/markdown/index.ts` の `ModuleOptions` を口として開けたことで、
 * 既定値（旧 `installModule` へのリテラル）が壊れていないかを固定する。
 *
 * `test/modules/markdown/sanitize.test.ts` などは `@nuxtjs/mdc` の `parseMarkdown` を
 * 直接叩くため、`PARSE_OPTIONS` がテスト側の決め打ちで、module の `setup` も
 * `installModule` の第2引数も通らない。ここでは `@nuxt/kit` をモックし、
 * module 本体を実際に呼び出して `installModule('@nuxtjs/mdc', …)` に渡る値を検証する。
 */
import { installModule } from '@nuxt/kit';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@nuxt/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nuxt/kit')>();
  return {
    ...actual,
    installModule: vi.fn(async () => undefined),
    addComponent: vi.fn(),
    createResolver: () => ({ resolve: (path: string) => path }),
  };
});

const installModuleMock = vi.mocked(installModule);

describe('markxdown module — options の既定値', () => {
  it('options を渡さないとき、旧リテラルと同じ値が @nuxtjs/mdc へ渡る', async () => {
    const { default: markxdownModule } = await import('../../../modules/markdown/index');
    const nuxt = { options: { alias: {}, css: [] } } as unknown as Parameters<
      typeof markxdownModule
    >[1];

    await markxdownModule({}, nuxt);

    expect(installModuleMock).toHaveBeenCalledWith('@nuxtjs/mdc', {
      headings: { anchorLinks: false },
      rehypePlugins: { 'rehype-raw': false },
      components: { prose: false, map: { pre: 'MarkdownFence' } },
    });
  });
});
