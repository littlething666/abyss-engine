import React, { useState } from 'react';

import { ChartNetwork, FileTerminal, TextSelect } from 'lucide-react';

import MathMarkdownRenderer from '../MathMarkdownRenderer';
import {
  NativeSelect,
  NativeSelectOption,
} from '../ui/native-select';
import { StudyPanelTab } from './types';
import { buildDiagramSystemPrompt, extractExamplesSection } from '../../features/studyPanel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface StudyPanelStateViewsProps {
  levelUpMessage?: string | null;
  activeTab: StudyPanelTab;
  hasTheory: boolean;
  isEmptyDeck: boolean;
  isLoadingCards: boolean;
  isCardsLoadError: boolean;
  hasActiveCard: boolean;
  isCompleted: boolean;
  resolvedTopicTheory: string | null;
  topicSystemPrompt: string;
  targetAudience: string;
  targetAudienceOptions: readonly string[];
  resolvedTopic: string;
  onClose: () => void;
  onSetTargetAudience: (targetAudience: string) => void;
  onSystemPromptSelect: () => void;
  systemPromptRef: React.RefObject<HTMLPreElement | null>;
}

export function StudyPanelStateViews({
  levelUpMessage,
  activeTab,
  hasTheory,
  isEmptyDeck,
  isLoadingCards,
  isCardsLoadError,
  hasActiveCard,
  isCompleted,
  resolvedTopicTheory,
  topicSystemPrompt,
  targetAudience,
  targetAudienceOptions,
  onClose,
  onSetTargetAudience,
  onSystemPromptSelect,
  systemPromptRef,
  resolvedTopic,
}: StudyPanelStateViewsProps) {
  const [isDiagramPromptDialogOpen, setIsDiagramPromptDialogOpen] = useState(false);
  const [diagramPromptText, setDiagramPromptText] = useState('');
  const [diagramPromptError, setDiagramPromptError] = useState('');

  const resetDiagramPromptDialogState = () => {
    setIsDiagramPromptDialogOpen(false);
    setDiagramPromptText('');
    setDiagramPromptError('');
  };
  const openDiagramPromptDialog = () => {
    setDiagramPromptError('');
    setDiagramPromptText('');
    setIsDiagramPromptDialogOpen(true);
  };
  const handleDiagramPromptChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDiagramPromptText(event.currentTarget.value);
    if (diagramPromptError) {
      setDiagramPromptError('');
    }
  };
  const processDiagramPromptText = (sourceText: string) => {
    const examples = extractExamplesSection(sourceText);
    if (!examples.trim()) {
      setDiagramPromptError('Unable to find a valid "6. Examples" section in the pasted text.');
      return;
    }

    const diagramSystemPrompt = buildDiagramSystemPrompt(resolvedTopic, sourceText);
    window.open(`https://google.com/search?q=${encodeURIComponent(diagramSystemPrompt)}&udm=50`, '_blank', 'noopener,noreferrer');
    resetDiagramPromptDialogState();
  };
  const handleDiagramPromptProcess = () => {
    processDiagramPromptText(diagramPromptText);
  };
  const handleDiagramPromptPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) {
      return;
    }

    const selectionStart = event.currentTarget.selectionStart ?? 0;
    const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;

    const nextText = `${diagramPromptText.slice(0, selectionStart)}${pastedText}${diagramPromptText.slice(selectionEnd)}`;
    event.preventDefault();
    setDiagramPromptText(nextText);
    processDiagramPromptText(nextText);
  };

  const systemPromptSearchUrl = `https://google.com/search?q=${encodeURIComponent(topicSystemPrompt)}&udm=50`;
  const openSystemPromptSearch = () => {
    window.open(systemPromptSearchUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-0 pr-1" data-testid="study-panel-state">
      {/* Level Up Banner */}
      {levelUpMessage && (
        <div className="mb-4 p-4 bg-gradient-to-r from-accent to-secondary rounded-xl text-center animate-pulse">
          <div className="text-xl font-bold text-foreground">🎉 {levelUpMessage}</div>
          <div className="text-accent-foreground text-sm mt-1">Keep up the great work!</div>
        </div>
      )}

      {/* Empty State */}
      {isEmptyDeck && (
        <div className="text-center py-8 px-5">
          <p className="text-muted-foreground mb-4" data-testid="study-panel-empty-state">
            No cards are currently available for this topic.
          </p>
        </div>
      )}

      {/* Loading State for cards */}
      {isLoadingCards && (
        <div className="text-center py-8 px-5 text-muted-foreground" data-testid="study-panel-loading">
          Loading cards for this topic...
        </div>
      )}

      {/* Error State for cards */}
      {isCardsLoadError && (
        <div className="text-center py-8 px-5 text-destructive" data-testid="study-panel-error">
          Unable to load cards for this topic. Open a topic and try again.
        </div>
      )}

      {/* Missing card data */}
      {!isLoadingCards && !isCardsLoadError && !hasActiveCard && !isEmptyDeck && !isCompleted && (
        <div className="text-center py-8 px-5 text-muted-foreground">
          <p className="mb-4" data-testid="study-panel-no-card">
            No current card is available for this study session.
          </p>
          <Button
            onClick={onClose}
            className="w-full"
            data-testid="study-panel-return-to-grid"
          >
            Return to Grid
          </Button>
        </div>
      )}

      {/* Theory View */}
      {hasTheory && activeTab === 'theory' && resolvedTopicTheory && (
        <div className="w-full">
          <div className="bg-card rounded-[15px] p-5" data-testid="study-panel-theory">
            <div className="text-primary text-xs uppercase tracking-wider mb-3">💡 Theory</div>
            <MathMarkdownRenderer
              source={resolvedTopicTheory}
              className="text-foreground leading-relaxed markdown-body markdown-body--theory"
            />
          </div>
        </div>
      )}

      {/* System Prompt View */}
      {activeTab === 'system_prompt' && (
        <div className="w-full">
          <div className="bg-card rounded-[15px] p-5" data-testid="study-panel-system-prompt">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={onSystemPromptSelect}
                data-testid="study-panel-system-prompt-title"
              >
                <TextSelect className="h-3.5 w-3.5 mr-1.5" />
                Prompt
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={openDiagramPromptDialog}
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-[10px] uppercase tracking-wider"
                  data-testid="study-panel-system-prompt-diagram-open"
                >
                  <ChartNetwork className="h-3.5 w-3.5 mr-1.5" />
                  Diagram
                </Button>
                <Button
                  onClick={openSystemPromptSearch}
                  variant="outline"
                  size="sm"
                  className="h-7 px-3 text-[10px] uppercase tracking-wider"
                  data-testid="study-panel-system-prompt-search"
                >
                  <FileTerminal className="h-3.5 w-3.5 mr-1.5" />
                  Google AI
                </Button>
              </div>
            </div>
            <pre
              ref={systemPromptRef}
              className="text-foreground leading-relaxed text-sm whitespace-pre-wrap break-words cursor-pointer"
            >
              {topicSystemPrompt}
            </pre>
          </div>
          <Dialog
            open={isDiagramPromptDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                resetDiagramPromptDialogState();
              } else {
                setIsDiagramPromptDialogOpen(true);
              }
            }}
          >
            <DialogContent className="w-[min(95vw,42rem)]">
              <DialogHeader>
                <DialogTitle>Diagram Prompt</DialogTitle>
                <DialogDescription>
                  Paste text that includes a section starting with
                  <span className="font-semibold"> 6. Examples </span>
                  to generate a diagram prompt.
                </DialogDescription>
              </DialogHeader>
              <textarea
                value={diagramPromptText}
                onChange={handleDiagramPromptChange}
                onPaste={handleDiagramPromptPaste}
                aria-label="Diagram source text"
                className="mt-2 w-full min-h-52 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
              {diagramPromptError && (
                <p className="text-destructive text-sm mt-2" role="alert">
                  {diagramPromptError}
                </p>
              )}
              <DialogFooter className="pt-2">
                <Button
                  variant="outline"
                  onClick={resetDiagramPromptDialogState}
                  className="w-full sm:w-auto"
                  type="button"
                >
                  Close
                </Button>
                <Button onClick={handleDiagramPromptProcess} className="w-full sm:w-auto" type="button">
                  Process
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Study Settings View */}
      {activeTab === 'settings' && (
        <div className="w-full">
          <div className="bg-card rounded-[15px] p-5" data-testid="study-panel-settings">
            <div className="text-primary text-xs uppercase tracking-wider mb-3">🎚️ Study Settings</div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Target Audience</label>
              <NativeSelect
                value={targetAudience}
                onChange={(event) => onSetTargetAudience(event.currentTarget.value)}
                aria-label="study-settings-target-audience"
                className="w-full"
              >
                <NativeSelectOption value="" disabled>
                  Select target audience
                </NativeSelectOption>
                {targetAudienceOptions.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {option}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
        </div>
      )}

      {/* Completed State */}
      {isCompleted && (
        <div className="text-center py-6 px-5">
          <h3 className="text-primary text-xl mb-2">🎉 All Done!</h3>
          <p className="text-muted-foreground mb-2">You&apos;ve reviewed all cards due today.</p>
          <p className="text-muted-foreground mb-4">Return to the grid to see your crystals grow!</p>
          <div className="sticky bottom-0 z-10 bg-card py-3">
            <Button
              onClick={onClose}
              className="w-full"
              data-testid="study-panel-all-done-cta"
            >
              Back to Grid
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
