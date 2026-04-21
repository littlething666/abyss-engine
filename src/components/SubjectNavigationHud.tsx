'use client';

import React, { useMemo } from 'react';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useSubjects } from '../features/content';
import { DEFAULT_CRYSTAL_BASE_SHAPE } from '../types/core';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NAV_CONTAINER_STYLE: React.CSSProperties = {
  bottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
  left: 'calc(0.75rem + env(safe-area-inset-left))',
};

/**
 * SubjectNavigationHud — floor/subject select fixed at bottom-left (safe areas).
 *
 * Part of the scene HUD cluster; consumes the shared `--surface-hud` tokens so
 * light/dark chrome matches the bottom-right quick-actions and top-right
 * generation-progress surfaces.
 */
export const SubjectNavigationHud: React.FC = () => {
  const { data: subjects = [] } = useSubjects();
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId);
  const setCurrentSubject = useStudyStore((state) => state.setCurrentSubject);

  const handleSelectSubject = (subjectId: string | null) => {
    if (subjectId === null || subjectId === '__all_floors__') {
      setCurrentSubject(null);
      return;
    }
    setCurrentSubject(subjectId);
  };

  const subjectSelectItems = useMemo(
    () => [
      {
        value: '__all_floors__',
        label: (
          <span className="flex w-full items-center gap-2">
            <span className="size-2 shrink-0 rounded-sm bg-muted" aria-hidden />
            <span>All Subjects</span>
          </span>
        ),
      },
      ...subjects.map((subject) => {
        const swatchStyle: React.CSSProperties = { backgroundColor: subject.color };
        return {
          value: subject.id,
          label: (
            <span className="flex w-full min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-sm border border-border/60"
                style={swatchStyle}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{subject.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                {subject.geometry.gridTile}/{subject.crystalBaseShape ?? DEFAULT_CRYSTAL_BASE_SHAPE}
              </span>
            </span>
          ),
        };
      }),
    ],
    [subjects],
  );

  return (
    <div
      data-slot="subject-navigation-hud"
      className="fixed z-20 rounded-lg border border-surface-hud-border bg-surface-hud p-0.5 backdrop-blur-sm"
      style={NAV_CONTAINER_STYLE}
    >
      <Select
        items={subjectSelectItems}
        value={currentSubjectId || '__all_floors__'}
        onValueChange={handleSelectSubject}
      >
        <SelectTrigger
          size="sm"
          className="text-xs"
          aria-label="Select floor"
        >
          <SelectValue placeholder="All Subjects" />
        </SelectTrigger>

        <SelectContent>
          <SelectGroup>
            {subjectSelectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};

export default SubjectNavigationHud;
