import type { IDeckContentWriter, IDeckRepository } from '../types/repository';
import type { IChatCompletionsRepository } from '../types/llm';
import { deckContentWriter } from './deckContentWriter';
import { createDeckRepository } from './deckRepositoryFactory';
import { createHttpChatCompletionsRepositoryFromEnv } from './repositories/HttpChatCompletionsRepository';

export const deckRepository: IDeckRepository = createDeckRepository();

export const deckWriter: IDeckContentWriter = deckContentWriter;

export const chatCompletionsRepository: IChatCompletionsRepository =
  createHttpChatCompletionsRepositoryFromEnv();
