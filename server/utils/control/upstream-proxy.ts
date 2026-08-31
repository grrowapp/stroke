/**
 * 下層の画面が要る読み取りと保存を、本家との間で仲介する。
 *
 * ブラウザから本家へは触らせない。ここが唯一の経路になる（structure.md の Module Boundaries）。
 * 取れなかった・保存できなかった理由は画面での見せ方が変わるので、まとめて1つのエラーにしない。
 */

import { createError } from 'h3';

import { readServerConfig } from '../config';
import { UpstreamRestClient, type UpstreamFailure } from '../upstream/rest';

export function upstreamClient(): UpstreamRestClient {
  return new UpstreamRestClient(readServerConfig().upstreamBaseUrl);
}

/**
 * 失敗を HTTP に写す。
 *
 * - 未設定 / 繋がらない → 503。本家が動いていないだけで stroke-board の不具合ではない
 * - 無かった → 404。対象が削除・アーカイブされている場合がある（specs/project-workspace）
 * - 形が違った → 502。本家の形が変わった。黙って通さない
 *
 * `error-response`（本家が 404 以外のエラー応答を返した）は、これまで `unreachable` に
 * 畳まれていて 503 になっていた。畳むのをやめても**画面向けの写像は変えない**——ここは
 * 画面が見せる文言と結び付いており、区別を要求しているのは MCP ツール側だけである
 * （`server/utils/mcp/upstream-failure.ts` が本家の状態コードを保持する）。
 */
export function toHttpError(failure: UpstreamFailure): ReturnType<typeof createError> {
  switch (failure.kind) {
    case 'not-configured':
      return createError({
        statusCode: 503,
        statusMessage: 'upstream-not-configured',
        message: '本家ダッシュボードの URL が設定されていない',
      });

    case 'unreachable':
    case 'error-response':
      return createError({
        statusCode: 503,
        statusMessage: 'upstream-unreachable',
        message: `本家に繋がらない: ${failure.reason}`,
      });

    case 'not-found':
      return createError({
        statusCode: 404,
        statusMessage: 'upstream-not-found',
        message: '対象が見つからない',
      });

    case 'malformed':
      return createError({
        statusCode: 502,
        statusMessage: 'upstream-malformed',
        message: `本家のペイロードが想定と違う: ${failure.reason}`,
      });
  }
}
