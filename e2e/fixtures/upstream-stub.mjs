/**
 * E2E 用の本家スタブ。`node e2e/fixtures/upstream-stub.mjs <port>` で起動する。
 *
 * 実物の spec-workflow-mcp を E2E に使うと、承認依頼やタスクの状態を動かすために本家へ
 * 書き込むことになる。stroke-board は `.spec-workflow/` に書き込まないと決めているので
 * （docs/adr/0005）、テストのためにそれを破らない。代わりに、実測した形と同じペイロードを
 * 返すスタブを置く。
 *
 * スタブが実物とずれていないことは `yarn test:live` が本物に対して確かめている。
 *
 * `/__control/*` はテストから状態を動かすための口で、本家には存在しない。
 */

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const projects = new Map();
const sockets = new Set();

/**
 * 基準の作成が終わったかをテストから確定的に待てるようにするための計数。
 *
 * stroke-board は接続直後に `initial` を受けてから、tasks を持つ spec ごとに
 * `GET .../tasks/progress` を1回ずつ呼ぶ（design.md 決定4）。その回数が揃えば基準が
 * 揃ったことになる。時間で待つと環境によってぶれる。
 */
const stats = { progressRequests: 0, lastApprovalAction: null };

function task(id, description, status) {
  return {
    id,
    description,
    status,
    lineNumber: Number(id.split('.').at(-1)),
    indentLevel: 0,
    isHeader: false,
    completed: status === 'completed',
    inProgress: status === 'in-progress',
  };
}

function seed() {
  projects.clear();

  for (const [projectId, name] of [
    ['ALPHAID000000001', 'alpha'],
    ['BETAID0000000002', 'beta'],
  ]) {
    projects.set(projectId, {
      projectId,
      projectName: name,
      projectPath: `/workspace/${name}`,
      specs: [
        {
          name: 'auth-spec',
          // 本家は name から表示名を起こして必ず返す（`core-structure` → `Core Structure`）
          displayName: 'Auth Spec',
          createdAt: '2026-08-21T00:00:00.000Z',
          lastModified: '2026-08-21T00:00:00.000Z',
          phases: {
            requirements: { exists: true },
            design: { exists: true },
            tasks: { exists: true },
            implementation: { exists: false },
          },
          taskProgress: { total: 3, completed: 1, pending: 2 },
        },
      ],
      approvals: [],
      // 保存された文書。本家はファイルに書くので、次の取得で保存後の内容が返る
      savedSpecDocuments: new Map(),
      savedSteeringDocuments: new Map(),
      tasksBySpec: new Map([
        [
          'auth-spec',
          {
            total: 3,
            completed: 1,
            inProgress: null,
            taskList: [
              task('1.1', 'ログインを作る', 'completed'),
              task('1.2', 'ログアウトを作る', 'pending'),
              task('1.3', 'セッションを作る', 'pending'),
            ],
          },
        ],
      ]),
    });
  }
}

function projectList() {
  return [...projects.values()].map((project) => ({
    projectId: project.projectId,
    projectName: project.projectName,
    projectPath: project.projectPath,
    instances: [{ pid: process.pid, registeredAt: new Date().toISOString() }],
  }));
}

function broadcast(projectId, message) {
  const payload = JSON.stringify(message);
  for (const entry of sockets) {
    if (entry.projectId === projectId) entry.socket.send(payload);
  }
}

function emitTaskUpdate(projectId, specName) {
  const tasks = projects.get(projectId).tasksBySpec.get(specName);

  broadcast(projectId, {
    type: 'task-status-update',
    projectId,
    data: {
      specName,
      taskList: tasks.taskList,
      summary: {
        total: tasks.total,
        completed: tasks.completed,
        inProgress: tasks.inProgress === null ? 0 : 1,
        pending: tasks.total - tasks.completed,
        headers: 0,
      },
      inProgress: tasks.inProgress,
    },
  });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString());
}

