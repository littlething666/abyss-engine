'use client';

import React, { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  AbyssDialog,
  AbyssDialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/abyss-dialog';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';
import { useIncrementalSubjectCurriculum } from '@/hooks/useIncrementalSubjectCurriculum';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useThinkingToggle } from '@/hooks/useThinkingToggle';
import { stringToKebabCaseId } from '@/lib/stringToKebabCaseId';
import { AscentWeaverCurriculumInferenceSurface } from './AscentWeaverCurriculumInferenceSurface';
import { CopyableLlmTextBlock } from './CopyableLlmTextBlock';
import { LlmThinkingToggle } from './LlmThinkingToggle';
import { LLM_INFERENCE_SURFACE_OUTSIDE_GUARD_SELECTOR } from './ResponsiveLlmInferenceSurface';

const subjectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface IncrementalSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after curriculum is validated and written to IndexedDB. */
  onSuccess?: () => void;
}

export function IncrementalSubjectModal({ isOpen, onClose, onSuccess }: IncrementalSubjectModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const weaverThinking = useThinkingToggle('ascentWeaver');
  const {
    generateAndApply,
    pending,
    error,
    lastRawResponse,
    streamingAssistantText,
    streamingReasoningText,
    reset,
  } = useIncrementalSubjectCurriculum({
    chat: getChatCompletionsRepositoryForSurface('ascentWeaver'),
    writer: deckWriter,
    enableThinking: weaverThinking.enableThinking,
  });

  const [learningPrompt, setLearningPrompt] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [inferenceSurfaceOpen, setInferenceSurfaceOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInferenceSurfaceOpen(false);
      reset();
      return;
    }
    reset();
    setLocalError(null);
  }, [isOpen, reset]);

  const derivedSubjectId = stringToKebabCaseId(learningPrompt);

  const handleSubmit = async () => {
    setLocalError(null);
    const sid = derivedSubjectId;
    if (!sid) {
      setLocalError('Describe what you want to learn (a few words are enough).');
      return;
    }
    if (!subjectIdPattern.test(sid)) {
      setLocalError('Could not derive a valid subject id — use letters and words (e.g. machine learning basics).');
      return;
    }

    setInferenceSurfaceOpen(true);

    const ok = await generateAndApply({
      subjectId: sid,
      learningPrompt: learningPrompt.trim(),
    });

    if (ok) {
      setInferenceSurfaceOpen(false);
      onSuccess?.();
      onClose();
    }
  };

  const displayError = localError ?? error;

  return (
    <>
      <AscentWeaverCurriculumInferenceSurface
        isDesktop={isDesktop}
        surfaceOpen={inferenceSurfaceOpen}
        onSurfaceOpenChange={setInferenceSurfaceOpen}
        onDismissOutside={() => setInferenceSurfaceOpen(false)}
        isPending={pending}
        assistantText={streamingAssistantText}
        reasoningText={streamingReasoningText}
        errorMessage={displayError}
        headerAction={
          <LlmThinkingToggle enabled={weaverThinking.enableThinking} onToggle={weaverThinking.toggleThinking} />
        }
      />
      <AbyssDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <AbyssDialogContent
          className="flex max-h-[95vh] flex-col gap-4 overflow-y-auto sm:max-w-lg"
          onPointerDownOutside={(e) => {
            const t = e.target;
            if (t instanceof Element && t.closest(LLM_INFERENCE_SURFACE_OUTSIDE_GUARD_SELECTOR)) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            const t = e.target;
            if (t instanceof Element && t.closest(LLM_INFERENCE_SURFACE_OUTSIDE_GUARD_SELECTOR)) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New subject</DialogTitle>
            <DialogDescription>
              Describe what you want to learn. The assistant builds a two-tier topic graph and saves it to your local
              deck (stub topics; content generates when you unlock a topic).
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="gap-3">
            <FieldSet>
              <Field>
                <FieldLabel htmlFor="incremental-learning-prompt">What do you want to learn?</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="incremental-learning-prompt"
                    value={learningPrompt}
                    onChange={(e) => setLearningPrompt(e.target.value)}
                    rows={4}
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
          </FieldGroup>

          {displayError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {displayError}
            </div>
          ) : null}

          {lastRawResponse && displayError ? (
            <CopyableLlmTextBlock
              copyText={lastRawResponse}
              aria-label="Last raw model response"
              preClassName="max-h-40 rounded-md bg-muted"
            />
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={pending}>
              {pending ? 'Generating…' : 'Generate curriculum'}
            </Button>
          </DialogFooter>
        </AbyssDialogContent>
      </AbyssDialog>
    </>
  );
}
