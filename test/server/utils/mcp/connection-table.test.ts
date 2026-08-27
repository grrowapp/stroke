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

    expect(resolveConnection(headersWith(token))).toEqual({ sessionId: 'session-1' });

    removeConnection(token);
    expect(() => resolveConnection(headersWith(token))).toThrow();
  });

  it('登録→照合→削除の一巡（steering: projectPath）', () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });

    expect(resolveConnection(headersWith(token))).toEqual({ projectPath: '/opt/projects/example' });

    removeConnection(token);
    expect(() => resolveConnection(headersWith(token))).toThrow();
  });

  it('token が推測困難な乱数として、呼ぶたびに違う値になる', () => {
    expect(issueConnectionToken()).not.toBe(issueConnectionToken());
  });

  it('同時に登録された複数の token は互いの文脈が混ざらない（呼び出しは起動単位で識別される）', () => {
    const tokenA = issueConnectionToken();
    const tokenB = issueConnectionToken();
    registerConnection(tokenA, { sessionId: 'session-a' });
    registerConnection(tokenB, { projectPath: '/opt/projects/project-b' });

    expect(resolveConnection(headersWith(tokenA))).toEqual({ sessionId: 'session-a' });
    expect(resolveConnection(headersWith(tokenB))).toEqual({ projectPath: '/opt/projects/project-b' });

    removeConnection(tokenA);
    expect(() => resolveConnection(headersWith(tokenA))).toThrow();
    // A を消しても B の文脈はそのまま残る
    expect(resolveConnection(headersWith(tokenB))).toEqual({ projectPath: '/opt/projects/project-b' });

    removeConnection(tokenB);
  });

  it('x-stroke-token ヘッダが配列値で来ても、先頭の値で照合する', () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-array' });

    expect(resolveConnection({ 'x-stroke-token': [token] })).toEqual({ sessionId: 'session-array' });

    removeConnection(token);
  });

  it('x-stroke-token ヘッダが無い接続は 401 で拒否される', () => {
    try {
      resolveConnection(headersWith(undefined));
      expect.unreachable();
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(401);
    }
  });

  it('発行されていない token は 401 で拒否される', () => {
    try {
      resolveConnection(headersWith('never-issued'));
      expect.unreachable();
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(401);
    }
  });
});
