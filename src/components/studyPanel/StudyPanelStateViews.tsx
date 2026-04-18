import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ChartNetwork, FileTerminal, TextSelect, Volume2, VolumeX } from 'lucide-react';

import MathMarkdownRenderer from '../MathMarkdownRenderer';
import { StudyPanelTab } from './types';
import { buildDiagramSystemPrompt, extractExamplesSection, stripTheoryMarkdownForSpeech } from '../../features/studyPanel';
import { TTS_ICON_SPEAKING_CLASSNAME } from '@/components/LlmTtsToggle';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const GOOGLE_SEARCH_BASE = 'https://google.com/search';

function buildGoogleSearchUrl(query: string): string {
  return GOOGLE_SEARCH_BASE + '?q=' + encodeURIComponent(query) + '&udm=50';
}

interface StudyPanelStateViewsProps {
  activeTab: StudyPanelTab;
  hasTheory: boolean;
  isEmptyDeck: boolean;
  isLoadingCards: boolean;
  isCardsLoadError: boolean;
  hasActiveCard: boolean;
  isCompleted: boolean;
  resolvedTopicTheory: string | null;
  topicSystemPrompt: string;
  resolvedTopic: string;
  onClose: () => void;
  onSystemPromptSelect: () => void;
  systemPromptRef: React.RefObject<HTMLPreElement | null>;
}

