import { vi } from 'vitest';

import type { AccessUser } from '../../../shared/access';

/**
 * endpoint（`server/api/**`）を素の vitest から直に呼ぶための最小の足場。
 *
 * endpoint は Nitro の自動 import（`defineEventHandler` / `readBody` / `createError` /
 * `setResponseStatus` / `getRouterParam` / `getHeader`）を全域の名前として使う。バニラの vitest には
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
  vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.headers?.[name.toLowerCase()]);
  vi.stubGlobal(
    'createError',
    (input: { statusCode: number; message: string }) => Object.assign(new Error(input.message), input),
  );
  vi.stubGlobal('setResponseStatus', (event: FakeEvent, status: number) => {
    event.status = status;
  });
}

/** 呼び出し1回分の要求。ハンドラは中身を覗かないので、観測に要るものだけを持つ。 */
export interface FakeEvent {
  params: Record<string, string>;
  body: unknown;
  /** `setResponseStatus` が書き込む。未設定なら endpoint がステータスを触っていない */
  status: number | undefined;
  /** 小文字のヘッダ名 → 値。`getHeader` が読む（A5・A7 の `x-stroke-token` など） */
  headers?: Record<string, string>;
  /**
   * `event.context`。利用者の判定（`server/utils/access/request.ts` の `accessUserOf`）は
   * ここに求めた結果を置く。既定では管理者を置いておき、判定を見ない test が判定に掛からない
   * ようにする。
   */
  context: { accessUser?: Promise<AccessUser> };
}

/** 判定を見ない test が置く利用者。管理者なので、どの対象も見られる */
export const ADMIN_USER: AccessUser = { email: null, admin: true, projects: [] };

/** パスパラメータ `id` と本文を持つ要求を1つ組み立てる。 */
export function fakeEvent(id: string, body: unknown, headers?: Record<string, string>): FakeEvent {
  return {
    params: { id },
    body,
    status: undefined,
    context: { accessUser: Promise.resolve(ADMIN_USER) },
    ...(headers === undefined ? {} : { headers }),
  };
}
