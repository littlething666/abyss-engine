import React, { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  AttunementPayload,
  AttunementResult,
  AttunementChecklistSubmission,
} from '../types/progression';
import {
  BuffEngine,
  getBuffIcon,
  getBuffSummary,
  getCategoryBuffs,
  FUEL_QUALITY_OPTIONS,
  getChecklistForSelection,
  HYDRATION_OPTIONS,
  MICRO_GOAL_OPTIONS,
  MOVEMENT_OPTIONS,
  SLEEP_OPTIONS,
} from '../features/progression';
import { useProgressionStore } from '../features/progression';
import { Button } from './ui/button';
import { NativeSelect } from './ui/native-select';
import { Switch } from './ui/switch';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { ModalWrapper } from './ui/modal-wrapper';
import { useTopicMetadata } from '../features/content';
import { deckRepository } from '../infrastructure/di';
import { Card } from '../types/core';

interface AttunementRitualModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: AttunementPayload) => AttunementResult | null;
  onStartSession: (result: AttunementResult, topicId: string, cards: Card[]) => void;
  cooldownRemainingMs?: number;
}

export function AttunementRitualModal({
  isOpen,
  onClose,
  onSubmit,
  onStartSession,
  cooldownRemainingMs = 0,
}: AttunementRitualModalProps) {
  const [sleepQuality, setSleepQuality] = useState('');
  const [movementQuality, setMovementQuality] = useState('');
  const [fuelQuality, setFuelQuality] = useState('');
  const [hydration, setHydration] = useState('');
  const [confidenceRating, setConfidenceRating] = useState(0);
  const [digitalSilence, setDigitalSilence] = useState(false);
  const [visualClarity, setVisualClarity] = useState(false);
  const [lightingAndAir, setLightingAndAir] = useState(false);
  const [targetCrystal, setTargetCrystal] = useState('');
  const [microGoal, setMicroGoal] = useState('');
  const [remainingCooldownMs, setRemainingCooldownMs] = useState<number>(cooldownRemainingMs);
  const activeCrystals = useProgressionStore((state) => state.activeCrystals);
  const activeCrystalTopicIds = useMemo(() => activeCrystals.map((item) => item.topicId), [activeCrystals]);
  const activeTopicIds = useMemo(() => Array.from(new Set(activeCrystalTopicIds)), [activeCrystalTopicIds]);
  const allTopicMetadata = useTopicMetadata(activeTopicIds);
  const topicCardQueries = useQueries({
    queries: activeTopicIds.map((topicId) => {
      const subjectId = allTopicMetadata[topicId]?.subjectId || '';
      return {
        queryKey: ['content', 'topic-cards', subjectId, topicId],
        queryFn: () => deckRepository.getTopicCards(subjectId, topicId),
        enabled: Boolean(subjectId),
        staleTime: Infinity,
      };
    }),
  });
  const topicCardsById = useMemo(() => {
    const map = new Map<string, Card[]>();
    activeTopicIds.forEach((topicId, index) => {
      const cards = topicCardQueries[index]?.data;
      if (cards) {
        map.set(topicId, cards);
      }
    });
    return map;
  }, [activeTopicIds, topicCardQueries]);
  const selectedTopicCards = useMemo(() => (targetCrystal ? topicCardsById.get(targetCrystal) ?? [] : []), [targetCrystal, topicCardsById]);
  const sectionBuffs = useMemo(() => ({
    biological: getCategoryBuffs('biological').map((definition) => BuffEngine.get().grantBuff(definition.id, 'biological')),
    cognitive: getCategoryBuffs('cognitive').map((definition) => BuffEngine.get().grantBuff(definition.id, 'cognitive')),
    quest: getCategoryBuffs('quest').map((definition) => BuffEngine.get().grantBuff(definition.id, 'quest')),
  }), []);
  const targetCrystalOptions = useMemo(() => {
    return activeTopicIds
      .filter((topicId) => topicId.trim().length > 0)
      .map((topicId) => ({
        value: topicId,
        label: allTopicMetadata[topicId]?.topicName || topicId,
      }));
  }, [activeTopicIds, allTopicMetadata]);

  const cooldownHours = Math.max(0, Math.floor(remainingCooldownMs / (60 * 60 * 1000)));
  const cooldownMinutes = Math.max(
    0,
    Math.floor((remainingCooldownMs % (60 * 60 * 1000)) / (60 * 1000)),
  );
  const cooldownLabel = cooldownHours > 0 ? `${cooldownHours}h ${cooldownMinutes}m` : `${cooldownMinutes}m`;
  const isSubmitBlockedByCooldown = remainingCooldownMs > 0;
  const canStartWithSelection = targetCrystal.length > 0 && selectedTopicCards.length > 0;

  useEffect(() => {
    if (!isOpen) {
      setRemainingCooldownMs(cooldownRemainingMs);
      return;
    }
    setRemainingCooldownMs(cooldownRemainingMs);
    setSleepQuality('');
    setMovementQuality('');
    setFuelQuality('');
    setHydration('');
    setConfidenceRating(0);
    setDigitalSilence(false);
    setVisualClarity(false);
    setLightingAndAir(false);
    setTargetCrystal('');
    setMicroGoal('');
  }, [cooldownRemainingMs, isOpen]);

  useEffect(() => {
    if (!isOpen || remainingCooldownMs <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingCooldownMs((value) => Math.max(0, value - 1000));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isOpen, remainingCooldownMs]);

  const isBiologicalComplete = Boolean(sleepQuality && movementQuality && fuelQuality && hydration);
  const isCognitiveComplete = digitalSilence && visualClarity && lightingAndAir;
  const isQuestComplete = confidenceRating > 0 && targetCrystal.trim().length > 0 && microGoal.trim().length > 0;
  const sanitizedChecklist = useMemo(() => {
    const checklist: AttunementChecklistSubmission = {};
    if (isBiologicalComplete) {
      Object.assign(checklist, getChecklistForSelection(SLEEP_OPTIONS, sleepQuality));
      Object.assign(checklist, getChecklistForSelection(MOVEMENT_OPTIONS, movementQuality));
      Object.assign(checklist, getChecklistForSelection(FUEL_QUALITY_OPTIONS, fuelQuality));
      Object.assign(checklist, getChecklistForSelection(HYDRATION_OPTIONS, hydration));
    }
    if (isCognitiveComplete) {
      checklist.digitalSilence = digitalSilence;
      checklist.visualClarity = visualClarity;
      checklist.lightingAndAir = lightingAndAir;
    }
    if (isQuestComplete) {
      checklist.confidenceRating = confidenceRating;
      checklist.targetCrystal = targetCrystal;
      Object.assign(checklist, getChecklistForSelection(MICRO_GOAL_OPTIONS, microGoal));
    }
    return checklist;
  }, [confidenceRating, microGoal, isBiologicalComplete, isCognitiveComplete, isQuestComplete, movementQuality, sleepQuality, targetCrystal, digitalSilence, visualClarity, lightingAndAir, fuelQuality, hydration]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = () => {
    if (!targetCrystal || !canStartWithSelection) {
      return;
    }
    const result = onSubmit({
      topicId: targetCrystal,
      checklist: sanitizedChecklist,
    });

    if (!result) {
      return;
    }
    onStartSession(result, targetCrystal, selectedTopicCards);
    onClose();
  };

  return (
    <ModalWrapper onClose={onClose} panelClassName="w-[min(95%,48rem)]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full h-full overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-4 text-slate-300 hover:text-white text-2xl leading-none"
          aria-label="Close ritual modal"
        >
          ×
        </button>
        <h2 className="text-2xl mb-2 text-cyan-200">🧪 Attunement Ritual</h2>
        <p className="text-sm text-slate-300 mb-4">
          Filling out the ritual will unlock focused growth effects.
        </p>
        {isSubmitBlockedByCooldown && (
          <p className="text-sm text-amber-300 mb-4">
            Ritual cooldown: {cooldownLabel} left.
          </p>
        )}
      <section className="space-y-2 mb-5">
        <h3 className="text-slate-200">🧬 1. Biological Foundation</h3>
        <p className="text-xs text-slate-300 mb-1">Section unlocks</p>
        <ul className="mb-3 flex flex-wrap gap-2 text-slate-300 text-sm">
          {sectionBuffs.biological.map((buff) => (
            <li key={buff.buffId} className="inline-flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
              <span className="text-lg" aria-hidden="true">
                {getBuffIcon(buff.modifierType)}
              </span>
              <span>{getBuffSummary(buff)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">😴 Sleep (Biological Readiness)</label>
          <ToggleGroup
            value={sleepQuality}
            onValueChange={setSleepQuality}
          >
            {SLEEP_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">🍽️ Fuel Quality</label>
          <ToggleGroup
            value={fuelQuality}
            onValueChange={setFuelQuality}
          >
            {FUEL_QUALITY_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">💧 Hydration</label>
          <ToggleGroup
            value={hydration}
            onValueChange={setHydration}
          >
            {HYDRATION_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">🏃 Movement</label>
          <ToggleGroup
            value={movementQuality}
            onValueChange={setMovementQuality}
          >
            {MOVEMENT_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </section>

      <section className="space-y-2 mb-5">
        <h3 className="text-slate-200">🧠 2. Cognitive Environment</h3>
        <p className="text-xs text-slate-300 mb-1">Section unlocks</p>
        <ul className="mb-3 flex flex-wrap gap-2 text-slate-300 text-sm">
          {sectionBuffs.cognitive.map((buff) => (
            <li key={buff.buffId} className="inline-flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
              <span className="text-lg" aria-hidden="true">
                {getBuffIcon(buff.modifierType)}
              </span>
              <span>{getBuffSummary(buff)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">🔕 Digital Silence</label>
          <Switch
            checked={digitalSilence}
            onCheckedChange={setDigitalSilence}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">👁️ Visual Clarity</label>
          <Switch
            checked={visualClarity}
            onCheckedChange={setVisualClarity}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">💡 Lighting & Ventilation</label>
          <Switch
            checked={lightingAndAir}
            onCheckedChange={setLightingAndAir}
          />
        </div>
      </section>

      <section className="space-y-2 mb-5">
        <h3 className="text-slate-200">🎯 3. Quest Intent</h3>
        <p className="text-xs text-slate-300 mb-1">Section unlocks</p>
        <ul className="mb-3 flex flex-wrap gap-2 text-slate-300 text-sm">
          {sectionBuffs.quest.map((buff) => (
            <li key={buff.buffId} className="inline-flex items-center gap-2 rounded border border-slate-700 px-2 py-1">
              <span className="text-lg" aria-hidden="true">
                {getBuffIcon(buff.modifierType)}
              </span>
              <span>{getBuffSummary(buff)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">💎 Target Crystal</label>
          <NativeSelect
            value={targetCrystal}
            onValueChange={setTargetCrystal}
            placeholder="Pick a crystal"
            options={[
              ...(targetCrystalOptions.length === 0
                ? [{ value: '__empty__', label: 'No unlocked crystals', disabled: true }]
                : targetCrystalOptions),
            ]}
          />
          {targetCrystal.length === 0 && (
            <p className="text-xs text-slate-400">
              Pick a crystal to target this ritual.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">🎯 Micro-Goal</label>
          <NativeSelect
            value={microGoal}
            onValueChange={setMicroGoal}
            placeholder="Pick a micro-goal"
            options={MICRO_GOAL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-slate-300">🧠 Readiness (1-5)</label>
          <ToggleGroup
            type="single"
            value={confidenceRating === 0 ? '' : String(confidenceRating)}
            onValueChange={(value) => setConfidenceRating(value.length ? Number(value) : 0)}
          >
            {[1, 2, 3, 4, 5].map((rating) => (
              <ToggleGroupItem key={rating} value={String(rating)}>
                {rating}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </section>

      <div className="flex gap-3 justify-end">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitBlockedByCooldown || !canStartWithSelection}
            className="bg-violet-500 hover:bg-violet-400"
          >
            Submit Ritual
          </Button>
        </motion.div>
      </div>
      </motion.div>
    </ModalWrapper>
  );
}
