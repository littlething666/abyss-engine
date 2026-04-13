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
import {
  AbyssDialog,
  AbyssDialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/abyss-dialog';
import { useTopicMetadata } from '../features/content';
import { deckRepository } from '../infrastructure/di';
import { topicCardsQueryKey } from '../hooks/useDeckData';
import { Card } from '../types/core';

const MOTION_ENTER = { opacity: 0, y: 20 };
const MOTION_VISIBLE = { opacity: 1, y: 0 };
const MOTION_HOVER = { scale: 1.02 };
const MOTION_TAP = { scale: 0.98 };

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
        queryKey: topicCardsQueryKey(subjectId, topicId),
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
      if (cards) map.set(topicId, cards);
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
      .map((topicId) => ({ value: topicId, label: allTopicMetadata[topicId]?.topicName || topicId }));
  }, [activeTopicIds, allTopicMetadata]);

  const cooldownHours = Math.max(0, Math.floor(remainingCooldownMs / (60 * 60 * 1000)));
  const cooldownMinutes = Math.max(0, Math.floor((remainingCooldownMs % (60 * 60 * 1000)) / (60 * 1000)));
  const cooldownLabel = cooldownHours > 0 ? `${cooldownHours}h ${cooldownMinutes}m` : `${cooldownMinutes}m`;
  const isSubmitBlockedByCooldown = remainingCooldownMs > 0;
  const canStartWithSelection = targetCrystal.length > 0 && selectedTopicCards.length > 0;

  useEffect(() => {
    if (!isOpen) { setRemainingCooldownMs(cooldownRemainingMs); return; }
    setRemainingCooldownMs(cooldownRemainingMs);
    setSleepQuality(''); setMovementQuality(''); setFuelQuality(''); setHydration('');
    setConfidenceRating(0); setDigitalSilence(false); setVisualClarity(false); setLightingAndAir(false);
    setTargetCrystal(''); setMicroGoal('');
  }, [cooldownRemainingMs, isOpen]);

  useEffect(() => {
    if (!isOpen || remainingCooldownMs <= 0) return;
    const interval = window.setInterval(() => { setRemainingCooldownMs((value) => Math.max(0, value - 1000)); }, 1000);
    return () => { window.clearInterval(interval); };
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
    if (isCognitiveComplete) { checklist.digitalSilence = digitalSilence; checklist.visualClarity = visualClarity; checklist.lightingAndAir = lightingAndAir; }
    if (isQuestComplete) { checklist.confidenceRating = confidenceRating; checklist.targetCrystal = targetCrystal; Object.assign(checklist, getChecklistForSelection(MICRO_GOAL_OPTIONS, microGoal)); }
    return checklist;
  }, [confidenceRating, microGoal, isBiologicalComplete, isCognitiveComplete, isQuestComplete, movementQuality, sleepQuality, targetCrystal, digitalSilence, visualClarity, lightingAndAir, fuelQuality, hydration]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!targetCrystal || !canStartWithSelection) return;
    // Resolve subjectId from crystal (persisted) or metadata (async fallback)
    const crystal = activeCrystals.find((c) => c.topicId === targetCrystal);
    const subjectId = crystal?.subjectId ?? allTopicMetadata[targetCrystal]?.subjectId ?? '';
    if (!subjectId) return;
    const result = onSubmit({ subjectId, topicId: targetCrystal, checklist: sanitizedChecklist });
    if (!result) return;
    onClose();
  };

  return (
    <AbyssDialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AbyssDialogContent className="max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>\uD83E\uDDEA Attunement Ritual</DialogTitle>
          <DialogDescription>Filling out the ritual will unlock focused growth effects.</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 max-h-full overflow-y-auto px-4">
          <motion.div initial={MOTION_ENTER} animate={MOTION_VISIBLE} exit={MOTION_ENTER} className="w-full">
            {isSubmitBlockedByCooldown && (<p className="text-sm text-foreground mb-4">Ritual cooldown: {cooldownLabel} left.</p>)}
            <FieldSet className="space-y-2 mb-5">
              <FieldLegend>\uD83E\uDDEC 1. Biological Foundation</FieldLegend>
              <FieldDescription className="text-xs">Section unlocks</FieldDescription>
              <ul className="mb-3 flex flex-wrap gap-2 text-muted-foreground text-sm">
                {sectionBuffs.biological.map((buff) => (<li key={buff.buffId}><Badge variant="secondary" className="text-xs"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="text-lg">{getBuffIcon(buff.modifierType)}</span><span>{getBuffSummary(buff)}</span></span></Badge></li>))}
              </ul>
              <FieldGroup className="space-y-1">
                <Field><FieldLabel>\uD83D\uDE34 Sleep (Biological Readiness)</FieldLabel><ToggleGroup type="single" variant="outline" value={sleepQuality} onValueChange={setSleepQuality}>{SLEEP_OPTIONS.map((option) => (<ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>))}</ToggleGroup></Field>
                <Field><FieldLabel>\uD83C\uDF7D\uFE0F Fuel Quality</FieldLabel><ToggleGroup type="single" variant="outline" value={fuelQuality} onValueChange={setFuelQuality}>{FUEL_QUALITY_OPTIONS.map((option) => (<ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>))}</ToggleGroup></Field>
                <Field><FieldLabel>\uD83D\uDCA7 Hydration</FieldLabel><ToggleGroup type="single" variant="outline" value={hydration} onValueChange={setHydration}>{HYDRATION_OPTIONS.map((option) => (<ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>))}</ToggleGroup></Field>
                <Field><FieldLabel>\uD83C\uDFC3 Movement</FieldLabel><ToggleGroup type="single" variant="outline" value={movementQuality} onValueChange={setMovementQuality}>{MOVEMENT_OPTIONS.map((option) => (<ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>))}</ToggleGroup></Field>
              </FieldGroup>
            </FieldSet>
            <FieldSet className="space-y-2 mb-5">
              <FieldLegend>\uD83E\uDDE0 2. Cognitive Environment</FieldLegend>
              <FieldDescription className="text-xs">Section unlocks</FieldDescription>
              <ul className="mb-3 flex flex-wrap gap-2 text-muted-foreground text-sm">
                {sectionBuffs.cognitive.map((buff) => (<li key={buff.buffId}><Badge variant="secondary" className="text-xs"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="text-lg">{getBuffIcon(buff.modifierType)}</span><span>{getBuffSummary(buff)}</span></span></Badge></li>))}
              </ul>
              <FieldGroup className="space-y-1">
                <Field orientation="horizontal"><Switch id="cognitive-digital-silence" checked={digitalSilence} onCheckedChange={setDigitalSilence} /><FieldLabel htmlFor="cognitive-digital-silence">\uD83D\uDD15 Digital Silence</FieldLabel></Field>
                <Field orientation="horizontal"><Switch id="cognitive-visual-clarity" checked={visualClarity} onCheckedChange={setVisualClarity} /><FieldLabel htmlFor="cognitive-visual-clarity">\uD83D\uDC41\uFE0F Visual Clarity</FieldLabel></Field>
                <Field orientation="horizontal"><Switch id="cognitive-lighting-and-air" checked={lightingAndAir} onCheckedChange={setLightingAndAir} /><FieldLabel htmlFor="cognitive-lighting-and-air">\uD83D\uDCA1 Lighting & Ventilation</FieldLabel></Field>
              </FieldGroup>
            </FieldSet>
            <FieldSet className="space-y-2 mb-5">
              <FieldLegend>\uD83C\uDFAF 3. Quest Intent</FieldLegend>
              <FieldDescription className="text-xs">Section unlocks</FieldDescription>
              <ul className="mb-3 flex flex-wrap gap-2 text-muted-foreground text-sm">
                {sectionBuffs.quest.map((buff) => (<li key={buff.buffId}><Badge variant="secondary" className="text-xs"><span className="inline-flex items-center gap-2"><span aria-hidden="true" className="text-lg">{getBuffIcon(buff.modifierType)}</span><span>{getBuffSummary(buff)}</span></span></Badge></li>))}
              </ul>
              <FieldGroup className="space-y-1">
                <Field><FieldLabel>\uD83D\uDC8E Target Crystal</FieldLabel><Select value={targetCrystal} onValueChange={setTargetCrystal}><SelectTrigger className="w-full"><SelectValue placeholder="Pick a crystal" /></SelectTrigger><SelectContent>{targetCrystalOptions.length === 0 ? (<SelectItem value="__empty__" disabled>No unlocked crystals</SelectItem>) : (targetCrystalOptions.map((option) => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)))}</SelectContent></Select></Field>
                <Field><FieldLabel>\uD83C\uDFAF Micro-Goal</FieldLabel><Select value={microGoal} onValueChange={setMicroGoal}><SelectTrigger className="w-full"><SelectValue placeholder="Pick a micro-goal" /></SelectTrigger><SelectContent>{MICRO_GOAL_OPTIONS.map((option) => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}</SelectContent></Select></Field>
                <Field><FieldLabel>\uD83E\uDDE0 Readiness (1-5)</FieldLabel><FieldContent><ToggleGroup variant="outline" type="single" value={confidenceRating === 0 ? '' : String(confidenceRating)} onValueChange={(value) => setConfidenceRating(value.length ? Number(value) : 0)}>{[1, 2, 3, 4, 5].map((rating) => (<ToggleGroupItem key={rating} value={String(rating)}>{rating}</ToggleGroupItem>))}</ToggleGroup></FieldContent></Field>
                {targetCrystal.length === 0 && (<FieldDescription className="text-xs">Pick a crystal to target this ritual.</FieldDescription>)}
              </FieldGroup>
            </FieldSet>
          </motion.div>
        </div>
        <DialogFooter className="sticky bottom-0 z-20">
          <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
          <motion.div whileHover={MOTION_HOVER} whileTap={MOTION_TAP}>
            <Button onClick={handleSubmit} disabled={isSubmitBlockedByCooldown || !canStartWithSelection}>Submit Ritual</Button>
          </motion.div>
        </DialogFooter>
      </AbyssDialogContent>
    </AbyssDialog>
  );
}
