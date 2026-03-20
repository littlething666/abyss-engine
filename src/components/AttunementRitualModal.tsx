import React, { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  AttunementRitualPayload,
  AttunementRitualResult,
  AttunementRitualChecklist,
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
import { Button } from '@/components/ui/button';
import { Switch } from './ui/switch';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from './ui/field';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { useTopicMetadata } from '../features/content';
import { deckRepository } from '../infrastructure/di';
import { Card } from '../types/core';
import { telemetry } from '../features/telemetry';

interface AttunementRitualModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: AttunementRitualPayload) => AttunementRitualResult | null;
  cooldownRemainingMs?: number;
}

export function AttunementRitualModal({
  isOpen,
  onClose,
  onSubmit,
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
    const checklist: AttunementRitualChecklist = {};
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
    telemetry.log('attunement_ritual_submitted', {
      harmonyScore: result.harmonyScore,
      readinessBucket: result.readinessBucket,
      checklistKeys: Object.keys(sanitizedChecklist),
      buffsGranted: result.buffs.map((buff) => buff.buffId),
    }, {
      topicId: targetCrystal,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent
        className="max-h-[95vh] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle>🧪 Attunement Ritual</DialogTitle>
          <DialogDescription>
            Filling out the ritual will unlock focused growth effects.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 max-h-full overflow-y-auto px-4 no-scrollbar">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full"
          >
            {isSubmitBlockedByCooldown && (
              <p className="text-sm text-foreground mb-4">
                Ritual cooldown: {cooldownLabel} left.
              </p>
            )}
            <FieldSet className="space-y-2 mb-5">
              <FieldLegend>🧬 1. Biological Foundation</FieldLegend>
              <FieldDescription className="text-xs">Section unlocks</FieldDescription>
              <ul className="mb-3 flex flex-wrap gap-2 text-muted-foreground text-sm">
                {sectionBuffs.biological.map((buff) => (
                  <li key={buff.buffId}>
                    <Badge variant="secondary" className="text-xs">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden="true" className="text-lg">
                          {getBuffIcon(buff.modifierType)}
                        </span>
                        <span>{getBuffSummary(buff)}</span>
                      </span>
                    </Badge>
                  </li>
                ))}
              </ul>
              <FieldGroup className="space-y-1">
                <Field>
                  <FieldLabel>😴 Sleep (Biological Readiness)</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={sleepQuality}
                    onValueChange={setSleepQuality}
                  >
                    {SLEEP_OPTIONS.map((option) => (
                      <ToggleGroupItem key={option.value} value={option.value}>
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel>🍽️ Fuel Quality</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={fuelQuality}
                    onValueChange={setFuelQuality}
                  >
                    {FUEL_QUALITY_OPTIONS.map((option) => (
                      <ToggleGroupItem key={option.value} value={option.value}>
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel>💧 Hydration</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={hydration}
                    onValueChange={setHydration}
                  >
                    {HYDRATION_OPTIONS.map((option) => (
                      <ToggleGroupItem key={option.value} value={option.value}>
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
                <Field>
                  <FieldLabel>🏃 Movement</FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={movementQuality}
                    onValueChange={setMovementQuality}
                  >
                    {MOVEMENT_OPTIONS.map((option) => (
                      <ToggleGroupItem key={option.value} value={option.value}>
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet className="space-y-2 mb-5">
              <FieldLegend>🧠 2. Cognitive Environment</FieldLegend>
              <FieldDescription className="text-xs">Section unlocks</FieldDescription>
              <ul className="mb-3 flex flex-wrap gap-2 text-muted-foreground text-sm">
                {sectionBuffs.cognitive.map((buff) => (
                  <li key={buff.buffId}>
                    <Badge variant="secondary" className="text-xs">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden="true" className="text-lg">
                          {getBuffIcon(buff.modifierType)}
                        </span>
                        <span>{getBuffSummary(buff)}</span>
                      </span>
                    </Badge>
                  </li>
                ))}
              </ul>
              <FieldGroup className="space-y-1">
                <Field orientation="horizontal">
                  <Switch
                    id="cognitive-digital-silence"
                    checked={digitalSilence}
                    onCheckedChange={setDigitalSilence}
                  />
                  <FieldLabel htmlFor="cognitive-digital-silence">🔕 Digital Silence</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <Switch
                    id="cognitive-visual-clarity"
                    checked={visualClarity}
                    onCheckedChange={setVisualClarity}
                  />
                  <FieldLabel htmlFor="cognitive-visual-clarity">👁️ Visual Clarity</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <Switch
                    id="cognitive-lighting-and-air"
                    checked={lightingAndAir}
                    onCheckedChange={setLightingAndAir}
                  />
                  <FieldLabel htmlFor="cognitive-lighting-and-air">💡 Lighting &amp; Ventilation</FieldLabel>
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet className="space-y-2 mb-5">
              <FieldLegend>🎯 3. Quest Intent</FieldLegend>
              <FieldDescription className="text-xs">Section unlocks</FieldDescription>
              <ul className="mb-3 flex flex-wrap gap-2 text-muted-foreground text-sm">
                {sectionBuffs.quest.map((buff) => (
                  <li key={buff.buffId}>
                    <Badge variant="secondary" className="text-xs">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden="true" className="text-lg">
                          {getBuffIcon(buff.modifierType)}
                        </span>
                        <span>{getBuffSummary(buff)}</span>
                      </span>
                    </Badge>
                  </li>
                ))}
              </ul>
              <FieldGroup className="space-y-1">
                <Field>
                  <FieldLabel>💎 Target Crystal</FieldLabel>
                  <Select value={targetCrystal} onValueChange={setTargetCrystal}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a crystal" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetCrystalOptions.length === 0 ? (
                        <SelectItem value="__empty__" disabled>
                          No unlocked crystals
                        </SelectItem>
                      ) : (
                        targetCrystalOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>🎯 Micro-Goal</FieldLabel>
                  <Select value={microGoal} onValueChange={setMicroGoal}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a micro-goal" />
                    </SelectTrigger>
                    <SelectContent>
                      {MICRO_GOAL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>🧠 Readiness (1-5)</FieldLabel>
                  <FieldContent>
                    <ToggleGroup
                      variant="outline"
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
                  </FieldContent>
                </Field>
                {targetCrystal.length === 0 && (
                  <FieldDescription className="text-xs">
                    Pick a crystal to target this ritual.
                  </FieldDescription>
                )}
              </FieldGroup>
            </FieldSet>
          </motion.div>
        </div>
        <DialogFooter className="sticky bottom-0 z-20">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitBlockedByCooldown || !canStartWithSelection}
            >
              Submit Ritual
            </Button>
          </motion.div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
