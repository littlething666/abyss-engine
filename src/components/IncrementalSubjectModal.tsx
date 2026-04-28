'use client';

import React, { useEffect, useState } from 'react';
import { toast } from '@/infrastructure/toast';

import { Button } from '@/components/ui/button';
import { InfoPopover } from '@/components/InfoPopover';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { triggerSubjectGeneration } from '@/features/subjectGeneration';
import { deckRepository } from '@/infrastructure/di';
import { stringToKebabCaseId } from '@/lib/stringToKebabCaseId';
import type { LearningStyle, PriorKnowledge, StudyGoal } from '@/types/studyChecklist';
import { STUDY_CHECKLIST_DEFAULTS } from '@/types/studyChecklist';

const subjectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface IncrementalSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IncrementalSubjectModal({ isOpen, onClose }: IncrementalSubjectModalProps) {
  const [topicName, setTopicName] = useState('');
  const [studyGoal, setStudyGoal] = useState<StudyGoal>(STUDY_CHECKLIST_DEFAULTS.studyGoal);
  const [priorKnowledge, setPriorKnowledge] = useState<PriorKnowledge>(STUDY_CHECKLIST_DEFAULTS.priorKnowledge);
  const [learningStyle, setLearningStyle] = useState<LearningStyle>(STUDY_CHECKLIST_DEFAULTS.learningStyle);
  const [focusAreas, setFocusAreas] = useState('');
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setLocalError(null);
  }, [isOpen]);

  const derivedSubjectId = stringToKebabCaseId(topicName);

  const handleSubmit = async () => {
    setLocalError(null);
    const sid = derivedSubjectId;
    const name = topicName.trim();
    if (!name) {
      setLocalError('Enter what you want to learn (a few words are enough).');
      return;
    }
    if (!sid) {
      setLocalError('Could not derive a storage id from that text — try a clearer topic phrase.');
      return;
    }
    if (!subjectIdPattern.test(sid)) {
      setLocalError('Could not derive a valid subject id — use letters and words (e.g. machine learning basics).');
      return;
    }

    setSubmitting(true);
    try {
      const manifest = await deckRepository.getManifest({ includePregeneratedCurriculums: true });
      if (manifest.subjects.some((s) => s.id === sid)) {
        setLocalError(`A subject with id "${sid}" already exists. Use a different name.`);
        return;
      }

      // First-subject milestone tracking is owned by
      // src/infrastructure/eventBusHandlers.ts. The 'subject:generation-pipeline'
      // bus event is the canonical signal; presentation only triggers the
      // generation and closes its surface.
      triggerSubjectGeneration(sid, {
        topicName: name,
        studyGoal,
        priorKnowledge,
        learningStyle,
        focusAreas: focusAreas.trim() || undefined,
      });
      toast.success('Subject generation started — check progress in the HUD.');
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[95vh] flex-col gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New subject</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <span className="min-w-0">Create a new subject from a prompt.</span>
            <InfoPopover label="About subject generation">
              <p>
                The assistant drafts a three-tier topic outline and plants it as locked crystals; full study content
                only generates when you unlock a topic.
              </p>
            </InfoPopover>
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-3">
          <FieldSet>
            <Field>
              <FieldLabel htmlFor="subject-topic-name">What do you want to learn?</FieldLabel>
              <FieldContent>
                <Input
                  id="subject-topic-name"
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder="e.g. Machine learning math for data science"
                  autoComplete="off"
                />
              </FieldContent>
              <FieldDescription>
                Subject id (for storage):{' '}
                <span className="text-foreground font-mono text-xs">{derivedSubjectId || '—'}</span>
              </FieldDescription>
            </Field>
          </FieldSet>

          <Collapsible open={customizeOpen} onOpenChange={setCustomizeOpen}>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start px-0"
                  data-testid="incremental-subject-modal-customize-toggle"
                >
                  {customizeOpen ? '▼' : '▸'} Customize (optional)
                </Button>
              }
            />
            <CollapsibleContent className="space-y-4 pt-2">
              <Field>
                <FieldLabel>Goal</FieldLabel>
                <FieldContent>
                  <ToggleGroup
                    value={studyGoal ? [studyGoal] : []}
                    onValueChange={(values) => {
                      const next = values[0];
                      if (next) {
                        setStudyGoal(next as StudyGoal);
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="flex flex-wrap gap-1"
                  >
                    <ToggleGroupItem value="curiosity" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Curiosity
                    </ToggleGroupItem>
                    <ToggleGroupItem value="exam-prep" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Exam prep
                    </ToggleGroupItem>
                    <ToggleGroupItem value="career-switch" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Career switch
                    </ToggleGroupItem>
                    <ToggleGroupItem value="refresh" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Refresh
                    </ToggleGroupItem>
                  </ToggleGroup>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>Experience</FieldLabel>
                <FieldContent>
                  <ToggleGroup
                    value={priorKnowledge ? [priorKnowledge] : []}
                    onValueChange={(values) => {
                      const next = values[0];
                      if (next) {
                        setPriorKnowledge(next as PriorKnowledge);
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="flex flex-wrap gap-1"
                  >
                    <ToggleGroupItem value="none" className="min-h-10 flex-1 text-xs sm:flex-none">
                      None
                    </ToggleGroupItem>
                    <ToggleGroupItem value="beginner" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Beginner
                    </ToggleGroupItem>
                    <ToggleGroupItem value="intermediate" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Intermediate
                    </ToggleGroupItem>
                    <ToggleGroupItem value="advanced" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Advanced
                    </ToggleGroupItem>
                  </ToggleGroup>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel>Style</FieldLabel>
                <FieldContent>
                  <ToggleGroup
                    value={learningStyle ? [learningStyle] : []}
                    onValueChange={(values) => {
                      const next = values[0];
                      if (next) {
                        setLearningStyle(next as LearningStyle);
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="flex flex-wrap gap-1"
                  >
                    <ToggleGroupItem value="balanced" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Balanced
                    </ToggleGroupItem>
                    <ToggleGroupItem value="theory-heavy" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Theory
                    </ToggleGroupItem>
                    <ToggleGroupItem value="practice-heavy" className="min-h-10 flex-1 text-xs sm:flex-none">
                      Practice
                    </ToggleGroupItem>
                  </ToggleGroup>
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="subject-focus-areas">Focus areas (optional)</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="subject-focus-areas"
                    value={focusAreas}
                    onChange={(e) => setFocusAreas(e.target.value)}
                    rows={3}
                    placeholder="e.g. Prioritize transformers and evaluation metrics"
                    autoComplete="off"
                  />
                </FieldContent>
              </Field>
            </CollapsibleContent>
          </Collapsible>
        </FieldGroup>

        {localError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {localError}
          </div>
        ) : null}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <DialogClose render={<Button type="button" variant="outline" disabled={submitting} />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? 'Checking…' : 'Generate curriculum'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
