'use client';

import type { ReactNode } from 'react';
import { Toast } from '@heroui/react';
import { AppShell } from '@/components/app-shell';
import { QueueRunner } from '@/components/queue-runner';
import { RequireAuth } from '@/components/require-auth';
import { SupportAlerts } from '@/components/support-alerts';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      {/* Inside the auth gate, outside the pages: queued orders keep going out, and a
          support message is noticed, whichever page of the console is open. */}
      <QueueRunner />
      <SupportAlerts />
      <AppShell>{children}</AppShell>
      {/* The region the global `toast()` renders into. Bottom end so an alert doesn't
          land on the header controls it is telling you about, and only over the signed-in
          app — nothing toasts on the login screen. */}
      <Toast.Provider placement="bottom end" />
    </RequireAuth>
  );
}
