import { defineEventHandler, getRouterParam } from 'h3';

import { getApprovalContent } from '../../../../../../handler/project-approval';
import { toHttpError } from '../../../../../../utils/control/upstream-proxy';
import { requireProjectId } from '../../../../../../utils/access/request';

export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireProjectId(event, getRouterParam(event, 'projectId') ?? '')
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const approvalId = getRouterParam(event, 'approvalId') ?? '';
  const result = await getApprovalContent(projectId, approvalId);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
