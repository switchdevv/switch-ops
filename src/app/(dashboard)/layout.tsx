'use client';

import type { ReactNode } from 'react';
import { Toast } from '@heroui/react';
import { AppShell } from '@/components/app-shell';
import { DeclineSync } from '@/components/decline-sync';
import { QueueRunner } from '@/components/queue-runner';
import { RequireAuth } from '@/components/require-auth';
import { SupportAlerts } from '@/components/support-alerts';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      {/* Inside the auth gate, outside the pages: queued orders keep going out, a
          support message is noticed, and drivers' declines show up, whichever page is open. */}
      <QueueRunner />
      <SupportAlerts />
      <DeclineSync />
      <AppShell>{children}</AppShell>
      {/* The region the global `toast()` renders into. Bottom end so an alert doesn't
          land on the header controls it is telling you about, and only over the signed-in
          app — nothing toasts on the login screen. */}
      <Toast.Provider placement="bottom end" />
    </RequireAuth>
  );
}
