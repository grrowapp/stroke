/**
 * ステアリング文書を保存する。ブラウザ → Nitro → 本家 と中継する。
 *
 * stroke-board が `.spec-workflow/` へ直接書くことはない。書くのは本家で、こちらは
 * 本家の `PUT /api/projects/:projectId/steering/:name` を呼ぶだけである。
 *
 * 仕様書と違い、文書名がそのまま `product.md` などのファイル名になる。3本以外を
 * 通すとファイル名を指定できてしまうので、ここで固定する。
 */

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { z } from 'zod';

import { saveSteeringDocument } from '../../../../../handler/project-document';
import { isSteeringDocument } from '../../../../../utils/upstream/rest';
import { toHttpError } from '../../../../../utils/control/upstream-proxy';
import { requireProjectId } from '../../../../../utils/access/request';

const bodySchema = z.object({
  content: z.string(),
});

export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireProjectId(event, getRouterParam(event, 'projectId') ?? '')
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const name = getRouterParam(event, 'name') ?? '';

  // ステアリングは常に product / tech / structure の3本
  if (!isSteeringDocument(name)) {
    throw createError({ statusCode: 400, statusMessage: 'unknown-steering-document' });
  }

  const parsed = bodySchema.safeParse(await readBody(event).catch(() => undefined));

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid-body' });
  }

  const result = await saveSteeringDocument(projectId, name, parsed.data.content);

  if (!result.ok) throw toHttpError(result.failure);

  return { ok: true };
});
