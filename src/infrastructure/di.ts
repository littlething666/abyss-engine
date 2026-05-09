import type { ICrystalTrialSetRepository, IDeckContentWriter, IDeckRepository } from '../types/repository';
import type { IChatCompletionsRepository } from '../types/llm';
import { deckContentWriter } from './deckContentWriter';
import { createCrystalTrialSetRepository } from './crystalTrialSetRepositoryFactory';
import { createDeckRepository } from './deckRepositoryFactory';
import { createHttpChatCompletionsRepositoryFromEnv } from './repositories/HttpChatCompletionsRepository';

export const deckRepository: IDeckRepository = createDeckRepository();

export const crystalTrialSetRepository: ICrystalTrialSetRepository = createCrystalTrialSetRepository();

export const deckWriter: IDeckContentWriter = deckContentWriter;

export const chatCompletionsRepository: IChatCompletionsRepository =
  createHttpChatCompletionsRepositoryFromEnv();
