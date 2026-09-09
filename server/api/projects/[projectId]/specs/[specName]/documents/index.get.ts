/**
 * 仕様書の本文。requirements / design / tasks の3本をまとめて返す。
 */

import { defineEventHandler, getRouterParam } from 'h3';

import { toHttpError, upstreamClient } from '../../../../../../utils/control/upstream-proxy';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const specName = getRouterParam(event, 'specName') ?? '';
  const result = await upstreamClient().getSpecDocuments(projectId, specName);

  if (!result.ok) throw toHttpError(result.failure);
  return result.value;
});
