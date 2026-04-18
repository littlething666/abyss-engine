import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
import '@/styles/rating-feedback.css';
import QueryProvider from './providers/QueryProvider';
import { Geist } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { EventBusHandlersMount } from '@/components/EventBusHandlersMount';
import { ProgressionFeedbackProvider } from '@/components/ProgressionFeedbackProvider';
import { GlobalSettingsSheet } from '@/components/settings/GlobalSettingsSheet';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
});

export const metadata: Metadata = {
  title: 'Abyss Engine',
  description: 'Modular edutainment framework with 3D crystal growth on a grid',
};

const htmlClassName = `${geist.variable} font-sans`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={htmlClassName}>
      <body className="m-0 p-0">
        <React.StrictMode>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <Toaster />
            <EventBusHandlersMount />
            <ProgressionFeedbackProvider />
            <GlobalSettingsSheet />
            <QueryProvider>{children}</QueryProvider>
          </ThemeProvider>
        </React.StrictMode>
      </body>
    </html>
  );
}
