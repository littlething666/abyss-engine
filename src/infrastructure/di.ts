import type { ICrystalTrialSetRepository, IDeckRepository } from '../types/repository';
import { createCrystalTrialSetRepository } from './crystalTrialSetRepositoryFactory';
import { createDeckRepository } from './deckRepositoryFactory';

export const deckRepository: IDeckRepository = createDeckRepository();

export const crystalTrialSetRepository: ICrystalTrialSetRepository = createCrystalTrialSetRepository();
