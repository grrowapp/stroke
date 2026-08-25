/**
 * 本家 REST のクライアント。
 *
 * **書き込みは承認への応答（`POST /approvals/:id/:action`）だけ**に限る。本家には
 * 仕様書の保存・タスクの状態更新・プロジェクトの登録と解除も実在するが、呼べる関数を
 * 置かない。呼べる関数が無ければ上位から誤って呼ばれない。
 *
 * 承認への応答を通す理由は、書き込むのが stroke-board ではなく本家だからである。
 * ファイルに触るのは本家の `approvalStorage` で、こちらは本家に依頼するだけなので、
 * 「`.spec-workflow/` に書き込む主体を二重に作らない」（ADR-0005）は保たれる。
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
  specDataSchema,
  specDocumentsSchema,
  taskProgressSchema,
  type ApprovalRequest,
  type ProjectInfo,
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
  | { kind: 'not-found'; path: string }
  | { kind: 'unreachable'; path: string; reason: string }
  | { kind: 'malformed'; path: string; reason: string };

export type UpstreamResult<T> = { ok: true; value: T } | { ok: false; failure: UpstreamFailure };

export class UpstreamRestClient {
  constructor(private readonly baseUrl: string | null) {}

  /** `GET /api/projects/:projectId/info` */
  getProjectInfo(projectId: string): Promise<UpstreamResult<ProjectInfo>> {
    return this.read(`/api/projects/${enc(projectId)}/info`, projectInfoSchema);
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
      if (statusOf(error) === 404) {
        return { ok: false, failure: { kind: 'not-found', path } };
      }
      return { ok: false, failure: { kind: 'unreachable', path, reason: toReason(error) } };
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
      if (statusOf(error) === 404) {
        return { ok: false, failure: { kind: 'not-found', path } };
      }
      return { ok: false, failure: { kind: 'unreachable', path, reason: toReason(error) } };
    }

    return { ok: true, value: null };
  }

  /**
   * 取得して検証する。
   *
   * 想定と違う形のものは通さず、何が起きたかを呼び出し側が区別できる形で返す。
   * 「繋がらなかった」「無かった」「形が違った」は画面での見せ方が変わるので混ぜない。
   */
  private async read<T>(path: string, schema: z.ZodType<T>): Promise<UpstreamResult<T>> {
    if (this.baseUrl === null) {
      return { ok: false, failure: { kind: 'not-configured' } };
    }

    let raw: unknown;
    try {
      raw = await ofetch(path, { baseURL: this.baseUrl, retry: 0 });
    } catch (error) {
      if (statusOf(error) === 404) {
        return { ok: false, failure: { kind: 'not-found', path } };
      }
      return {
        ok: false,
        failure: { kind: 'unreachable', path, reason: toReason(error) },
      };
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

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown; statusCode?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : undefined;
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
