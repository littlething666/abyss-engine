import type { Metadata } from 'next';

import SubjectNavigationHud from '@/components/SubjectNavigationHud';
import { StudyGraphPageClient } from '@/components/StudyGraphPageClient';

export const metadata: Metadata = {
  title: 'Study graph',
  description: 'Force-directed view of curriculum topics across all subjects',
};

export default function StudyGraphPage() {
  return (
    <>
      <StudyGraphPageClient />
      <SubjectNavigationHud />
    </>
  );
}
