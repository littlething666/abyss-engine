import type { SubjectGraphEdgesRunInputSnapshot } from './types';
import {
  assertContentHash,
  assertIsoTimestamp,
  assertNonEmptyString,
  assertPositiveInteger,
} from './_validators';

export interface BuildSubjectGraphEdgesSnapshotParams {
  subjectId: string;
  schemaVersion: number;
  promptTemplateVersion: string;
  modelId: string;
  capturedAt: string;
  /**
   * Content hash (`cnt_<64-hex>`) of the topics-lattice artifact this edges
   * run depends on. Including the upstream content hash binds the edges run
   * to a specific lattice — regenerating the lattice forces a new edges run.
   */
  latticeArtifactContentHash: string;
}

export function buildSubjectGraphEdgesSnapshot(
  p: BuildSubjectGraphEdgesSnapshotParams,
): SubjectGraphEdgesRunInputSnapshot {
  assertNonEmptyString('subjectId', p.subjectId);
  assertPositiveInteger('schemaVersion', p.schemaVersion);
  assertNonEmptyString('promptTemplateVersion', p.promptTemplateVersion);
  assertNonEmptyString('modelId', p.modelId);
  assertIsoTimestamp('capturedAt', p.capturedAt);
  assertContentHash('latticeArtifactContentHash', p.latticeArtifactContentHash);

  return {
    snapshot_version: 1,
    pipeline_kind: 'subject-graph-edges',
    schema_version: p.schemaVersion,
    prompt_template_version: p.promptTemplateVersion,
    model_id: p.modelId,
    captured_at: p.capturedAt,
    subject_id: p.subjectId,
    lattice_artifact_content_hash: p.latticeArtifactContentHash,
  };
}