function handleControl(rest, body) {
  switch (rest[0]) {
    case 'reset':
      seed();
      stats.progressRequests = 0;
      // 前のテストが送った応答を残さない。「何も届いていない」を確かめられなくなる
      stats.lastApprovalAction = null;
      return { ok: true };

    case 'stats':
      return {
        sockets: sockets.size,
        progressRequests: stats.progressRequests,
        lastApprovalAction: stats.lastApprovalAction,
      };

    case 'complete-task': {
      // 完了数を1つ増やす。`task-completed` と、全件なら `all-tasks-completed` が出るはず
      const tasks = projects.get(body.projectId).tasksBySpec.get(body.specName);
      const next = tasks.taskList.find((item) => item.status !== 'completed');
      if (next === undefined) throw new Error(`${body.specName} に未完了のタスクが無い`);

      next.status = 'completed';
      next.completed = true;
      next.inProgress = false;
      tasks.completed += 1;
      tasks.inProgress = null;
      emitTaskUpdate(body.projectId, body.specName);
      return { ok: true };
    }

    case 'start-task': {
      const tasks = projects.get(body.projectId).tasksBySpec.get(body.specName);
      const target = tasks.taskList.find((item) => item.id === body.taskId);
      if (target === undefined) throw new Error(`${body.taskId} が ${body.specName} に無い`);

      target.status = 'in-progress';
      target.inProgress = true;
      tasks.inProgress = body.taskId;
      emitTaskUpdate(body.projectId, body.specName);
      return { ok: true };
    }

    case 'request-approval': {
      const project = projects.get(body.projectId);
      project.approvals = [
        ...project.approvals,
        {
          id: body.id,
          title: body.title,
          filePath: body.filePath,
          type: 'document',
          status: 'pending',
          createdAt: new Date().toISOString(),
          category: body.category,
          categoryName: body.categoryName,
        },
      ];
      broadcast(body.projectId, {
        type: 'approval-update',
        projectId: body.projectId,
        data: project.approvals,
      });
      return { ok: true };
    }

    case 'resolve-approval': {
      // 本家は保留中しか返さない。承認も却下も「消滅」としてしか観測できない
      const project = projects.get(body.projectId);
      project.approvals = project.approvals.filter((item) => item.id !== body.id);
      broadcast(body.projectId, {
        type: 'approval-update',
        projectId: body.projectId,
        data: project.approvals,
      });
      return { ok: true };
    }

    case 'steering-update':
      // 再描画用の同期信号。通知にしてはいけない
      broadcast(body.projectId, {
        type: 'steering-update',
        projectId: body.projectId,
        data: { exists: true },
      });
      return { ok: true };

    default:
      return null;
  }
}

