import { defineEventHandler, getRouterParam } from 'h3';

import { getTaskProgress } from '../../../../../../handler/project-document';
import { toHttpError } from '../../../../../../utils/control/upstream-proxy';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const specName = getRouterParam(event, 'specName') ?? '';
  const result = await getTaskProgress(projectId, specName);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
