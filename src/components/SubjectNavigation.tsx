'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useProgressionStore as useStudyStore } from '../features/progression';
import { useSubjects } from '../features/content';

/**
 * SubjectNavigation component - Fixed dropdown at top of screen
 * Allows switching between subjects (floors) in the multi-floor architecture
 * Positioned outside the 3D Canvas as a 2D DOM overlay
 */
export const SubjectNavigation: React.FC = () => {
  const { data: subjects = [] } = useSubjects();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get current subject ID from store
  const currentSubjectId = useStudyStore((state) => state.currentSubjectId);
  const setCurrentSubject = useStudyStore((state) => state.setCurrentSubject);

  // Get current subject object
  const currentSubject = subjects.find((s) => s.id === currentSubjectId) || null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle subject selection
  const handleSelectSubject = (subjectId: string | null) => {
    setCurrentSubject(subjectId);
    setIsOpen(false);
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 100,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Dropdown trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: currentSubject
            ? `${currentSubject.color}20`
            : 'rgba(30, 41, 59, 0.9)',
          border: `1px solid ${currentSubject ? currentSubject.color : '#475569'}`,
          borderRadius: '8px',
          color: currentSubject ? currentSubject.color : '#e2e8f0',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          boxShadow: currentSubject
            ? `0 0 20px ${currentSubject.color}30`
            : '0 4px 6px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.2s ease',
          minWidth: '180px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = currentSubject
            ? `0 0 25px ${currentSubject.color}40`
            : '0 6px 12px rgba(0, 0, 0, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = currentSubject
            ? `0 0 20px ${currentSubject.color}30`
            : '0 4px 6px rgba(0, 0, 0, 0.3)';
        }}
      >
        {/* Floor indicator icon */}
        <span style={{ fontSize: '16px' }}>🏢</span>

        {/* Current subject name or placeholder */}
        <span style={{ flex: 1, textAlign: 'left' }}>
          {currentSubject ? currentSubject.name : 'Select Floor'}
        </span>

        {/* Dropdown arrow */}
        <span
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            fontSize: '10px',
          }}
        >
          ▼
        </span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            right: 0,
            minWidth: '100%',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #334155',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* All floors option */}
          <button
            onClick={() => handleSelectSubject(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '12px 16px',
              backgroundColor: !currentSubjectId ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid #1e293b',
              color: !currentSubjectId ? '#818cf8' : '#94a3b8',
              fontSize: '14px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (currentSubjectId) {
                e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentSubjectId) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <span style={{ fontSize: '14px' }}>🌌</span>
            <span>All Floors</span>
          </button>

          {/* Subject options */}
          {subjects.map((subject) => (
            <button
              key={subject.id}
              onClick={() => handleSelectSubject(subject.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '12px 16px',
                backgroundColor:
                  currentSubjectId === subject.id
                    ? `${subject.color}20`
                    : 'transparent',
                border: 'none',
                borderBottom: '1px solid #1e293b',
                color: currentSubjectId === subject.id ? subject.color : '#e2e8f0',
                fontSize: '14px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (currentSubjectId !== subject.id) {
                  e.currentTarget.style.backgroundColor = `${subject.color}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (currentSubjectId !== subject.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {/* Color indicator */}
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  backgroundColor: subject.color,
                  boxShadow: `0 0 8px ${subject.color}60`,
                }}
              />
              <span style={{ flex: 1 }}>{subject.name}</span>
              {/* Geometry hints */}
              <span style={{ fontSize: '10px', opacity: 0.5 }}>
                {subject.geometry.gridTile}/{subject.geometry.crystal}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubjectNavigation;
