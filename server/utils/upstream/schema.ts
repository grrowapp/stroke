/**
 * 本家から受け取るペイロードの形。
 *
 * 基準は 2.2.7（docs/adr/0004）。ただし `blocked` まわりの3つだけは optional にしてある。
 * この環境で動いているダッシュボードは 2.2.5 で、そこには `blocked` が存在しないため、
 * 必須にすると1件も通らない。逆に 2.2.5 の形しか許さないと本家を上げた瞬間に全部弾く。
 * 両方を通すのはこの3つだけで、それ以外は厳密に検証する。
 *
 * 形が合わないものは黙って通さない（tech.md の Security Practices）。
 */

import { z } from 'zod';

/**
 * タスクの状態。
 * `blocked` は 2.2.7 で追加された。2.2.5 ではチェックボックスの `~` も `pending` になる。
 */
export const taskStatusSchema = z.enum(['pending', 'in-progress', 'completed', 'blocked']);

export const parsedTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  lineNumber: z.number(),
  indentLevel: z.number(),
  isHeader: z.boolean(),
  completed: z.boolean(),
  inProgress: z.boolean(),

  // 2.2.7 で追加。2.2.5 からは来ない
  blocked: z.boolean().optional(),
  blockedReason: z.string().optional(),

  // 値があるときだけ入る
  requirements: z.array(z.string()).optional(),
  leverage: z.string().optional(),
  files: z.array(z.string()).optional(),
  purposes: z.array(z.string()).optional(),
  implementationDetails: z.array(z.string()).optional(),
  prompt: z.string().optional(),
  promptStructured: z.array(z.unknown()).optional(),
});

export const taskSummarySchema = z.object({
  total: z.number(),
  completed: z.number(),
  inProgress: z.number(),
  pending: z.number(),
  headers: z.number(),

  // 2.2.7 で追加。2.2.5 からは来ない
  blocked: z.number().optional(),
});

/** `.spec-workflow/specs/<name>/` の各フェーズ */
export const phaseStatusSchema = z.object({
  exists: z.boolean(),
  approved: z.boolean().optional(),
  lastModified: z.string().optional(),
  content: z.string().optional(),
});

/** `GET /api/projects/:projectId/specs` と `initial` の `specs` */
export const specDataSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  lastModified: z.string(),
  phases: z.object({
    requirements: phaseStatusSchema,
    design: phaseStatusSchema,
    tasks: phaseStatusSchema,
    implementation: phaseStatusSchema,
  }),
  taskProgress: z
    .object({ total: z.number(), completed: z.number(), pending: z.number() })
    .optional(),
});

/**
 * 保留中の承認依頼。
 *
 * `category` は `'spec' | 'steering'` の2値で、ステアリング文書に対しても承認依頼が立つ
 * （docs/adr/0003）。`filePath` はプロジェクトルートからの相対パスで返る。
 */
