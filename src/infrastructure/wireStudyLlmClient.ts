import {
  getStudyLlmClient,
  registerStudyLlmClient,
  type StudyLlmClient,
} from '@/features/studyPanel/studyLlmClient';
import { readOrMintDeviceId } from '@/infrastructure/deviceIdentity';
import { BackendStudyLlmRepository } from '@/infrastructure/repositories/BackendStudyLlmRepository';

function readDurableGenerationWorkerUrl(): string {
  const workerUrl =
    typeof process !== 'undefined' &&
    typeof process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL === 'string'
      ? process.env.NEXT_PUBLIC_DURABLE_GENERATION_URL.trim()
      : '';

  if (!workerUrl) {
    throw new Error(
      'Study LLM requires NEXT_PUBLIC_DURABLE_GENERATION_URL to be configured before app bootstrap.',
    );
  }

  return workerUrl;
}

let wired = false;

export function ensureStudyLlmClientRegistered(): StudyLlmClient {
  if (wired) return getStudyLlmClient();

  registerStudyLlmClient(
    new BackendStudyLlmRepository({
      baseUrl: readDurableGenerationWorkerUrl(),
      deviceId: readOrMintDeviceId(),
    }),
  );
  wired = true;
  return getStudyLlmClient();
}
