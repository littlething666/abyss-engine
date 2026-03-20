'use client';

import React from 'react';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useSubjects } from '../features/content';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * SubjectNavigation component - Fixed dropdown at top of screen
 * Allows switching between subjects (floors) in the multi-floor architecture
 * Positioned outside the 3D Canvas as a 2D DOM overlay
 */
export const SubjectNavigation: React.FC = () => {
  const { data: subjects = [] } = useSubjects();
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId);
  const setCurrentSubject = useStudyStore((state) => state.setCurrentSubject);

  const handleSelectSubject = (subjectId: string) => {
    setCurrentSubject(subjectId === '__all_floors__' ? null : subjectId);
  };

  return (
    <div
      data-slot="subject-navigation"
      className="fixed z-20"
      style={{
        bottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        right: 'calc(0.75rem + env(safe-area-inset-right))',
      }}
    >
      <Select value={currentSubjectId || '__all_floors__'} onValueChange={handleSelectSubject}>
        <SelectTrigger
          size="sm"
          className="h-auto min-h-8 min-w-[9.5rem] gap-2 border-border bg-card/90 py-2 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"
          aria-label="Select floor"
        >
          <SelectValue placeholder="All Floors" />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="__all_floors__">
            <span className="flex w-full items-center gap-2">
              <span className="size-2 shrink-0 rounded-sm bg-muted" aria-hidden />
              <span>All Floors</span>
            </span>
          </SelectItem>

          {subjects.map((subject) => (
            <SelectItem key={subject.id} value={subject.id}>
              <span className="flex w-full min-w-0 items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-sm border border-border/60"
                  style={{ backgroundColor: subject.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {subject.geometry.gridTile}/{subject.geometry.crystal}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SubjectNavigation;