export const approvalRequestSchema = z.object({
  id: z.string(),
  title: z.string(),
  filePath: z.string(),
  type: z.enum(['document', 'action']),
  status: z.enum(['pending', 'approved', 'rejected', 'needs-revision']),
  createdAt: z.string(),
  category: z.enum(['spec', 'steering']),
  categoryName: z.string(),

  // pending の応答には出てこない
  respondedAt: z.string().optional(),
  response: z.string().optional(),
  annotations: z.string().optional(),
  comments: z.array(z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** `GET /api/projects/:projectId/info` */
export const projectInfoSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  projectPath: z.string(),
  steering: z.object({
    exists: z.boolean(),
    documents: z.object({ product: z.boolean(), tech: z.boolean(), structure: z.boolean() }),
    lastModified: z.string().optional(),
  }),
  version: z.string(),
});

/** `GET /api/projects/:projectId/specs/:name/tasks/progress` */
export const taskProgressSchema = z.object({
  total: z.number(),
  completed: z.number(),
  /** 着手中のタスクの ID。無ければ null */
  inProgress: z.string().nullable(),
  progress: z.number(),
  taskList: z.array(parsedTaskSchema),
  lastModified: z.string().optional(),
});

/** `GET /api/projects/:projectId/steering/:name` と `.../approvals/:id/content` */
export const documentContentSchema = z.object({ content: z.string() });

/**
 * `GET /api/projects/:projectId/specs/:name/all`
 *
 * requirements / design / tasks の3本を返す。無い文書は null で返る。
 */
export const specDocumentsSchema = z.object({
  requirements: z.object({ content: z.string(), lastModified: z.string() }).nullable(),
  design: z.object({ content: z.string(), lastModified: z.string() }).nullable(),
  tasks: z.object({ content: z.string(), lastModified: z.string() }).nullable(),
});

// --- 編集できる文書 ---

/**
 * 保存を許す文書の名前。
 *
 * 本家も同じ値で弾く（`multi-server.ts` の `allowedDocs`）。それでもこちらで持つのは、
 * 本家に投げてから弾かれると、退けられた理由が本家の応答経由になり、画面での見せ方が
 * 本家の文言に左右されるためである。入口で弾いて、こちらの言葉で返す。
 */
export const specDocumentNames = ['requirements', 'design', 'tasks'] as const;

export const specDocumentNameSchema = z.enum(specDocumentNames);

export type SpecDocumentName = z.infer<typeof specDocumentNameSchema>;

export function isSpecDocumentName(value: string): value is SpecDocumentName {
  return specDocumentNameSchema.safeParse(value).success;
}

// --- WebSocket ---

/** 接続直後に届く。ここから通知の基準を作る（design.md 決定4） */
export const initialMessageSchema = z.object({
  type: z.literal('initial'),
  projectId: z.string(),
  data: z.object({
    specs: z.array(specDataSchema),
    approvals: z.array(approvalRequestSchema),
  }),
});

/** `summary` と `inProgress` を前回値と比べて通知を作る（design.md 決定5） */
export const taskStatusUpdateMessageSchema = z.object({
  type: z.literal('task-status-update'),
  projectId: z.string(),
  data: z.object({
    specName: z.string(),
    taskList: z.array(parsedTaskSchema),
    summary: taskSummarySchema,
    /** 着手中のタスクの ID。無ければ null */
    inProgress: z.string().nullable(),
  }),
});

/** 保留中の ID 集合を前回値と比べて通知を作る */
export const approvalUpdateMessageSchema = z.object({
  type: z.literal('approval-update'),
  projectId: z.string(),
  data: z.array(approvalRequestSchema),
});

/**
 * 通知にしないメッセージ。
 *
 * `spec-update` / `steering-update` は再描画用の同期信号で、`.md` を保存するたびに発火する。
 * `projects-update` は registry の変化。いずれも通知にしない（specs/notification-feed）。
 * 中身を使わないので `data` は検証しない。
 */
export const ignoredMessageSchema = z.object({
  type: z.enum([
    'projects-update',
    'spec-update',
    'steering-update',
    'implementation-log-update',
    'batch-approval-update',
    'batch-approval-undo',
  ]),
});

export const upstreamMessageSchema = z.union([
  initialMessageSchema,
  taskStatusUpdateMessageSchema,
  approvalUpdateMessageSchema,
  ignoredMessageSchema,
]);

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type ParsedTask = z.infer<typeof parsedTaskSchema>;
export type TaskSummary = z.infer<typeof taskSummarySchema>;
export type SpecData = z.infer<typeof specDataSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type ProjectInfo = z.infer<typeof projectInfoSchema>;
export type SpecDocuments = z.infer<typeof specDocumentsSchema>;
export type TaskProgress = z.infer<typeof taskProgressSchema>;
export type InitialMessage = z.infer<typeof initialMessageSchema>;
export type TaskStatusUpdateMessage = z.infer<typeof taskStatusUpdateMessageSchema>;
export type ApprovalUpdateMessage = z.infer<typeof approvalUpdateMessageSchema>;
export type UpstreamMessage = z.infer<typeof upstreamMessageSchema>;
