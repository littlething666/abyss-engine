import type { IDeckContentWriter, IDeckRepository } from '../types/repository';
import type { IChatCompletionsRepository } from '../types/llm';
import { deckContentWriter } from './deckContentWriter';
import { IndexedDbDeckRepository } from './repositories/IndexedDbDeckRepository';
import { createHttpChatCompletionsRepositoryFromEnv } from './repositories/HttpChatCompletionsRepository';

export const deckRepository: IDeckRepository = new IndexedDbDeckRepository();

export const deckWriter: IDeckContentWriter = deckContentWriter;

export const chatCompletionsRepository: IChatCompletionsRepository =
  createHttpChatCompletionsRepositoryFromEnv();
