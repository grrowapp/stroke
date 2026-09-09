/**
 * 接点層の書き込みが、決めた4つに限られていることを機械的に確かめる。
 *
 * 通すのは次の4つだけである。
 *
 * - `POST /approvals/:id/:action` — 承認への応答
 * - `PUT /specs/:name/:document` — 仕様書の文書の保存（specs/document-editing）
 * - `PUT /steering/:name` — ステアリング文書の保存（同上）
 * - `POST /api/projects/add` — プロジェクトの登録（specs/api/project/generate。
 *   update-project-generation-via-upstream-rest）
 *
 * ファイルに触るのは本家であり、stroke-board が `.spec-workflow/` を直接書くことは
 * 無い（ADR-0005）。登録で `.spec-workflow/approvals/` を作るのも本家である。
 *
 * 「4つだけ」は目視では守れないので、ここで固定する。書き込み口を増やすときは、
 * このテストを通らないと増やせない。
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const UPSTREAM_DIR = join(process.cwd(), 'server/utils/upstream');

/** 本家が持つ書き込み系のうち、呼ぶ関数を置かないと決めているもの（登録の解除を含む） */
const FORBIDDEN_UPSTREAM_WRITES = [
  'approvals/batch',
  'implementation-log',
  '/archive',
  '/unarchive',
  '/snapshot',
];
// タスクの状態更新（`PUT /tasks/:taskId/status`）は読み取りの `tasks/progress` と
// 文字列が重なるので、ここではなく「PUT を使わない」検査の側で押さえている

/** ファイルへ書く API。stroke-board は自分ではファイルに触らない */
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

describe('接点層の書き込みは決めた4つだけである', () => {
  it('検査対象のファイルが存在する', async () => {
    const files = await sourceFiles();
    expect(files.map((file) => file.name).sort()).toEqual([
      'project-id.ts',
      'registry.ts',
      'rest.ts',
      'scan.ts',
      'schema.ts',
      'socket.ts',
    ]);
  });

  it('書き込みメソッドを使うのは rest.ts だけである', async () => {
    for (const file of await sourceFiles()) {
      if (file.name === 'rest.ts') continue;

      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(file.content, `${file.name} に ${method} がある`).not.toContain(`'${method}'`);
        expect(file.content, `${file.name} に ${method} がある`).not.toContain(`"${method}"`);
      }
    }
  });

  it('rest.ts が使う書き込みメソッドは POST と PUT だけである', async () => {
    const rest = await readFile(join(UPSTREAM_DIR, 'rest.ts'), 'utf-8');

    for (const method of ['PATCH', 'DELETE']) {
      expect(rest, `rest.ts に ${method} がある`).not.toContain(`'${method}'`);
    }

    // POST は承認への応答とプロジェクトの登録の2か所。増えていたら書き込み口が増えている
    expect([...rest.matchAll(/method: 'POST'/g)]).toHaveLength(2);
    // 登録の解除（DELETE /api/projects/:projectId）は置かない
    expect(rest).not.toContain("method: 'DELETE'");

    // PUT は保存の共通処理1か所。仕様書とステアリングの2つがここを通る
    expect([...rest.matchAll(/method: 'PUT'/g)]).toHaveLength(1);
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

  it('REST クライアントが公開しているのは読み取りと決めた書き込みだけである', async () => {
    const rest = await readFile(join(UPSTREAM_DIR, 'rest.ts'), 'utf-8');

    // インデント2の `name(` は公開メソッド。private は `private` が前に付くので拾わない
    const methods = [...rest.matchAll(/^ {2}(?:async )?(\w+)\(/gm)].map((match) => match[1]);

    expect(methods.sort()).toEqual([
      'constructor',
      'getApprovalContent',
      'getProjectInfo',
      'getSpecDocuments',
      'getSteeringDocument',
      'getTaskProgress',
      'listPendingApprovals',
      'listProjects',
      'listSpecs',
      'registerProject',
      'respondToApproval',
      'saveSpecDocument',
      'saveSteeringDocument',
    ]);
  });

  it('保存できる文書の名前が固定されている', async () => {
    const schema = await readFile(join(UPSTREAM_DIR, 'schema.ts'), 'utf-8');
    const rest = await readFile(join(UPSTREAM_DIR, 'rest.ts'), 'utf-8');

    // 本家の allowedDocs と同じ値。ここが緩むと保存先が広がる
    expect(schema).toContain("['requirements', 'design', 'tasks'] as const");
    expect(rest).toContain("['product', 'tech', 'structure'] as const");
  });
});
