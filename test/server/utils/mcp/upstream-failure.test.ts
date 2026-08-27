import { describe, expect, it } from 'vitest';

import { describeUpstreamFailure } from '../../../../server/utils/mcp/upstream-failure';

describe('describeUpstreamFailure', () => {
  it('not-found（本家は到達できて「無い」と答えた）は unreachable に潰さず実ステータスを保持する', () => {
    const result = describeUpstreamFailure({ kind: 'not-found', path: '/api/projects/PID1/info' });
    expect(result).toEqual({ status: 404, errorCode: 'upstream_error', error: '対象が見つからない' });
  });

  it('not-found で本家の実応答本文（detail）が取れていれば、固定文言で上書きせずそのまま使う', () => {
    const result = describeUpstreamFailure({
      kind: 'not-found',
      path: '/api/projects/PID1/info',
      detail: 'Project not found',
    });
    expect(result).toEqual({ status: 404, errorCode: 'upstream_error', error: 'Project not found' });
  });

  it('unreachable（本家に届かない）は 502 に固定する', () => {
    const result = describeUpstreamFailure({ kind: 'unreachable', path: '/api/projects/PID1/info', reason: 'ECONNREFUSED' });
    expect(result).toEqual({ status: 502, errorCode: 'unreachable', error: '本家に繋がらない: ECONNREFUSED' });
  });

  it('not-configured（本家の URL 未設定）も unreachable として扱う', () => {
    const result = describeUpstreamFailure({ kind: 'not-configured' });
    expect(result).toEqual({
      status: 502,
      errorCode: 'unreachable',
      error: '本家ダッシュボードの URL が設定されていない',
    });
  });

  it('malformed（応答の形が想定と違う）も unreachable として扱う', () => {
    const result = describeUpstreamFailure({ kind: 'malformed', path: '/api/projects/PID1/info', reason: '型が違う' });
    expect(result).toEqual({
      status: 502,
      errorCode: 'unreachable',
      error: '本家のペイロードが想定と違う: 型が違う',
    });
  });
});
