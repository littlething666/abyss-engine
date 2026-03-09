import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AttunementPayload,
  AttunementResult,
  AttunementReadinessBucket,
  AttunementChecklistSubmission,
} from '../types/progression';
import {
  BuffEngine,
  getBuffIcon,
  getBuffSummary,
  getCategoryBuffs,
  groupBuffsByType,
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

interface AttunementRitualModalProps {
  isOpen: boolean;
  topicId: string;
  onClose: () => void;
  onSubmit: (payload: AttunementPayload) => AttunementResult | null;
  onStartSession: (result: AttunementResult) => void;
  onSkip: () => void;
}

function readinessLabel(bucket: AttunementReadinessBucket): string {
  return bucket === 'high'
    ? 'High'
    : bucket === 'medium'
      ? 'Medium'
      : 'Low';
}

export function AttunementRitualModal({
  isOpen,
  topicId,
  onClose,
  onSubmit,
  onStartSession,
  onSkip,
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
  const [submittedResult, setSubmittedResult] = useState<AttunementResult | null>(null);
  const activeCrystals = useProgressionStore((state) => state.activeCrystals);
  const activeCrystalTopicIds = useMemo(() => activeCrystals.map((item) => item.topicId), [activeCrystals]);
  const sectionBuffs = useMemo(() => ({
    biological: getCategoryBuffs('biological').map((definition) => BuffEngine.get().grantBuff(definition.id, 'biological')),
    cognitive: getCategoryBuffs('cognitive').map((definition) => BuffEngine.get().grantBuff(definition.id, 'cognitive')),
    quest: getCategoryBuffs('quest').map((definition) => BuffEngine.get().grantBuff(definition.id, 'quest')),
  }), []);
  const targetCrystalOptions = useMemo(() => {
    const seen = new Set<string>();
    const uniqueTopicIds = [...activeCrystalTopicIds];
    return uniqueTopicIds
      .filter((id) => id.trim().length > 0)
      .filter((id) => {
        if (seen.has(id)) {
          return false;
        }
        seen.add(id);
        return true;
      })
      .map((id) => ({
        value: id,
        label: id,
      }));
  }, [activeCrystalTopicIds]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
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
    setSubmittedResult(null);
  }, [isOpen]);

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

  const resetAndStart = (result: AttunementResult) => {
    onStartSession(result);
    onClose();
  };

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  const handleSubmit = () => {
    const result = onSubmit({
      topicId,
      checklist: sanitizedChecklist,
    });

    if (!result) {
      return;
    }
    setSubmittedResult(result);
  };

  const handleContinue = () => {
    if (!submittedResult) {
      return;
    }
    resetAndStart(submittedResult);
    setSubmittedResult(null);
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
          onClick={handleSkip}
          className="absolute top-3 right-4 text-slate-300 hover:text-white text-2xl leading-none"
          aria-label="Skip ritual and close"
        >
          ×
        </button>
        <h2 className="text-2xl mb-2 text-cyan-200">🧪 Attunement Ritual</h2>
        {!submittedResult && (
          <>
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
                  variant="outline"
                  onClick={handleSkip}
                  className="bg-slate-600 hover:bg-slate-500 border-none"
                >
                  Skip Ritual
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleSubmit}
                  className="bg-violet-500 hover:bg-violet-400"
                >
                  Submit Ritual
                </Button>
              </motion.div>
            </div>
          </>
        )}

        {submittedResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="p-3 rounded-lg bg-slate-900 border border-emerald-500/40">
              <p className="text-emerald-300 mb-2 font-semibold">
                {submittedResult.buffs.length > 0
                  ? 'Unlocks Granted'
                  : 'No Unlocks'} (Harmony {submittedResult.harmonyScore} / {readinessLabel(submittedResult.readinessBucket)}).
              </p>
              {submittedResult.buffs.length > 0 ? (
                <div className="text-sm text-slate-200 flex flex-wrap items-center gap-2">
                  <span className="text-emerald-300 font-semibold">Unlocks:</span>
                  {groupBuffsByType(submittedResult.buffs).map((buff) => (
                    <span key={buff.modifierType} className="inline-flex items-center gap-2">
                      <span className="text-xl" aria-hidden="true">{getBuffIcon(buff.modifierType)}</span>
                      <span>{getBuffSummary(buff)}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-300">No buffs triggered this session.</p>
              )}
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleContinue}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  Begin Study
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </ModalWrapper>
  );
}
