import React from 'react';

export type StudyPanelTab = 'study' | 'theory' | 'system_prompt' | 'settings';

interface StudyPanelHeaderProps {
  activeTab: StudyPanelTab;
  hasTheory: boolean;
  resolvedTopicId: string | null;
  onTabChange: (tab: StudyPanelTab) => void;
}

export function StudyPanelHeader({
  activeTab,
  hasTheory,
  resolvedTopicId,
  onTabChange,
}: StudyPanelHeaderProps) {
  return (
    <header className="text-center mb-3 sticky top-0 z-20 bg-slate-800">
      <h2 className="text-2xl font-semibold text-slate-200 m-0" data-testid="study-session-title">
        📚 Study Session
      </h2>

      <div className="flex flex-wrap justify-center gap-2 mt-3">
        <button
          onClick={() => onTabChange('study')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'study'
              ? 'bg-cyan-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
          data-testid="study-tab-study"
        >
          📖 Study
        </button>
        {hasTheory && (
          <button
            onClick={() => onTabChange('theory')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'theory'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
            data-testid="study-tab-theory"
          >
            💡 Theory
          </button>
        )}
        <button
          onClick={() => onTabChange('system_prompt')}
          disabled={!resolvedTopicId}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'system_prompt'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          } ${!resolvedTopicId ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="study-tab-system-prompt"
        >
          🧠
        </button>
        <button
          onClick={() => onTabChange('settings')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-amber-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
          data-testid="study-tab-settings"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}