function handleApi(segments, respond, method = 'GET', body = null) {
  if (segments.join('/') === 'api/projects/list') return respond(200, projectList());

  if (segments[0] !== 'api' || segments[1] !== 'projects' || segments.length < 3) return false;

  const project = projects.get(segments[2]);
  if (project === undefined) return respond(404, { error: 'Project not found' });

  const rest = segments.slice(3);

  if (rest[0] === 'info') {
    return respond(200, {
      projectId: project.projectId,
      projectName: project.projectName,
      projectPath: project.projectPath,
      steering: {
        exists: true,
        documents: { product: true, tech: true, structure: false },
        lastModified: '2026-08-21T00:00:00.000Z',
      },
      version: '2.2.7',
    });
  }

  if (rest[0] === 'specs' && rest.length === 1) return respond(200, project.specs);

  /*
   * 仕様書の文書の保存。本家は受け取った `content` でファイルを丸ごと置き換える。
   * 保存したものを次の取得で返すことで、保存が効いているかを E2E で確かめられる。
   */
  if (method === 'PUT' && rest[0] === 'specs' && rest.length === 3) {
    const [, specName, document] = rest;

    if (!['requirements', 'design', 'tasks'].includes(document)) {
      return respond(400, { error: 'Invalid document type' });
    }
    if (typeof body?.content !== 'string') {
      return respond(400, { error: 'Content must be a string' });
    }

    project.savedSpecDocuments.set(`${specName}/${document}`, body.content);
    return respond(200, { success: true, message: 'Document saved successfully' });
  }

  // 仕様書の本文。無い文書は null で返る。design を欠かしてあるのは、
  // 未作成の文書を開けないことを E2E で押さえるため
  if (rest[0] === 'specs' && rest[2] === 'all') {
    const lastModified = '2026-08-21T00:00:00.000Z';
    const saved = (name) => project.savedSpecDocuments.get(`${rest[1]}/${name}`);

    const requirements = saved('requirements') ?? `# ${rest[1]} 要件定義\n\n本文`;
    const tasks = saved('tasks') ?? `# ${rest[1]} タスク\n\n- [x] 1.1 ログインを作る`;
    const design = saved('design');

    return respond(200, {
      requirements: { content: requirements, lastModified },
      // 未作成のまま。保存されたら作られたことにする
      design: design === undefined ? null : { content: design, lastModified },
      tasks: { content: tasks, lastModified },
    });
  }

  if (rest[0] === 'specs' && rest[2] === 'tasks' && rest[3] === 'progress') {
    const tasks = project.tasksBySpec.get(rest[1]);
    if (tasks === undefined) return respond(404, { error: 'Spec or tasks not found' });

    stats.progressRequests += 1;

    return respond(200, {
      total: tasks.total,
      completed: tasks.completed,
      inProgress: tasks.inProgress,
      progress: tasks.total === 0 ? 0 : (tasks.completed / tasks.total) * 100,
      taskList: tasks.taskList,
      lastModified: '2026-08-21T00:00:00.000Z',
    });
  }

  /*
   * 承認への応答。本家は `POST /api/projects/:id/approvals/:id/:action` を受け、
   * 応答を保存したうえで保留中から外す。承認と却下の区別は保留中から消えたことでしか
   * 観測できない（ADR-0006）ので、スタブも同じく消すだけにする。
   */
  if (method === 'POST' && rest[0] === 'approvals' && rest.length === 3) {
    const [, approvalId, action] = rest;

    if (!['approve', 'reject', 'needs-revision'].includes(action)) {
      return respond(400, { error: 'Invalid action' });
    }

    const target = project.approvals.find((item) => item.id === approvalId);
    if (target === undefined) return respond(404, { error: 'Approval not found' });

    /*
     * テストから「何を送ったか」を確かめられるように残す。
     *
     * 本家は `response` / `annotations` / `comments` を承認リクエストと同じ1ファイルに
     * 3つのフィールドとして書く。差し戻し（needs-revision）だけがこの3つを持つ。
     */
    stats.lastApprovalAction = {
      id: approvalId,
      action,
      response: body?.response ?? null,
      annotations: body?.annotations ?? null,
      comments: body?.comments ?? null,
    };

    project.approvals = project.approvals.filter((item) => item.id !== approvalId);
    broadcast(segments[2], {
      type: 'approval-update',
      projectId: segments[2],
      data: project.approvals,
    });

    return respond(200, { success: true });
  }

  if (rest[0] === 'approvals' && rest.length === 1) return respond(200, project.approvals);

  /*
   * 承認対象の本文。本家は `filePath` が指す実ファイルを読むので、その文書が
   * 保存されていれば保存後の内容が返る。承認画面から直したものが、同じ文書の
   * 画面にも反映されることをテストで確かめられるようにする。
   */
  if (rest[0] === 'approvals' && rest[2] === 'content') {
    const approval = project.approvals.find((item) => item.id === rest[1]);
    if (approval === undefined) return respond(404, { error: 'Approval not found' });

    const steering = /^\.spec-workflow\/steering\/([^/]+)\.md$/.exec(approval.filePath);
    if (steering !== null) {
      const saved = project.savedSteeringDocuments.get(steering[1]);
      if (saved !== undefined) return respond(200, { content: saved });
    }

    const spec = /^\.spec-workflow\/specs\/([^/]+)\/([^/]+)\.md$/.exec(approval.filePath);
    if (spec !== null) {
      const saved = project.savedSpecDocuments.get(`${spec[1]}/${spec[2]}`);
      if (saved !== undefined) return respond(200, { content: saved });
    }

    return respond(200, { content: `# ${approval.title}\n\n本文` });
  }

  /*
   * ステアリングだけ markdown の要素を一通り持たせてある。本文が markdown として
   * 描かれていること（見出し・箇条書き・表・コードブロック）と、mermaid フェンスが図に
   * なること、文書に混ざった生 HTML を描かないことを E2E で押さえるため。
   */
  /* ステアリングの保存。文書名がそのままファイル名になるので3本以外は弾く */
  if (method === 'PUT' && rest[0] === 'steering' && rest.length === 2) {
    if (!['product', 'tech', 'structure'].includes(rest[1])) {
      return respond(400, { error: 'Invalid steering document name' });
    }
    if (typeof body?.content !== 'string') {
      return respond(400, { error: 'Content must be a string' });
    }

    project.savedSteeringDocuments.set(rest[1], body.content);
    return respond(200, { success: true, message: 'Steering document saved successfully' });
  }

  if (rest[0] === 'steering') {
    const saved = project.savedSteeringDocuments.get(rest[1]);
    if (saved !== undefined) return respond(200, { content: saved });

    return respond(200, {
      content: [
        `# ${rest[1]}`,
        '',
        '本文と `インラインコード`。',
        '',
        // 見出しの段（h1 と h2 で寸法が変わることを押さえる）
        '## 見出し2',
        '',
        '2段目の本文。',
        '',
        '- 箇条書き1',
        '- 箇条書き2',
        '',
        '| 見出しA | 見出しB |',
        '| --- | --- |',
        '| 値1 | 値2 |',
        '',
        '```ts',
        "const x = 'コードブロック';",
        '```',
        '',
        '```mermaid',
        'flowchart LR',
        '  a["はじめ"] --> b["おわり"]',
        '```',
        '',
        '<img src=x onerror="window.__xss = true">',
        '',
        '<script>window.__xss = true;</script>',
      ].join('\n'),
    });
  }

  return false;
}

