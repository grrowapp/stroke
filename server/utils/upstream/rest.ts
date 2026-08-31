/**
 * 本家 REST のクライアント。
 *
 * **書き込みは決めた3つだけ**に限る。
 *
 * - 承認への応答（`POST /approvals/:id/:action`） — `respondToApproval`
 * - 仕様書の文書の保存（`PUT /specs/:name/:document`） — `saveSpecDocument`
 * - ステアリング文書の保存（`PUT /steering/:name`） — `saveSteeringDocument`
 *
 * 本家にはタスクの状態更新やプロジェクトの登録と解除も実在するが、呼べる関数を置かない。
 * 呼べる関数が無ければ上位から誤って呼ばれない。「3つだけ」は目視では守れないので、
 * `test/server/utils/upstream/read-only.test.ts` が機械的に固定している。
 *
 * この3つを通す理由は、書き込むのが stroke-board ではなく本家だからである。ファイルに
 * 触るのは本家（承認は `approvalStorage`、保存は本家の PUT ハンドラ）で、こちらは本家に
 * 依頼するだけなので、「`.spec-workflow/` に書き込む主体を二重に作らない」（ADR-0005）は
 * 保たれる。
 *
 * 保存の2つは画面の文書編集を中継する経路である（specs/document-editing。
 * `server/api/projects/` 配下の PUT ハンドラから呼ばれる）。保存先が広がらないよう、
 * 文書名は `STEERING_DOCUMENTS` と `specDocumentNames`（`schema.ts`）で固定する。
 *
 * 定期ポーリングもしない。ここを呼ぶのは、画面が要求したときと、接続時に通知の基準を
 * 作るときだけである（tech.md の Performance Requirements）。
 */

import { ofetch } from 'ofetch';
import type { z } from 'zod';

import type { Annotation } from '#shared/stroke';

import {
  approvalRequestSchema,
  documentContentSchema,
  projectInfoSchema,
  projectListEntrySchema,
  specDataSchema,
  specDocumentsSchema,
  taskProgressSchema,
  type ApprovalRequest,
  type ProjectInfo,
  type ProjectListEntry,
  type SpecData,
  type SpecDocumentName,
  type SpecDocuments,
  type TaskProgress,
} from './schema';

/**
 * 承認への応答。本家が受ける3つをそのまま出す。
 *
 * `needs-revision` は注釈コメントを運ぶ経路で、承認画面で付けたコメントはこれでしか
 * 本家に渡らない（`approve` / `reject` は `response` しか持たない）。
 */