export function StudyPanelStateViews({
  activeTab,
  hasTheory,
  isEmptyDeck,
  isLoadingCards,
  isCardsLoadError,
  hasActiveCard,
  isCompleted,
  resolvedTopicTheory,
  topicSystemPrompt,
  onClose,
  onSystemPromptSelect,
  systemPromptRef,
  resolvedTopic,
}: StudyPanelStateViewsProps) {
  const [isDiagramPromptDialogOpen, setIsDiagramPromptDialogOpen] = useState(false);
  const [diagramPromptText, setDiagramPromptText] = useState('');
  const [diagramPromptError, setDiagramPromptError] = useState('');
  const [isTheorySpeaking, setIsTheorySpeaking] = useState(false);
  const theoryUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const resolvedTheoryRef = useRef<string | null>(null);

  const stopTheorySpeech = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
      theoryUtteranceRef.current = null;
      setIsTheorySpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    theoryUtteranceRef.current = null;
    setIsTheorySpeaking(false);
  }, []);

  const handleTheorySpeechToggle = useCallback(() => {
    if (!resolvedTopicTheory?.trim()) return;
    if (theoryUtteranceRef.current) { stopTheorySpeech(); return; }
    if (
      typeof window === 'undefined'
      || typeof window.speechSynthesis === 'undefined'
      || typeof window.SpeechSynthesisUtterance === 'undefined'
    ) return;
    const cleanSpeechText = stripTheoryMarkdownForSpeech(resolvedTopicTheory);
    if (!cleanSpeechText) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    utterance.onend = () => {
      if (theoryUtteranceRef.current === utterance) theoryUtteranceRef.current = null;
      setIsTheorySpeaking(false);
    };
    utterance.onerror = () => {
      if (theoryUtteranceRef.current === utterance) theoryUtteranceRef.current = null;
      setIsTheorySpeaking(false);
    };
    theoryUtteranceRef.current = utterance;
    setIsTheorySpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [resolvedTopicTheory, stopTheorySpeech]);

  useEffect(() => { if (activeTab !== 'theory') stopTheorySpeech(); }, [activeTab, stopTheorySpeech]);
  useEffect(() => {
    if (resolvedTheoryRef.current !== null && resolvedTheoryRef.current !== resolvedTopicTheory) {
      stopTheorySpeech();
    }
    resolvedTheoryRef.current = resolvedTopicTheory;
  }, [resolvedTopicTheory, stopTheorySpeech]);
  useEffect(() => () => { stopTheorySpeech(); }, [stopTheorySpeech]);

  const resetDiagramPromptDialogState = () => {
    setIsDiagramPromptDialogOpen(false); setDiagramPromptText(''); setDiagramPromptError('');
  };
  const openDiagramPromptDialog = () => {
    setDiagramPromptError(''); setDiagramPromptText(''); setIsDiagramPromptDialogOpen(true);
  };
  const handleDiagramPromptChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDiagramPromptText(event.currentTarget.value);
    if (diagramPromptError) setDiagramPromptError('');
  };
  const processDiagramPromptText = (sourceText: string) => {
    const examples = extractExamplesSection(sourceText);
    if (!examples.trim()) {
      setDiagramPromptError('Unable to find a valid "6. Examples" section in the pasted text.');
      return;
    }
    const diagramSystemPrompt = buildDiagramSystemPrompt(resolvedTopic, sourceText);
    window.open(buildGoogleSearchUrl(diagramSystemPrompt), '_blank', 'noopener,noreferrer');
    resetDiagramPromptDialogState();
  };
  const handleDiagramPromptProcess = () => { processDiagramPromptText(diagramPromptText); };
  const handleDiagramPromptPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) return;
    const selectionStart = event.currentTarget.selectionStart ?? 0;
    const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
    const before = diagramPromptText.slice(0, selectionStart);
    const after = diagramPromptText.slice(selectionEnd);
    const nextText = before + pastedText + after;
    event.preventDefault();
    setDiagramPromptText(nextText);
    processDiagramPromptText(nextText);
  };

  const systemPromptSearchUrl = buildGoogleSearchUrl(topicSystemPrompt);
  const openSystemPromptSearch = () => {
    window.open(systemPromptSearchUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-0 pr-1" data-testid="study-panel-state">
      {isEmptyDeck && (
        <div className="text-center py-8 px-5">
          <p className="text-muted-foreground mb-4" data-testid="study-panel-empty-state">
            No cards are currently available for this topic.
          </p>
        </div>
      )}

      {isLoadingCards && (
        <div className="text-center py-8 px-5 text-muted-foreground" data-testid="study-panel-loading">
          Loading cards for this topic...
        </div>
      )}

      {isCardsLoadError && (
        <div className="text-center py-8 px-5 text-destructive" data-testid="study-panel-error">
          Unable to load cards for this topic. Open a topic and try again.
        </div>
      )}

      {!isLoadingCards && !isCardsLoadError && !hasActiveCard && !isEmptyDeck && !isCompleted && (
        <div className="text-center py-8 px-5 text-muted-foreground">
          <p className="mb-4" data-testid="study-panel-no-card">
            No current card is available for this study session.
          </p>
          <Button onClick={onClose} className="w-full" data-testid="study-panel-return-to-grid">
            Return to Grid
          </Button>
        </div>
      )}

      {hasTheory && activeTab === 'theory' && resolvedTopicTheory && (
        <div className="w-full">
          <div className="bg-card rounded-[15px] p-5" data-testid="study-panel-theory">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Badge variant="outline">💡 Theory</Badge>
              <Button
                onClick={handleTheorySpeechToggle}
                type="button"
                variant="outline"
                size="icon-xs"
                disabled={isTheorySpeaking ? false : !resolvedTopicTheory.trim() || typeof window === 'undefined'
                  || typeof window.speechSynthesis === 'undefined'
                  || typeof window.SpeechSynthesisUtterance === 'undefined'}
                data-testid="study-panel-theory-tts"
                aria-label={isTheorySpeaking ? 'Stop reading theory aloud' : 'Read theory aloud'}
                title={isTheorySpeaking ? 'Stop reading theory aloud' : 'Read theory aloud'}
              >
                {isTheorySpeaking ? (
                  <span className={cn('inline-flex shrink-0', TTS_ICON_SPEAKING_CLASSNAME)} aria-hidden>
                    <VolumeX className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : (
                  <Volume2 className="h-3.5 w-3.5" aria-hidden />
                )}
                <span className="sr-only">
                  {isTheorySpeaking ? 'Stop reading theory aloud' : 'Read theory aloud'}
                </span>
              </Button>
            </div>
            <MathMarkdownRenderer
              source={resolvedTopicTheory}
              className="text-foreground leading-relaxed markdown-body markdown-body--theory"
            />
          </div>
        </div>
      )}

      {activeTab === 'system_prompt' && (
        <div className="w-full">
          <div className="bg-card rounded-[15px] p-5" data-testid="study-panel-system-prompt">
            <div className="flex items-center justify-between gap-3 mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={onSystemPromptSelect}
                data-testid="study-panel-system-prompt-title"
              >
                <TextSelect className="h-3.5 w-3.5" />
                Prompt
              </Button>
              <Button
                onClick={openSystemPromptSearch}
                variant="outline"
                size="sm"
                className="mr-auto"
                data-testid="study-panel-system-prompt-search"
              >
                <FileTerminal className="h-3.5 w-3.5" />
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={openDiagramPromptDialog}
                  variant="outline"
                  size="sm"
                  data-testid="study-panel-system-prompt-diagram-open"
                >
                  <ChartNetwork className="h-3.5 w-3.5" />
                  Diagram
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
            onOpenChange={(open) => { if (!open) resetDiagramPromptDialogState(); else setIsDiagramPromptDialogOpen(true); }}
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
                <p className="text-destructive text-sm mt-2" role="alert">{diagramPromptError}</p>
              )}
              <DialogFooter className="pt-2">
                <DialogClose render={<Button type="button" variant="outline" className="w-full sm:w-auto" />}>
                  Close
                </DialogClose>
                <Button onClick={handleDiagramPromptProcess} className="w-full sm:w-auto" type="button">
                  Process
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {isCompleted && (
        <div className="text-center py-6 px-5">
          <h3 className="text-primary text-xl mb-2">🎉 All Done!</h3>
          <p className="text-muted-foreground mb-2">You&apos;ve reviewed all cards due today.</p>
          <p className="text-muted-foreground mb-4">Return to the grid to see your crystals grow!</p>
          <div className="sticky bottom-0 z-10 bg-card py-3">
            <Button onClick={onClose} className="w-full" data-testid="study-panel-all-done-cta">
              Back to Grid
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
