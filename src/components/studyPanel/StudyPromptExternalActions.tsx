'use client';

import React, { useState } from 'react';
import { ChartNetwork, FileSearch } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildDiagramSystemPrompt, extractExamplesSection } from '../../features/studyPanel';

const GOOGLE_SEARCH_BASE = 'https://google.com/search';

function buildGoogleSearchUrl(query: string): string {
  return GOOGLE_SEARCH_BASE + '?q=' + encodeURIComponent(query) + '&udm=50';
}

export interface StudyPromptExternalActionsProps {
  topicSystemPrompt: string;
  resolvedTopic: string;
}

/**
 * The two icon-only buttons rendered ahead of the Reasoning + TTS toggles inside the
 * Explain inference surface header. They search the topic system prompt with Google
 * (FileSearch) and open a dialog where the user pastes source text to build a diagram
 * prompt (ChartNetwork). Both disable themselves when the topic system prompt is
 * empty so the user understands why they cannot click.
 */
export function StudyPromptExternalActions({
  topicSystemPrompt,
  resolvedTopic,
}: StudyPromptExternalActionsProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState('');

  const trimmedPrompt = topicSystemPrompt.trim();
  const hasPrompt = trimmedPrompt.length > 0;

  const closeDialog = () => {
    setIsDialogOpen(false);
    setPasteText('');
    setPasteError('');
  };

  const openDialog = () => {
    setPasteError('');
    setPasteText('');
    setIsDialogOpen(true);
  };

  const processSourceText = (sourceText: string) => {
    const examples = extractExamplesSection(sourceText);
    if (!examples.trim()) {
      setPasteError('Unable to find a valid "6. Examples" section in the pasted text.');
      return;
    }
    const diagramSystemPrompt = buildDiagramSystemPrompt(resolvedTopic, sourceText);
    window.open(buildGoogleSearchUrl(diagramSystemPrompt), '_blank', 'noopener,noreferrer');
    closeDialog();
  };

  const handleSearchPrompt = () => {
    if (!hasPrompt) return;
    window.open(buildGoogleSearchUrl(trimmedPrompt), '_blank', 'noopener,noreferrer');
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return;
    const start = event.currentTarget.selectionStart ?? 0;
    const end = event.currentTarget.selectionEnd ?? start;
    const before = pasteText.slice(0, start);
    const after = pasteText.slice(end);
    const next = before + pasted + after;
    event.preventDefault();
    setPasteText(next);
    processSourceText(next);
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPasteText(event.currentTarget.value);
    if (pasteError) setPasteError('');
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={handleSearchPrompt}
        disabled={!hasPrompt}
        aria-label="Search topic prompt with Google"
        title="Search topic prompt"
        data-testid="study-prompt-external-search"
      >
        <FileSearch aria-hidden />
        <span className="sr-only">Search topic prompt</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={openDialog}
        disabled={!hasPrompt}
        aria-label="Build diagram prompt from pasted source"
        title="Build diagram prompt"
        data-testid="study-prompt-external-diagram"
      >
        <ChartNetwork aria-hidden />
        <span className="sr-only">Build diagram prompt</span>
      </Button>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setIsDialogOpen(true);
        }}
      >
        <DialogContent className="w-[min(95vw,42rem)]">
          <DialogHeader>
            <DialogTitle>Diagram Prompt</DialogTitle>
            <DialogDescription>
              Paste source text containing a &apos;6. Examples&apos; section to generate a diagram prompt.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={pasteText}
            onChange={handleTextChange}
            onPaste={handlePaste}
            aria-label="Diagram source text"
            className="mt-2 w-full min-h-52 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
          {pasteError && (
            <p className="text-destructive text-sm mt-2" role="alert">{pasteError}</p>
          )}
          <DialogFooter className="pt-2">
            <DialogClose render={<Button type="button" variant="outline" className="w-full sm:w-auto" />}>
              Close
            </DialogClose>
            <Button onClick={() => processSourceText(pasteText)} className="w-full sm:w-auto" type="button">
              Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