export const APPROVAL_ACTIONS = ['approve', 'reject', 'needs-revision'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

/** ステアリング文書は常にこの3本。本家に一覧 API は無い */
export const STEERING_DOCUMENTS = ['product', 'tech', 'structure'] as const;
export type SteeringDocument = (typeof STEERING_DOCUMENTS)[number];

export function isSteeringDocument(value: string): value is SteeringDocument {
  return (STEERING_DOCUMENTS as readonly string[]).includes(value);
}

export type UpstreamFailure =
  | { kind: 'not-configured' }
  /**
   * `detail` は本家が返したエラー本文（`{ error: string }` の `error`）。取れなかった
   * ときだけ省く——`toHttpError` の固定文言に頼らず本家の実応答を伝えたい呼び出し側
   * （MCP ツール。`server/utils/mcp/upstream-failure.ts`）のためのもので、既存の
   * 呼び出し側（`toHttpError` 経由）はこれを読まないので挙動は変わらない。
   */
  | { kind: 'not-found'; path: string; detail?: string }
  /**
   * 本家に届いた上で、404 以外のエラー応答（4xx / 5xx）が返った。`status` は本家が
   * 返したものをそのまま持つ。
   *
   * 「相手が拒否した」を「相手に届かない」（`unreachable`）へ畳まないために分ける。
   * 畳むと、到達しているのに「届かない」と報告される。`detail` の意味は `not-found`
   * と同じ。
   */
  | { kind: 'error-response'; path: string; status: number; reason: string; detail?: string }
  /** 本家に届かなかった。接続拒否・名前解決失敗・タイムアウトなど、状態コードが取れない場合 */
  | { kind: 'unreachable'; path: string; reason: string }
  | { kind: 'malformed'; path: string; reason: string };

export type UpstreamResult<T> = { ok: true; value: T } | { ok: false; failure: UpstreamFailure };

export class UpstreamRestClient {
  constructor(private readonly baseUrl: string | null) {}

  /** `GET /api/projects/:projectId/info` */
  getProjectInfo(projectId: string): Promise<UpstreamResult<ProjectInfo>> {
    return this.read(`/api/projects/${enc(projectId)}/info`, projectInfoSchema);
  }

  /**
   * `GET /api/projects/list` — 起動中のプロジェクト一覧。MCP ツールが projectPath から
   * projectId を引き当てるのに使う（provide-operations-via-mcp design.md）。
   */
  listProjects(): Promise<UpstreamResult<ProjectListEntry[]>> {
    return this.read('/api/projects/list', projectListEntrySchema.array());
  }

  /** `GET /api/projects/:projectId/specs` */
  listSpecs(projectId: string): Promise<UpstreamResult<SpecData[]>> {
    return this.read(`/api/projects/${enc(projectId)}/specs`, specDataSchema.array());
  }

  /** `GET /api/projects/:projectId/specs/:name/all` — requirements / design / tasks の本文 */
  getSpecDocuments(projectId: string, specName: string): Promise<UpstreamResult<SpecDocuments>> {
    return this.read(
      `/api/projects/${enc(projectId)}/specs/${enc(specName)}/all`,
      specDocumentsSchema,
    );
  }

  /** `GET /api/projects/:projectId/specs/:name/tasks/progress` — 通知の基準を作るのに使う */
  getTaskProgress(projectId: string, specName: string): Promise<UpstreamResult<TaskProgress>> {
    return this.read(
      `/api/projects/${enc(projectId)}/specs/${enc(specName)}/tasks/progress`,
      taskProgressSchema,
    );
  }

  /** `GET /api/projects/:projectId/steering/:name` */
  getSteeringDocument(
    projectId: string,
    name: SteeringDocument,
  ): Promise<UpstreamResult<{ content: string }>> {
    return this.read(`/api/projects/${enc(projectId)}/steering/${enc(name)}`, documentContentSchema);
  }

  /** `GET /api/projects/:projectId/approvals` — 保留中のものだけが返る */
  listPendingApprovals(projectId: string): Promise<UpstreamResult<ApprovalRequest[]>> {
    return this.read(`/api/projects/${enc(projectId)}/approvals`, approvalRequestSchema.array());
  }

  /** `GET /api/projects/:projectId/approvals/:id/content` — 承認画面が表示する対象文書の中身 */
  getApprovalContent(
    projectId: string,
    approvalId: string,
  ): Promise<UpstreamResult<{ content: string }>> {
    return this.read(
      `/api/projects/${enc(projectId)}/approvals/${enc(approvalId)}/content`,
      documentContentSchema,
    );
  }

  /**
   * `POST /api/projects/:projectId/approvals/:id/:action` — 承認への応答。
   *
   * 本家は `approve` / `reject` / `needs-revision` を受け、body の `response` /
   * `annotations` / `comments` を承認リクエストと同じ1ファイル
   * （`.spec-workflow/approvals/<categoryName>/approval_<id>.json`）に書く
   * （`src/dashboard/multi-server.ts` → `approvalStorage.updateApproval`）。
   *
   * 注釈を運ぶのは `needs-revision` だけである。`approve` / `reject` で `revision` を
   * 渡さないのは本家の呼び方に合わせたもので、あちらも `response` しか送っていない。
   *
   * 本家の応答は `{ success: true }`。中身を使わないので形の検証は状態コードに任せる。
   */
  async respondToApproval(
    projectId: string,
    approvalId: string,
    action: ApprovalAction,
    response: string,
    /** `needs-revision` のときだけ載る注釈。無ければ `response` だけを送る */
    revision?: { annotations: string; comments: Annotation[] },
  ): Promise<UpstreamResult<null>> {
    const path = `/api/projects/${enc(projectId)}/approvals/${enc(approvalId)}/${action}`;

    if (this.baseUrl === null) {
      return { ok: false, failure: { kind: 'not-configured' } };
    }

    try {
      await ofetch(path, {
        baseURL: this.baseUrl,
        method: 'POST',
        body: revision === undefined ? { response } : { response, ...revision },
        retry: 0,
      });
    } catch (error) {
      return { ok: false, failure: toFailure(path, error) };
    }

    return { ok: true, value: null };
  }

  /**
   * `PUT /api/projects/:projectId/specs/:name/:document` — 仕様書の文書を保存する。
   *
   * 送るのは文書1本ぶんの全文で、差分は送らない。本家は受け取った内容で
   * ファイルを丸ごと置き換える（`multi-server.ts`）。
   *
   * 本家は保存の前に他所で変更されていないかを確かめない。確かめる手段が無いため、
   * 後から保存したものが残る（specs/document-editing）。
   */
  async saveSpecDocument(
    projectId: string,
    specName: string,
    document: SpecDocumentName,
    content: string,
  ): Promise<UpstreamResult<null>> {
    return this.write(
      `/api/projects/${enc(projectId)}/specs/${enc(specName)}/${enc(document)}`,
      content,
    );
  }

  /**
   * `PUT /api/projects/:projectId/steering/:name` — ステアリング文書を保存する。
   *
   * 仕様書と違い、文書名がそのまま `product.md` などのファイル名になる。
   */
  async saveSteeringDocument(
    projectId: string,
    name: SteeringDocument,
    content: string,
  ): Promise<UpstreamResult<null>> {
    return this.write(`/api/projects/${enc(projectId)}/steering/${enc(name)}`, content);
  }

  /**
   * 保存する。
   *
   * 本家の応答は `{ success: true, message: ... }` だが中身を使わないので、
   * 成否は状態コードに任せる。取得（`read`）と失敗の区別を揃えてある。
   */
  private async write(path: string, content: string): Promise<UpstreamResult<null>> {
    if (this.baseUrl === null) {
      return { ok: false, failure: { kind: 'not-configured' } };
    }

    try {
      await ofetch(path, {
        baseURL: this.baseUrl,
        method: 'PUT',
        body: { content },
        retry: 0,
      });
    } catch (error) {
      return { ok: false, failure: toFailure(path, error) };
    }

    return { ok: true, value: null };
  }

  /**
   * 取得して検証する。
   *
   * 想定と違う形のものは通さず、何が起きたかを呼び出し側が区別できる形で返す。
   * 「繋がらなかった」「無かった」「拒否された」「形が違った」は画面での見せ方が
   * 変わるので混ぜない（分け方は `toFailure`）。
   */
  private async read<T>(path: string, schema: z.ZodType<T>): Promise<UpstreamResult<T>> {
    if (this.baseUrl === null) {
      return { ok: false, failure: { kind: 'not-configured' } };
    }

    let raw: unknown;
    try {
      raw = await ofetch(path, { baseURL: this.baseUrl, retry: 0 });
    } catch (error) {
      return { ok: false, failure: toFailure(path, error) };
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        failure: { kind: 'malformed', path, reason: parsed.error.message },
      };
    }

    return { ok: true, value: parsed.data };
  }
}

