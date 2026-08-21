import { defineEventHandler, getRouterParam } from 'h3';

import { toHttpError, upstreamClient } from '../../../utils/control/upstream-proxy';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const result = await upstreamClient().getProjectInfo(projectId);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
