import { vi } from 'vitest';

/**
 * endpoint（`server/api/**`）を素の vitest から直に呼ぶための最小の足場。
 *
 * endpoint は Nitro の自動 import（`defineEventHandler` / `readBody` / `createError` /
 * `setResponseStatus` / `getRouterParam`）を全域の名前として使う。バニラの vitest には
 * その実行時が無く、モジュールを読み込んだ瞬間に `defineEventHandler is not defined` で
 * 落ちるため、**import より前に**この関数で全域へ最小の実装を置く。
 *
 * 置いたものは h3 の再実装ではない。応答のステータス・本文といった、契約
 * （`docs/specs/api/contract.md`）が定める観測点だけを取り出せれば足りる。
 *
 * **`setResponseStatus` だけは全域では捕まらない。** これは Nuxt アプリ側の自動 import
 * にも同じ名前があり（`.nuxt/imports.d.ts`: `#app/composables/ssr`）、vitest の設定は
 * Nuxt のクライアント側 vite 設定から作られるため、endpoint にもそちらが差し込まれる。
 * その実体は `import.meta.client` で即 return する空実装なので、呼ばれても何も起きない
 * （実測: ステータスが `undefined` のままになる）。差し込み先を丸ごと差し替える1行を
 * テストファイルごとに置くこと（`vi.mock` は巻き上げられるのでここへは持ち込めない）:
 * ```ts
 * vi.mock('#app/composables/ssr', () => ({
 *   setResponseStatus: (event: FakeEvent, status: number) => { event.status = status },
 * }))
 * ```
 * 本番の Nitro では h3 の実装が入るので、この読み替えはテスト実行時だけのものである。
 *
 * 使い方（`vi.mock` と違って巻き上げられないので、`await import()` より前に呼ぶ）:
 * ```ts
 * stubNitroGlobals()
 * const { default: handler } = await import('../../../../server/api/...') // 段数はテストの位置で決まる
 * ```
 */
export function stubNitroGlobals(): void {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
  vi.stubGlobal('getRouterParam', (event: FakeEvent, name: string) => event.params[name]);
  vi.stubGlobal('readBody', async (event: FakeEvent) => event.body);
  vi.stubGlobal(
    'createError',
    (input: { statusCode: number; message: string }) => Object.assign(new Error(input.message), input),
  );
  vi.stubGlobal('setResponseStatus', (event: FakeEvent, status: number) => {
    event.status = status;
  });
}

/** 呼び出し1回分の要求。ハンドラは中身を覗かないので、観測に要る3つだけを持つ。 */
export interface FakeEvent {
  params: Record<string, string>;
  body: unknown;
  /** `setResponseStatus` が書き込む。未設定なら endpoint がステータスを触っていない */
  status: number | undefined;
}

/** パスパラメータ `id` と本文を持つ要求を1つ組み立てる。 */
export function fakeEvent(id: string, body: unknown): FakeEvent {
  return { params: { id }, body, status: undefined };
}
