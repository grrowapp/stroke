/**
 * 上層のプロジェクト一覧。
 *
 * ブラウザはここだけを見る。本家へは触らせない（structure.md の Module Boundaries）。
 * 組み立ては `server/handler/project-directory.ts` が行い、ここは設定を解決して渡すだけである。
 */

import { defineEventHandler } from 'h3';

import { listProjectDirectory } from '../../handler/project-directory';
import { readServerConfig } from '../../utils/config';
import type { ProjectDirectoryResponse } from '#shared/types';

export default defineEventHandler(async (): Promise<ProjectDirectoryResponse> => ({
  directory: await listProjectDirectory(readServerConfig()),
}));
