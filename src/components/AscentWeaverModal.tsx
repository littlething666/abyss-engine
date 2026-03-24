'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { GeometryType, Subject } from '@/types/core';
import { deckWriter } from '@/infrastructure/di';
import { getChatCompletionsRepositoryForSurface } from '@/infrastructure/llmInferenceRegistry';
import { useAscentWeaverCurriculumGraph } from '@/hooks/useAscentWeaverCurriculumGraph';
import { useMediaQuery } from '@/hooks/use-media-query';
import { stringToKebabCaseId } from '@/lib/stringToKebabCaseId';
import { AscentWeaverCurriculumInferenceSurface } from './AscentWeaverCurriculumInferenceSurface';
import { LLM_INFERENCE_SURFACE_OUTSIDE_GUARD_SELECTOR } from './ResponsiveLlmInferenceSurface';

const GEOMETRY_TYPES: GeometryType[] = ['box', 'cylinder', 'sphere', 'octahedron', 'plane'];

const subjectIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface AscentWeaverModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after curriculum is validated and written to IndexedDB. */
  onSuccess?: () => void;
}

export function AscentWeaverModal({ isOpen, onClose, onSuccess }: AscentWeaverModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { generateAndApply, pending, error, lastRawResponse, streamingAssistantText, reset } =
    useAscentWeaverCurriculumGraph({
      chat: getChatCompletionsRepositoryForSurface('ascentWeaver'),
      writer: deckWriter,
    });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#777AAA');
  const [gridTile, setGridTile] = useState<GeometryType>('box');
  const [crystal, setCrystal] = useState<GeometryType>('sphere');
  const [altar, setAltar] = useState<GeometryType>('box');
  const [audience, setAudience] = useState('University students and industry professionals');
  const [domainDescription, setDomainDescription] = useState('');
  const [topicCount, setTopicCount] = useState(15);
  const [maxTier, setMaxTier] = useState(3);
  const [topicsPerTier, setTopicsPerTier] = useState(5);
  const [additionalNotes, setAdditionalNotes] = useState('');
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

  const tierProduct = useMemo(() => maxTier * topicsPerTier, [maxTier, topicsPerTier]);
  const derivedSubjectId = useMemo(() => stringToKebabCaseId(name), [name]);

  const handleSubmit = async () => {
    setLocalError(null);
    const sid = derivedSubjectId;
    if (!sid) {
      setLocalError('Subject id is required');
      return;
    }
    if (!subjectIdPattern.test(sid)) {
      setLocalError('Subject id must be lowercase kebab-case (e.g. my-new-subject)');
      return;
    }
    if (!name.trim()) {
      setLocalError('Display name is required');
      return;
    }
    if (!domainDescription.trim()) {
      setLocalError('Domain / scope description is required');
      return;
    }
    if (topicCount !== tierProduct) {
      setLocalError(`topicCount (${topicCount}) must equal maxTier × topicsPerTier (${tierProduct})`);
      return;
    }

    const subject: Subject = {
      id: sid,
      name: name.trim(),
      description: description.trim(),
      color: color.trim() || '#777AAA',
      geometry: { gridTile, crystal, altar },
    };

    setInferenceSurfaceOpen(true);

    const ok = await generateAndApply({
      promptParams: {
        subjectId: sid,
        themeId: sid,
        subjectTitle: name.trim(),
        audience: audience.trim(),
        domainDescription: domainDescription.trim(),
        topicCount,
        maxTier,
        topicsPerTier,
        additionalNotes: additionalNotes.trim() || undefined,
      },
      subject,
      expectations: {
        subjectId: sid,
        themeId: sid,
        topicCount,
        maxTier,
        topicsPerTier,
      },
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
        errorMessage={displayError}
      />
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <DialogContent
          className="max-h-[95vh] overflow-y-auto flex flex-col gap-4 sm:max-w-lg"
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
          <DialogTitle>AscentWeaver</DialogTitle>
          <DialogDescription>
            Generate a curriculum graph with the assistant, then save it to your local deck (IndexedDB) with stub
            topics and empty card decks.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-3">
          <FieldSet>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="ascent-name">Display name</FieldLabel>
                <FieldContent>
                  <Input
                    id="ascent-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Shown in subject navigation"
                    autoComplete="off"
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="ascent-subject-id">Subject id</FieldLabel>
                <FieldContent>
                  <Input
                    id="ascent-subject-id"
                    value={derivedSubjectId}
                    readOnly
                    tabIndex={-1}
                    className="bg-muted/50 text-muted-foreground"
                    placeholder="Derived from display name"
                    aria-readonly="true"
                  />
                </FieldContent>
                <FieldDescription>
                  Auto-generated kebab-case from the display name; used as subjectId and themeId in the graph.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="ascent-description">Description</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="ascent-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Short subject summary"
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="ascent-color">Accent color</FieldLabel>
                <FieldContent>
                  <Input
                    id="ascent-color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#777AAA"
                    autoComplete="off"
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLabel>Geometry</FieldLabel>
            <FieldDescription className="mb-2">Crystal garden shapes for this subject.</FieldDescription>
            <FieldGroup className="gap-3">
              <Field orientation="horizontal">
                <FieldLabel htmlFor="ascent-grid">Grid tile</FieldLabel>
                <Select value={gridTile} onValueChange={(v) => setGridTile(v as GeometryType)}>
                  <SelectTrigger id="ascent-grid" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEOMETRY_TYPES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="ascent-crystal">Crystal</FieldLabel>
                <Select value={crystal} onValueChange={(v) => setCrystal(v as GeometryType)}>
                  <SelectTrigger id="ascent-crystal" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEOMETRY_TYPES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="ascent-altar">Altar</FieldLabel>
                <Select value={altar} onValueChange={(v) => setAltar(v as GeometryType)}>
                  <SelectTrigger id="ascent-altar" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GEOMETRY_TYPES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="ascent-audience">Audience</FieldLabel>
                <FieldContent>
                  <Input
                    id="ascent-audience"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    autoComplete="off"
                  />
                </FieldContent>
              </Field>

              <Field>
                <FieldLabel htmlFor="ascent-domain">Domain / scope</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="ascent-domain"
                    value={domainDescription}
                    onChange={(e) => setDomainDescription(e.target.value)}
                    rows={3}
                    placeholder="What the curriculum should cover"
                  />
                </FieldContent>
              </Field>

              <div className="grid grid-cols-3 gap-2">
                <Field>
                  <FieldLabel htmlFor="ascent-topics">Topics total</FieldLabel>
                  <FieldContent>
                    <Input
                      id="ascent-topics"
                      type="number"
                      min={1}
                      value={topicCount}
                      onChange={(e) => setTopicCount(Number(e.target.value) || 0)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ascent-tiers">Tiers</FieldLabel>
                  <FieldContent>
                    <Input
                      id="ascent-tiers"
                      type="number"
                      min={1}
                      value={maxTier}
                      onChange={(e) => setMaxTier(Number(e.target.value) || 0)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ascent-per-tier">Per tier</FieldLabel>
                  <FieldContent>
                    <Input
                      id="ascent-per-tier"
                      type="number"
                      min={1}
                      value={topicsPerTier}
                      onChange={(e) => setTopicsPerTier(Number(e.target.value) || 0)}
                    />
                  </FieldContent>
                </Field>
              </div>
              <FieldDescription>
                Topics total must equal tiers × per tier (now {maxTier} × {topicsPerTier} = {tierProduct}).
              </FieldDescription>

              <Field>
                <FieldLabel htmlFor="ascent-notes">Extra notes (optional)</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="ascent-notes"
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    rows={2}
                    placeholder="Emphasis, exclusions, or tone for the assistant"
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldSet>
        </FieldGroup>

        {displayError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {displayError}
          </div>
        ) : null}

        {lastRawResponse && displayError ? (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="w-full">
                Show assistant raw response
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 max-h-40 overflow-auto rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap">
                {lastRawResponse}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? 'Generating…' : 'Generate curriculum'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
