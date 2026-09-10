/**
 * 仕様書の文書を保存する。ブラウザ → Nitro → 本家 と中継する。
 *
 * stroke-board が `.spec-workflow/` へ直接書くことはない。書くのは本家で、こちらは
 * 本家の `PUT /api/projects/:projectId/specs/:name/:document` を呼ぶだけである
 * （ADR-0005 の「二重に書き込む主体を作らない」はこの形で保つ）。
 *
 * 文書名と本文は本家も検証するが、こちらでも弾く。本家に投げてから弾かれると
 * 退けられた理由が本家の応答経由になり、画面での見せ方が本家の文言に左右されるため。
 */

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { z } from 'zod';

import { saveSpecDocument } from '../../../../../../handler/project-document';
import { isSpecDocumentName } from '../../../../../../utils/upstream/schema';
import { toHttpError } from '../../../../../../utils/control/upstream-proxy';

/**
 * 本家は body の `content` をファイルの中身として丸ごと書く。
 *
 * 空文字は通す。文書を空にすることと、文書を消すことは違う。消す操作は持たない。
 */
const bodySchema = z.object({
  content: z.string(),
});

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const specName = getRouterParam(event, 'specName') ?? '';
  const document = getRouterParam(event, 'document') ?? '';

  // 仕様書の文書は requirements / design / tasks の3本。それ以外を本家へ投げない
  if (!isSpecDocumentName(document)) {
    throw createError({ statusCode: 400, statusMessage: 'unknown-spec-document' });
  }

  const parsed = bodySchema.safeParse(await readBody(event).catch(() => undefined));

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid-body' });
  }

  const result = await saveSpecDocument(projectId, specName, document, parsed.data.content);

  if (!result.ok) throw toHttpError(result.failure);

  return { ok: true };
});
