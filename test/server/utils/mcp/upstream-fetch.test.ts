import { createFetchError } from 'ofetch';
import { describe, expect, it } from 'vitest';

import { classifySteeringFailure } from '../../../../server/utils/mcp/upstream-fetch';

function fetchErrorWith(status: number, data: unknown): unknown {
  return createFetchError({
    request: '/api/example',
    options: {},
    response: { status, statusText: 'Error', _data: data } as never,
  } as never);
}

describe('classifySteeringFailure', () => {
  it('400 は validation_error として実応答をそのまま持つ', () => {
    const result = classifySteeringFailure(fetchErrorWith(400, { error: 'Invalid steering document name' }));
    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: 'Invalid steering document name' });
  });

  it('本家が到達できて答えた 500 は unreachable に潰さず実ステータスを保持する', () => {
    const result = classifySteeringFailure(fetchErrorWith(500, { error: 'Failed to save steering document' }));
    expect(result).toEqual({ status: 500, errorCode: 'upstream_error', error: 'Failed to save steering document' });
  });

  it('status を持たない失敗（接続不可）は unreachable(502) にする', () => {
    const result = classifySteeringFailure(new Error('connect ECONNREFUSED'));
    expect(result).toEqual({ status: 502, errorCode: 'unreachable', error: 'connect ECONNREFUSED' });
  });
});
