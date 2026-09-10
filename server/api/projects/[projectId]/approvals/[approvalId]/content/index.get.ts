import { defineEventHandler, getRouterParam } from 'h3';

import { getApprovalContent } from '../../../../../../handler/project-approval';
import { toHttpError } from '../../../../../../utils/control/upstream-proxy';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const approvalId = getRouterParam(event, 'approvalId') ?? '';
  const result = await getApprovalContent(projectId, approvalId);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
