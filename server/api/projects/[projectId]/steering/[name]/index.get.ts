import { createError, defineEventHandler, getRouterParam } from 'h3';

import { getSteeringDocument } from '../../../../../handler/project-document';
import { isSteeringDocument } from '../../../../../utils/upstream/rest';
import { toHttpError } from '../../../../../utils/control/upstream-proxy';
import { requireProjectId } from '../../../../../utils/access/request';

export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireProjectId(event, getRouterParam(event, 'projectId') ?? '')
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const name = getRouterParam(event, 'name') ?? '';

  // ステアリングは常に product / tech / structure の3本。それ以外を本家へ投げない
  if (!isSteeringDocument(name)) {
    throw createError({ statusCode: 404, statusMessage: 'unknown-steering-document' });
  }

  const result = await getSteeringDocument(projectId, name);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
