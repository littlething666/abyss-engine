import React from 'react';

import { NativeSelect } from '../ui/native-select';
import MathMarkdownRenderer from '../MathMarkdownRenderer';
import { StudyPanelTab } from './StudyPanelHeader';

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
}: StudyPanelStateViewsProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="study-panel-state">
      {/* Level Up Banner */}
      {levelUpMessage && (
        <div className="mb-4 p-4 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl text-center animate-pulse">
          <div className="text-xl font-bold text-white">🎉 {levelUpMessage}</div>
          <div className="text-amber-100 text-sm mt-1">Keep up the great work!</div>
        </div>
      )}

      {/* Empty State */}
      {isEmptyDeck && (
        <div className="text-center py-8 px-5">
          <p className="text-slate-400 mb-4" data-testid="study-panel-empty-state">
            No cards are currently available for this topic.
          </p>
        </div>
      )}

      {/* Loading State for cards */}
      {isLoadingCards && (
        <div className="text-center py-8 px-5 text-slate-300" data-testid="study-panel-loading">
          Loading cards for this topic...
        </div>
      )}

      {/* Error State for cards */}
      {isCardsLoadError && (
        <div className="text-center py-8 px-5 text-amber-300" data-testid="study-panel-error">
          Unable to load cards for this topic. Open a topic and try again.
        </div>
      )}

      {/* Missing card data */}
      {!isLoadingCards && !isCardsLoadError && !hasActiveCard && !isEmptyDeck && !isCompleted && (
        <div className="text-center py-8 px-5 text-slate-300">
          <p className="mb-4" data-testid="study-panel-no-card">
            No current card is available for this study session.
          </p>
          <button
            onClick={onClose}
            className="bg-slate-700 text-white border-none py-3 px-6 rounded-lg text-base cursor-pointer hover:bg-slate-600"
            data-testid="study-panel-return-to-grid"
          >
            Return to Grid
          </button>
        </div>
      )}

      {/* Theory View */}
      {hasTheory && activeTab === 'theory' && resolvedTopicTheory && (
        <div className="w-full">
          <div className="bg-slate-900 rounded-[15px] p-5" data-testid="study-panel-theory">
            <div className="text-violet-400 text-xs uppercase tracking-wider mb-3">💡 Theory</div>
            <MathMarkdownRenderer
              source={resolvedTopicTheory}
              className="text-slate-200 leading-relaxed markdown-body markdown-body--theory"
            />
          </div>
        </div>
      )}

      {/* System Prompt View */}
      {activeTab === 'system_prompt' && (
        <div className="w-full">
          <div className="bg-slate-900 rounded-[15px] p-5" data-testid="study-panel-system-prompt">
            <div
              className="text-emerald-400 text-xs uppercase tracking-wider mb-3 cursor-pointer"
              onClick={onSystemPromptSelect}
              data-testid="study-panel-system-prompt-title"
            >
              📋 System Prompt
            </div>
            <pre
              ref={systemPromptRef}
              className="text-slate-200 leading-relaxed text-sm whitespace-pre-wrap break-words cursor-pointer"
              onClick={onSystemPromptSelect}
            >
              {topicSystemPrompt}
            </pre>
          </div>
        </div>
      )}

      {/* Study Settings View */}
      {activeTab === 'settings' && (
        <div className="w-full">
          <div className="bg-slate-900 rounded-[15px] p-5" data-testid="study-panel-settings">
            <div className="text-amber-400 text-xs uppercase tracking-wider mb-3">🎚️ Study Settings</div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Target Audience</label>
              <NativeSelect
                value={targetAudience}
                onValueChange={onSetTargetAudience}
                placeholder="Select target audience"
                aria-label="study-settings-target-audience"
                options={targetAudienceOptions.map((option) => ({ value: option, label: option }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Completed State */}
      {isCompleted && (
        <div className="text-center py-6 px-5">
          <h3 className="text-green-500 text-xl mb-2">🎉 All Done!</h3>
          <p className="text-slate-400 mb-2">You&apos;ve reviewed all cards due today.</p>
          <p className="text-slate-400 mb-4">Return to the grid to see your crystals grow!</p>
          <div className="sticky bottom-0 z-10 bg-slate-800 py-3">
            <button
              onClick={onClose}
              className="bg-cyan-500 text-white border-none py-3 px-6 rounded-lg text-base cursor-pointer hover:bg-cyan-400"
              data-testid="study-panel-all-done-cta"
            >
              Back to Grid
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
