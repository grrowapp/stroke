import { createFetchError } from 'ofetch';
import { describe, expect, it } from 'vitest';

import { readFetchFailure } from '../../../../server/utils/mcp/fetch-failure';

function fetchErrorWith(status: number, data: unknown): unknown {
  return createFetchError({
    request: '/api/example',
    options: {},
    response: { status, statusText: 'Error', _data: data } as never,
  } as never);
}

describe('readFetchFailure', () => {
  it('endpoint が返した message をそのまま渡す（書き換え・省略・追加をしない）', () => {
    const error = fetchErrorWith(404, { message: 'そのセッションは無い。' });
    expect(readFetchFailure(error)).toEqual({ status: 404, message: 'そのセッションは無い。' });
  });

  it('message フィールドが無いレスポンスは FetchError 自身のメッセージにフォールバックする', () => {
    const error = fetchErrorWith(500, { other: 'field' });
    const result = readFetchFailure(error);
    expect(result.status).toBe(500);
    expect(typeof result.message).toBe('string');
  });

  it('status を持たない失敗（FetchError ではない）でも投げ返さず、502 と例外のメッセージを返す', () => {
    // 投げ返すとツールハンドラの外へ抜け、結果が status も errorCode も持たない
    // isError テキストに畳まれてしまう（mcp/server の平坦形式の SHALL は無条件）
    const error = new Error('接続が成立しない');
    expect(readFetchFailure(error)).toEqual({ status: 502, message: '接続が成立しない' });
  });

  it('Error ですらない値が投げられても平坦な失敗として返す', () => {
    expect(readFetchFailure('壊れた何か')).toEqual({ status: 502, message: '壊れた何か' });
  });
});
