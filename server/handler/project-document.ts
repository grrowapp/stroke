import { upstreamClient } from '../utils/control/upstream-proxy'
import type { SteeringDocument, UpstreamResult } from '../utils/upstream/rest'
import type { SpecData, SpecDocumentName, SpecDocuments, TaskProgress } from '../utils/upstream/schema'

/**
 * 仕様書とステアリングの文書を本家との間で仲介する実処理。
 *
 * stroke-board が `.spec-workflow/` へ直接書くことはない。書くのは本家で、こちらは本家の
 * REST を呼ぶだけである（ADR-0005 の「二重に書き込む主体を作らない」はこの形で保つ）。
 * 保存の2つは画面の文書編集を中継する経路である（specs/document-editing）。
 *
 * **文書名の検証は持たない。** 仕様書は requirements / design / tasks、ステアリングは
 * product / tech / structure に限るが、それを弾くのは endpoint である——型
 * （`SpecDocumentName` / `SteeringDocument`）でここへ届く前に絞られている。
 */

/** 仕様書の一覧を取る（`GET /api/projects/:projectId/specs`）。 */
export function listSpecs(projectId: string): Promise<UpstreamResult<SpecData[]>> {
  return upstreamClient().listSpecs(projectId)
}

/** 仕様書の本文3本をまとめて取る（`GET .../specs/:specName/all`）。 */
export function getSpecDocuments(projectId: string, specName: string): Promise<UpstreamResult<SpecDocuments>> {
  return upstreamClient().getSpecDocuments(projectId, specName)
}

/** タスクの進捗を取る（`GET .../specs/:specName/tasks/progress`）。 */
export function getTaskProgress(projectId: string, specName: string): Promise<UpstreamResult<TaskProgress>> {
  return upstreamClient().getTaskProgress(projectId, specName)
}

/** 仕様書の文書を保存する（`PUT .../specs/:specName/:document`）。 */
export function saveSpecDocument(
  projectId: string,
  specName: string,
  document: SpecDocumentName,
  content: string,
): Promise<UpstreamResult<null>> {
  return upstreamClient().saveSpecDocument(projectId, specName, document, content)
}

/** ステアリング文書を取る（`GET .../steering/:name`）。 */
export function getSteeringDocument(
  projectId: string,
  name: SteeringDocument,
): Promise<UpstreamResult<{ content: string }>> {
  return upstreamClient().getSteeringDocument(projectId, name)
}

/** ステアリング文書を保存する（`PUT .../steering/:name`）。 */
export function saveSteeringDocument(
  projectId: string,
  name: SteeringDocument,
  content: string,
): Promise<UpstreamResult<null>> {
  return upstreamClient().saveSteeringDocument(projectId, name, content)
}
