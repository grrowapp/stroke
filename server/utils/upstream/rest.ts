/**
 * 本家 REST の読み取りクライアント。
 *
 * **書き込み系の関数をここに置かない**（design.md 決定11）。本家には
 * `PUT /specs/:name/:document` や `POST /approvals/:id/:action` が実在するが、
 * 呼べる関数が無ければ上位から誤って呼ばれることもない。認証を持たないまま外部公開する
 * 以上、読み取り専用であることをコードの形で担保する。
 *
 * 定期ポーリングもしない。ここを呼ぶのは、画面が要求したときと、接続時に通知の基準を
 * 作るときだけである（tech.md の Performance Requirements）。
 */

import { ofetch } from 'ofetch';
import type { z } from 'zod';

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
  type SpecDocuments,
  type TaskProgress,
} from './schema';

/** ステアリング文書は常にこの3本。本家に一覧 API は無い */
export const STEERING_DOCUMENTS = ['product', 'tech', 'structure'] as const;
export type SteeringDocument = (typeof STEERING_DOCUMENTS)[number];

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
