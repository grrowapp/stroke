import { describe, expect, it } from 'vitest';

import {
  issueConnectionToken,
  registerConnection,
  removeConnection,
  resolveConnection,
  type ConnectionHeaders,
} from '../../../../server/utils/mcp/connection-table';

function headersWith(token: string | undefined): ConnectionHeaders {
  return token === undefined ? {} : { 'x-stroke-token': token };
}

describe('接続表', () => {
  it('登録→照合→削除の一巡（flontier: sessionId）', () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    expect(resolveConnection(headersWith(token))).toEqual({ ok: true, context: { sessionId: 'session-1' }, token });

    removeConnection(token);
    expect(resolveConnection(headersWith(token)).ok).toBe(false);
  });

  it('登録→照合→削除の一巡（steering: projectPath）', () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });

    expect(resolveConnection(headersWith(token))).toEqual({ ok: true, context: { projectPath: '/opt/projects/example' }, token });

    removeConnection(token);
    expect(resolveConnection(headersWith(token)).ok).toBe(false);
  });

  it('token が推測困難な乱数として、呼ぶたびに違う値になる', () => {
    expect(issueConnectionToken()).not.toBe(issueConnectionToken());
  });

  it('同時に登録された複数の token は互いの文脈が混ざらない（呼び出しは起動単位で識別される）', () => {
    const tokenA = issueConnectionToken();
    const tokenB = issueConnectionToken();
    registerConnection(tokenA, { sessionId: 'session-a' });
    registerConnection(tokenB, { projectPath: '/opt/projects/project-b' });

    expect(resolveConnection(headersWith(tokenA))).toEqual({ ok: true, context: { sessionId: 'session-a' }, token: tokenA });
    expect(resolveConnection(headersWith(tokenB))).toEqual({ ok: true, context: { projectPath: '/opt/projects/project-b' }, token: tokenB });

    removeConnection(tokenA);
    expect(resolveConnection(headersWith(tokenA)).ok).toBe(false);
    // A を消しても B の文脈はそのまま残る
    expect(resolveConnection(headersWith(tokenB))).toEqual({ ok: true, context: { projectPath: '/opt/projects/project-b' }, token: tokenB });

    removeConnection(tokenB);
  });

  it('x-stroke-token ヘッダが配列値で来ても、先頭の値で照合する', () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-array' });

    expect(resolveConnection({ 'x-stroke-token': [token] })).toEqual({ ok: true, context: { sessionId: 'session-array' }, token });

    removeConnection(token);
  });

  it('x-stroke-token ヘッダが無い接続は throw せず 401 unauthorized の結果を返す', () => {
    // throw すると呼び手（ツールハンドラ）の結果が平坦形を保てない（specs mcp/server）
    expect(resolveConnection(headersWith(undefined))).toEqual({
      ok: false,
      status: 401,
      errorCode: 'unauthorized',
      error: 'x-stroke-token ヘッダが無い。',
    });
  });

  it('発行されていない token は throw せず 401 unauthorized の結果を返す', () => {
    expect(resolveConnection(headersWith('never-issued'))).toEqual({
      ok: false,
      status: 401,
      errorCode: 'unauthorized',
      error: '無効な token。',
    });
  });
});
