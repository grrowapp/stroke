import { describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, structuredResult, withHeaders } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getSteeringGuideTool } = await import('../../../../server/mcp/tools/get-steering-guide');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');

const call = (headers: Record<string, string>) => structuredResult(getSteeringGuideTool.handler({}, withHeaders(headers)));

/** 節ごとに、その節へ入っていなければならない内容（`get-guide.test.ts` と同じ考え）。 */
const REQUIRED: Array<[string, RegExp[], number]> = [
  ['状況を確認', [/get-steering/, /exists: false/, /exists: true/, /上書き/], 100],
  ['書く順序', [/product → 承認依頼 → tech → 承認依頼 → structure/, /1本ずつ/], 120],
  // 承認依頼（3-1）は「提出する」の小節なので、同じ節の中に在る（`sectionBodies` は `## ` で
  // 割るため `### ` は親の節に含まれる）。本家 `approvals` の引数と「承認を待たない」を固定する
  ['提出する', [
    /submit-document/, /type: "steering"/, /product/,
    /approvals/, /action.*"request"/, /\.spec-workflow\/steering\/<name>\.md/,
    /type.*"document"/, /category.*"steering"/, /categoryName.*"steering"/,
    /受理された文書にだけ/, /承認を待たない/,
  ], 400],
  ['終わりとみなす基準', [/書き終わり|終わりである/], 75],
  ['うまくいかないとき', [
    /errorCode/, /project_not_registered/, /unreachable/,
    /upstream_error/, /upstream_malformed/, /connection_mismatch/,
    /直接書いて/, /approvals.*status.*errorCode.*持たない/s,
  ], 560],
  ['どこで工程が終わるか', [/3本/, /承認依頼/, /承認の結果は終わりの条件に含まれない/], 80],
  // 本家 MCP で使うのは `approvals`（update-invoke-agent-responsibility-boundary design D4）
  ['本家 MCP で使うのは `approvals`', [/approvals/, /stroke-board/, /登録済み/, /承認依頼/], 150],
  ['やらないこと', [/直接読み書き/, /承認依頼を出さずに終わらない/], 50],
];
/**
 * 手順が**節として**書かれていることを見る。
 *
 * このテストが見るのは4つだけである。
 *
 * 1. 決めた節が在ること
 * 2. 節の並びが入れ替わっていないこと
 * 3. その節に要る語が**その節の中に**在ること（節をまたいだ部分一致では見ない）
 * 4. 節が痩せていないこと（節ごとの最低の長さ）
 *
 * **見ないもの: 意味である。** 部分文字列の一致でしかないので、「叩かない」を
 * 「叩かない、という決まりは無い」に書き換えるような**規範の反転は通り抜ける**
 * （変異試験で確認。santa-method レビュー指摘 12周目 2026-08-31）。これは正規表現を
 * 足しても塞げない種類の穴なので、塞げるふりをしない。
 *
 * 手順が**指示として正しいか**は、実機で1周させてエージェントがそのとおりに動くかで見る
 * （各 change の検証の章）。ここで見ているのは、節ごと消えたり中身が抜けたりしていないこと
 * ——**書き換えの事故**であって、悪意ある書き換えではない。
 */
function sectionBodies(guide: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const parts = guide.split(/^## /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\\n');
    bodies.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
  }
  return bodies;
}

describe('get-steering-guide', () => {
  it('引数を1つも渡さない呼び出しを inputSchema が通す', () => {
    expect(acceptsEmptyArgs(getSteeringGuideTool.inputSchema)).toBe(true);
  });

  it('有効な token なら status:200 と手順の本文を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/setai' });

    const result = await call({ 'x-stroke-token': token }) as { status: number, guide: string };

    expect(result.status).toBe(200);
    expect(result.guide.length).toBeGreaterThan(0);
    removeConnection(token);
  });

  it('接続表に無い token は 401 を平坦な結果として返す（例外にしない）', async () => {
    expect(await call({ 'x-stroke-token': 'never-issued' })).toEqual({
      status: 401,
      errorCode: 'unauthorized',
      error: '無効な token。',
    });
  });

  it('token ヘッダが無い呼び出しも 401 を平坦な結果として返す', async () => {
    expect(await call({})).toMatchObject({ status: 401, errorCode: 'unauthorized' });
  });

  it('プロジェクトパスを持たない接続でも手順は返る（状態に依存しない）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    expect(await call({ 'x-stroke-token': token })).toMatchObject({ status: 200 });
    removeConnection(token);
  });

  it('説明が「先に呼べ」と述べ、承認依頼の出し方を含むと述べている', () => {
    expect(getSteeringGuideTool.description).toMatch(/先に/);
    expect(getSteeringGuideTool.description).toMatch(/承認依頼/);
  });

  it('手順が節ごとに書かれ、それぞれの節に要る内容が入っている', async () => {
    // 何を見て何を見ないかは `sectionBodies` の説明にある
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/setai' });

    const { guide } = await call({ 'x-stroke-token': token }) as { guide: string };
    const bodies = sectionBodies(guide);
    const headings = [...bodies.keys()];

    for (const [section, patterns, minLength] of REQUIRED) {
      const found = headings.find(h => h.includes(section));
      expect(found, `節「${section}」が無い`).toBeDefined();
      const body = bodies.get(found!) ?? '';
      // 最低の長さは実際の分量の6割ほど。**書き足すのは自由で、抜くと落ちる**
      expect(body.length, `節「${section}」の中身が抜けている`).toBeGreaterThanOrEqual(minLength);
      for (const pattern of patterns) {
        expect(body, `節「${section}」に ${pattern} が無い`).toMatch(pattern);
      }
    }

    // 節の並びが入れ替わっていない
    const order = REQUIRED.map(([section]) => headings.findIndex(h => h.includes(section)));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    removeConnection(token);
  });
});
