import { createError, defineEventHandler, getRouterParam } from 'h3';

import { isSteeringDocument } from '../../../../../utils/upstream/rest';
import { toHttpError, upstreamClient } from '../../../../../utils/control/upstream-proxy';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const name = getRouterParam(event, 'name') ?? '';

  // ステアリングは常に product / tech / structure の3本。それ以外を本家へ投げない
  if (!isSteeringDocument(name)) {
    throw createError({ statusCode: 404, statusMessage: 'unknown-steering-document' });
  }

  const result = await upstreamClient().getSteeringDocument(projectId, name);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
