import React, { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { motion } from 'motion/react';
import type { TopicRef } from '@/types/core';
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
import { useCrystalGardenStore } from '../features/progression';
import { Button } from '@/components/ui/button';
import { InfoPopover } from '@/components/InfoPopover';
import { Switch } from './ui/switch';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
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
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { parseTopicRefKey, topicRefKey } from '@/lib/topicRef';
import { useTopicMetadata } from '../features/content';
import { deckRepository } from '../infrastructure/di';
import { topicCardsQueryKey } from '../hooks/useDeckData';
import { Card } from '../types/core';

const motionFadeInitial = { opacity: 0, scale: 0.95 };
const motionFadeAnimate = { opacity: 1, scale: 1 };
const motionFadeExit = { opacity: 0, scale: 0.95 };
const motionHoverScale = { scale: 1.02 };
const motionTapScale = { scale: 0.98 };

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
  // Phase 2 step 10 (round 2): activeCrystals reads now flow through the
  // crystal-garden store. Writes (the actual ritual submission) are still
  // delivered through the legacy onSubmit prop wiring; the crystal selector
  // here is read-only, so swapping the source is safe under the legacy mirror.
  const activeCrystals = useCrystalGardenStore((state) => state.activeCrystals);
  const activeTopicRefs = useMemo(() => {
    const seen = new Set<string>();
    const out: TopicRef[] = [];
    for (const c of activeCrystals) {
      const ref = { subjectId: c.subjectId, topicId: c.topicId };
      const k = topicRefKey(ref);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(ref);
    }
    return out;
  }, [activeCrystals]);
  const allTopicMetadata = useTopicMetadata(activeTopicRefs);
  const topicCardQueries = useQueries({
    queries: activeTopicRefs.map((ref) => {
      const k = topicRefKey(ref);
      const subjectId = allTopicMetadata[k]?.subjectId || ref.subjectId;
      return {
        queryKey: topicCardsQueryKey(subjectId, ref.topicId),
        queryFn: () => deckRepository.getTopicCards(subjectId, ref.topicId),
        enabled: Boolean(subjectId),
        staleTime: Infinity,
      };
    }),
  });
  const topicCardsByKey = useMemo(() => {
    const map = new Map<string, Card[]>();
    activeTopicRefs.forEach((ref, index) => {
      const cards = topicCardQueries[index]?.data;
      if (cards) {
        map.set(topicRefKey(ref), cards);
      }
    });
    return map;
  }, [activeTopicRefs, topicCardQueries]);
  const selectedTopicCards = useMemo(
    () => (targetCrystal ? topicCardsByKey.get(targetCrystal) ?? [] : []),
    [targetCrystal, topicCardsByKey],
  );
  const sectionBuffs = useMemo(() => ({
    biological: getCategoryBuffs('biological').map((definition) => BuffEngine.get().grantBuff(definition.id, 'biological')),
    cognitive: getCategoryBuffs('cognitive').map((definition) => BuffEngine.get().grantBuff(definition.id, 'cognitive')),
    quest: getCategoryBuffs('quest').map((definition) => BuffEngine.get().grantBuff(definition.id, 'quest')),
  }), []);
  const targetCrystalOptions = useMemo(() => {
    return activeTopicRefs
      .filter((ref) => ref.topicId.trim().length > 0)
      .map((ref) => {
        const k = topicRefKey(ref);
        return {
          value: k,
          label: allTopicMetadata[k]?.topicName || ref.topicId,
        };
      });
  }, [activeTopicRefs, allTopicMetadata]);

  const targetCrystalSelectItems = useMemo(
    () =>
      targetCrystalOptions.length > 0
        ? targetCrystalOptions
        : [{ value: '__empty__', label: 'No unlocked crystals' }],
    [targetCrystalOptions],
  );
  const microGoalSelectItems = useMemo(() => MICRO_GOAL_OPTIONS, []);

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
    const { subjectId, topicId } = parseTopicRefKey(targetCrystal);
    const result = onSubmit({
      subjectId,
      topicId,
      checklist: sanitizedChecklist,
    });

    if (!result) {
      return;
    }
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
          <DialogDescription className="flex items-center gap-1">
            <span className="min-w-0">
              {"Log today's focus conditions to charge your next review with buffs."}
            </span>
            <InfoPopover label="About the attunement ritual">
              <p>
                Each completed section (biology, mind, quest) grants a tiered buff that multiplies XP on your next
                review; partial fills are fine and only completed sections contribute.
              </p>
            </InfoPopover>
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 max-h-full overflow-y-auto px-4">
          <motion.div
            initial={motionFadeInitial}
            animate={motionFadeAnimate}
            exit={motionFadeExit}
            className="w-full"
          >
            {isSubmitBlockedByCooldown && (
              <p className="text-sm text-foreground mb-4">
                Ritual cooldown: {cooldownLabel} left.
              </p>
            )}
            <FieldSet className="gap-2 mb-5">
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
              <FieldGroup className="gap-1">
                <Field>
                  <FieldLabel>😴 Sleep (Biological Readiness)</FieldLabel>
                  <ToggleGroup
                    variant="outline"
                    value={sleepQuality ? [sleepQuality] : []}
                    onValueChange={(values) => setSleepQuality(values[0] ?? '')}
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
                    variant="outline"
                    value={fuelQuality ? [fuelQuality] : []}
                    onValueChange={(values) => setFuelQuality(values[0] ?? '')}
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
                    variant="outline"
                    value={hydration ? [hydration] : []}
                    onValueChange={(values) => setHydration(values[0] ?? '')}
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
                    variant="outline"
                    value={movementQuality ? [movementQuality] : []}
                    onValueChange={(values) => setMovementQuality(values[0] ?? '')}
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

            <FieldSet className="gap-2 mb-5">
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
              <FieldGroup className="gap-1">
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

            <FieldSet className="gap-2 mb-5">
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
              <FieldGroup className="gap-1">
                <Field>
                  <FieldLabel>💎 Target Crystal</FieldLabel>
                  <Select
                    items={targetCrystalSelectItems}
                    value={targetCrystal}
                    onValueChange={(value) => {
                      setTargetCrystal(value ?? '');
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a crystal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {targetCrystalSelectItems.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={option.value === '__empty__'}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>🎯 Micro-Goal</FieldLabel>
                  <Select
                    items={microGoalSelectItems}
                    value={microGoal}
                    onValueChange={(value) => {
                      setMicroGoal(value ?? '');
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a micro-goal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {microGoalSelectItems.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>🧠 Readiness (1-5)</FieldLabel>
                  <FieldContent>
                    <ToggleGroup
                      variant="outline"
                      value={confidenceRating === 0 ? [] : [String(confidenceRating)]}
                      onValueChange={(values) =>
                        setConfidenceRating(values.length > 0 ? Number(values[0]) : 0)
                      }
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
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          <motion.div whileHover={motionHoverScale} whileTap={motionTapScale}>
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
