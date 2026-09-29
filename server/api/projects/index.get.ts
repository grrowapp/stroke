/**
 * 上層のプロジェクト一覧。
 *
 * ブラウザはここだけを見る。本家へは触らせない（structure.md の Module Boundaries）。
 * 組み立ては `server/handler/project-directory.ts` が行い、ここは設定を解決して渡すだけである。
 *
 * 並べるのは、一覧を見ている利用者に許可のあるプロジェクトだけである（`project/directory`）。
 */

import { defineEventHandler } from 'h3';

import { listProjectDirectory } from '../../handler/project-directory';
import { visibleProjects } from '../../utils/access/request';
import { readServerConfig } from '../../utils/config';
import type { ProjectDirectoryResponse } from '#shared/types';

export default defineEventHandler(async (event): Promise<ProjectDirectoryResponse> => {
  const directory = await listProjectDirectory(readServerConfig());
  if (directory.status !== 'ok') return { directory };
  return { directory: { ...directory, projects: await visibleProjects(event, directory.projects) } };
});
