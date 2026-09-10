import { defineEventHandler, getRouterParam } from 'h3';

import { listSpecs } from '../../../../handler/project-document';
import { toHttpError } from '../../../../utils/control/upstream-proxy';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const result = await listSpecs(projectId);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
