import { defineEventHandler, getRouterParam } from 'h3';

import { readProjectInfo } from '../../../../handler/project-directory';
import { toHttpError } from '../../../../utils/control/upstream-proxy';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const result = await readProjectInfo(projectId);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
