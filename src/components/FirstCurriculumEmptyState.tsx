'use client';

import React from 'react';

import { Button } from '@/components/ui/button';

export interface FirstCurriculumEmptyStateProps {
  onGenerate: () => void;
}

export function FirstCurriculumEmptyState({ onGenerate }: FirstCurriculumEmptyStateProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-6">
      <div
        className="w-full max-w-lg rounded-2xl border border-border/70 bg-background/92 p-6 text-center shadow-lg backdrop-blur-sm sm:p-8"
        data-testid="first-curriculum-empty-state"
      >
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-[0.24em]">
          Your abyss is empty
        </p>
        <h2 className="pt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Generate your first curriculum
        </h2>
        <p className="text-muted-foreground pt-3 text-sm leading-6 sm:text-base">
          Start with any topic you want to learn. The app will build the curriculum and seed the graph for you.
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-6 min-h-11 w-full sm:w-auto"
          onClick={onGenerate}
        >
          Generate your first curriculum
        </Button>
      </div>
    </div>
  );
}