seed();

const port = Number(process.argv[2] ?? 5199);

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);

  const respond = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
    return true;
  };

  if (segments[0] === '__control') {
    // 制御の失敗でスタブごと落とさない。落ちると以降のテストが全部 ECONNREFUSED になり、
    // 本当に壊れているものが1件も分からなくなる
    try {
      const result = handleControl(segments.slice(1), await readJson(request));
      return result === null ? respond(404, { error: 'unknown control' }) : respond(200, result);
    } catch (error) {
      return respond(400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // 承認への応答は POST、文書の保存は PUT。どちらも body を持つ
  const hasBody = request.method === 'POST' || request.method === 'PUT';
  const body = hasBody ? await readJson(request) : null;

  // 保存の失敗でスタブごと落とさない。落ちると以降のテストが全部 ECONNREFUSED になり、
  // 本当に壊れているものが1件も分からなくなる
  try {
    if (handleApi(segments, respond, request.method, body) !== false) return;
  } catch (error) {
    return respond(500, { error: error instanceof Error ? error.message : String(error) });
  }

  respond(404, { error: 'not found' });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket, request) => {
  const projectId = new URL(request.url, 'http://localhost').searchParams.get('projectId');
  const entry = { socket, projectId };
  sockets.add(entry);

  socket.send(JSON.stringify({ type: 'projects-update', data: { projects: projectList() } }));

  const project = projects.get(projectId);
  if (project !== undefined) {
    socket.send(
      JSON.stringify({
        type: 'initial',
        projectId,
        data: { specs: project.specs, approvals: project.approvals },
      }),
    );
  }

  socket.on('close', () => sockets.delete(entry));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[upstream-stub] listening on ${port}`);
});
