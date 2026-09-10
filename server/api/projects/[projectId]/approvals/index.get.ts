import { defineEventHandler, getRouterParam } from 'h3';

import { listPendingApprovals } from '../../../../handler/project-approval';
import { toHttpError } from '../../../../utils/control/upstream-proxy';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const result = await listPendingApprovals(projectId);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
