import type { ICrystalTrialSetRepository, IDeckContentWriter, IDeckRepository } from '../types/repository';
import { deckContentWriter } from './deckContentWriter';
import { createCrystalTrialSetRepository } from './crystalTrialSetRepositoryFactory';
import { createDeckRepository } from './deckRepositoryFactory';

export const deckRepository: IDeckRepository = createDeckRepository();

export const crystalTrialSetRepository: ICrystalTrialSetRepository = createCrystalTrialSetRepository();

export const deckWriter: IDeckContentWriter = deckContentWriter;
