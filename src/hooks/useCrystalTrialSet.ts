import { useQuery } from '@tanstack/react-query';

import { crystalTrialSetRepository } from '../infrastructure/di';
import type { CrystalTrialSetReadModel } from '../types/repository';

export function crystalTrialSetQueryKey(subjectId: string, topicId: string, targetLevel: number) {
  return ['content', 'crystal-trial', subjectId, topicId, targetLevel] as const;
}

/** Reads the backend-resolved current Crystal Trial question set for a topic/target level. */
export function useCurrentCrystalTrialSet(
  subjectId: string | undefined,
  topicId: string | undefined,
  targetLevel: number | undefined,
) {
  return useQuery<CrystalTrialSetReadModel | null, Error>({
    queryKey: crystalTrialSetQueryKey(subjectId ?? '', topicId ?? '', targetLevel ?? 0),
    queryFn: async () => {
      if (!subjectId || !topicId || targetLevel === undefined) return null;
      return crystalTrialSetRepository.getCurrentTrialSet(subjectId, topicId, targetLevel);
    },
    enabled: Boolean(subjectId) && Boolean(topicId) && targetLevel !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
