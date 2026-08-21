/**
 * 接点層に書き込み系が入り込んでいないことを機械的に確かめる（tasks.md 9.4）。
 *
 * 認証を持たないまま外部公開するため、読み取り専用であることをコードの形で担保している
 * （design.md 決定11）。目視で守る約束はいずれ破られるので、テストで固定する。
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const UPSTREAM_DIR = join(process.cwd(), 'server/utils/upstream');

/** 本家が持つ書き込み系のエンドポイント。呼ぶ関数を置かないと決めている */
const FORBIDDEN_UPSTREAM_WRITES = [
  '/api/projects/add',
  'approvals/batch',
  'implementation-log',
  '/archive',
  '/unarchive',
  '/snapshot',
];

/** ファイルへ書く API。`.spec-workflow/` にも本家にも書かない */
const FORBIDDEN_FS_WRITES = [
  'writeFile',
  'appendFile',
  'mkdir',
  'rm(',
  'rmdir',
  'unlink',
  'rename',
  'copyFile',
  'createWriteStream',
];

async function sourceFiles(): Promise<{ name: string; content: string }[]> {
  const entries = await readdir(UPSTREAM_DIR, { withFileTypes: true });

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.'));

  return Promise.all(
    files.map(async (entry) => ({
      name: entry.name,
      content: await readFile(join(UPSTREAM_DIR, entry.name), 'utf-8'),
    })),
  );
}

describe('接点層は読み取り専用である', () => {
  it('検査対象のファイルが存在する', async () => {
    const files = await sourceFiles();
    expect(files.map((file) => file.name).sort()).toEqual([
      'registry.ts',
      'rest.ts',
      'scan.ts',
      'schema.ts',
      'socket.ts',
    ]);
  });

  it('HTTP の書き込みメソッドを使っていない', async () => {
    for (const file of await sourceFiles()) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(file.content, `${file.name} に ${method} がある`).not.toContain(`'${method}'`);
        expect(file.content, `${file.name} に ${method} がある`).not.toContain(`"${method}"`);
      }
    }
  });

  it('本家の書き込み系エンドポイントを参照していない', async () => {
    // 本家の URL を組み立てるのは rest.ts だけ。schema.ts が持つ
    // `implementation-log-update` は受信するメッセージの種別であって書き込み先ではない
    const rest = await readFile(join(UPSTREAM_DIR, 'rest.ts'), 'utf-8');

    for (const path of FORBIDDEN_UPSTREAM_WRITES) {
      expect(rest, `rest.ts が ${path} に触れている`).not.toContain(path);
    }
  });

  it('ファイルへ書く API を使っていない', async () => {
    for (const file of await sourceFiles()) {
      for (const api of FORBIDDEN_FS_WRITES) {
        expect(file.content, `${file.name} が ${api} を使っている`).not.toContain(api);
      }
    }
  });

  it('REST クライアントが公開しているのは読み取りだけである', async () => {
    const rest = await readFile(join(UPSTREAM_DIR, 'rest.ts'), 'utf-8');

    // インデント2の `name(` は公開メソッド。private は `private` が前に付くので拾わない
    const methods = [...rest.matchAll(/^ {2}(\w+)\(/gm)].map((match) => match[1]);

    expect(methods.sort()).toEqual([
      'constructor',
      'getApprovalContent',
      'getProjectInfo',
      'getSpecDocuments',
      'getSteeringDocument',
      'getTaskProgress',
      'listPendingApprovals',
      'listSpecs',
    ]);
  });
});
