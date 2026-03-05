import React, { useEffect, useMemo, useState } from 'react';
import { AttunementPayload, AttunementResult, AttunementReadinessBucket } from '../types/progression';
import { getAllBuffVisuals, getBuffIcon, getBuffSummary } from '../features/progression/buffDisplay';

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
  const [sleepHours, setSleepHours] = useState('');
  const [movementMinutes, setMovementMinutes] = useState('');
  const [confidenceRating, setConfidenceRating] = useState(3);
  const [ateFuel, setAteFuel] = useState(false);
  const [digitalSilence, setDigitalSilence] = useState(false);
  const [visualClarity, setVisualClarity] = useState(false);
  const [lightingAndAir, setLightingAndAir] = useState(false);
  const [targetCrystal, setTargetCrystal] = useState('');
  const [microGoal, setMicroGoal] = useState('');
  const [submittedResult, setSubmittedResult] = useState<AttunementResult | null>(null);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSleepHours('');
    setMovementMinutes('');
    setConfidenceRating(3);
    setAteFuel(false);
    setDigitalSilence(false);
    setVisualClarity(false);
    setLightingAndAir(false);
    setTargetCrystal('');
    setMicroGoal('');
    setSubmittedResult(null);
  }, [isOpen]);

  const canSubmit = useMemo(() => microGoal.trim().length > 0 && targetCrystal.trim().length > 0, [microGoal, targetCrystal]);

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
      checklist: {
        sleepHours: Number.parseInt(sleepHours, 10) || 0,
        ateFuel,
        movementMinutes: Number.parseInt(movementMinutes, 10) || 0,
        digitalSilence,
        visualClarity,
        lightingAndAir,
        targetCrystal,
        microGoal,
        confidenceRating,
      },
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
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-[min(90%,720px)] max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl mb-2 text-cyan-200">🧪 Attunement Ritual</h2>
        {!submittedResult && (
          <div className="mb-6">
            <p className="text-slate-300 text-sm mb-2">
              <span className="font-semibold text-slate-200">Unlocks:</span>
              <span className="ml-2 flex flex-wrap items-center gap-3">
                {getAllBuffVisuals().map((buffVisual) => (
                  <span
                    key={buffVisual.modifierType}
                    className="inline-flex items-center gap-2 text-slate-200"
                  >
                    <span className="text-xl" aria-hidden="true">
                      {buffVisual.icon}
                    </span>
                    <span>{buffVisual.name}</span>
                  </span>
                ))}
              </span>
            </p>
          </div>
        )}

        {!submittedResult && (
          <>
            <section className="space-y-2 mb-5">
              <h3 className="text-slate-200">1. Biological Foundation</h3>
              <label className="text-sm text-slate-300 block">
                Sleep Hours
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={sleepHours}
                  onChange={(event) => setSleepHours(event.target.value)}
                  className="ml-2 rounded bg-slate-900 border border-slate-700 px-2 py-1 w-20"
                />
              </label>
              <label className="text-sm text-slate-300 block">
                <input
                  type="checkbox"
                  checked={ateFuel}
                  onChange={(event) => setAteFuel(event.target.checked)}
                  className="mr-2"
                />
                Fuel Check: Protein/complex carbs consumed within 3h
              </label>
              <label className="text-sm text-slate-300 block">
                Movement Minutes
                <input
                  type="number"
                  min={0}
                  value={movementMinutes}
                  onChange={(event) => setMovementMinutes(event.target.value)}
                  className="ml-2 rounded bg-slate-900 border border-slate-700 px-2 py-1 w-20"
                />
              </label>
            </section>

            <section className="space-y-2 mb-5">
              <h3 className="text-slate-200">2. Cognitive Environment</h3>
              <label className="text-sm text-slate-300 block">
                <input
                  type="checkbox"
                  checked={digitalSilence}
                  onChange={(event) => setDigitalSilence(event.target.checked)}
                  className="mr-2"
                />
                Digital Silence
              </label>
              <label className="text-sm text-slate-300 block">
                <input
                  type="checkbox"
                  checked={visualClarity}
                  onChange={(event) => setVisualClarity(event.target.checked)}
                  className="mr-2"
                />
                Single-tasking + Visual Clarity
              </label>
              <label className="text-sm text-slate-300 block">
                <input
                  type="checkbox"
                  checked={lightingAndAir}
                  onChange={(event) => setLightingAndAir(event.target.checked)}
                  className="mr-2"
                />
                Lighting & Ventilation
              </label>
            </section>

            <section className="space-y-2 mb-5">
              <h3 className="text-slate-200">3. Quest Intent</h3>
              <label className="text-sm text-slate-300 block">
                Target Crystal
                <input
                  value={targetCrystal}
                  onChange={(event) => setTargetCrystal(event.target.value)}
                  className="ml-2 rounded bg-slate-900 border border-slate-700 px-2 py-1 w-56"
                  placeholder="e.g. Linear Algebra"
                />
              </label>
              <label className="text-sm text-slate-300 block">
                Micro-goal
                <input
                  value={microGoal}
                  onChange={(event) => setMicroGoal(event.target.value)}
                  className="ml-2 rounded bg-slate-900 border border-slate-700 px-2 py-1 w-64"
                  placeholder="e.g. Learn 10 cards"
                />
              </label>
              <label className="text-sm text-slate-300 block">
                Readiness (1-5)
                <select
                  value={confidenceRating}
                  onChange={(event) => setConfidenceRating(Number(event.target.value))}
                  className="ml-2 rounded bg-slate-900 border border-slate-700 px-2 py-1"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>
              </label>
            </section>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleSkip}
                className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded"
              >
                Skip Ritual
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`px-4 py-2 rounded ${canSubmit ? 'bg-violet-500 hover:bg-violet-400' : 'bg-slate-700'} text-white`}
              >
                Submit Ritual
              </button>
            </div>
          </>
        )}

        {submittedResult && (
          <div>
            <div className="p-3 rounded-lg bg-slate-900 border border-emerald-500/40">
                <p className="text-emerald-300 mb-2 font-semibold">
                  {submittedResult.buffs.length > 0
                    ? 'Unlocks Granted'
                    : 'No Unlocks'} (Harmony {submittedResult.harmonyScore} / {readinessLabel(submittedResult.readinessBucket)}).
                </p>
              {submittedResult.buffs.length > 0 ? (
                <div className="text-sm text-slate-200 flex flex-wrap items-center gap-2">
                  <span className="text-emerald-300 font-semibold">Unlocks:</span>
                  {submittedResult.buffs.map((buff) => (
                    <span key={buff.buffId} className="inline-flex items-center gap-2">
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
              <button
                type="button"
                onClick={handleContinue}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded"
              >
                Begin Study
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

