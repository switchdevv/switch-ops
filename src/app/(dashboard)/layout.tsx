'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { QueueRunner } from '@/components/queue-runner';
import { RequireAuth } from '@/components/require-auth';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      {/* Inside the auth gate, outside the pages: queued orders keep going out whichever
          page of the console is open. */}
      <QueueRunner />
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