function enc(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * 発行時の例外を失敗へ写す。取得（`read`）と保存（`write` / `respondToApproval`）で
 * 同じ分け方をする。
 *
 * 分ける基準は「本家に届いたか」——状態コードが取れたなら届いている。届いた上での
 * エラー応答は本家の状態コードをそのまま持たせ、状態コードが取れないもの（接続拒否・
 * 名前解決失敗・タイムアウト）だけを `unreachable` にする。届いているのに
 * `unreachable` へ畳むと、出し直せば直るのか環境の問題なのかを呼び出し側が区別できない。
 */
function toFailure(path: string, error: unknown): UpstreamFailure {
  const status = statusOf(error);

  // 404 は「無かった」として先に分ける。呼び出し側での見せ方が他のエラー応答と違う。
  if (status === 404) {
    return { kind: 'not-found', path, detail: detailOf(error) };
  }

  if (status !== undefined) {
    return { kind: 'error-response', path, status, reason: toReason(error), detail: detailOf(error) };
  }

  return { kind: 'unreachable', path, reason: toReason(error) };
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 本家が返したエラー本文（`{ error: string }` の `error`）。取れなければ undefined。 */
function detailOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return undefined;
  const message = (data as { error?: unknown }).error;
  return typeof message === 'string' ? message : undefined;
}
