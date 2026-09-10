import type { ReactNode } from 'react';

// No auth guard here on purpose — this layout serves the login page, which is the one
// route an unauthenticated visitor must be able to reach. The mirror guard (bounce an
// already-authenticated visitor away from /login) lives in the login form itself.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12">
      {/* A faint grid behind the card, masked to fade out at the edges so it reads as
          texture rather than as a visible framed panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55] [mask-image:radial-gradient(60%_55%_at_50%_45%,black,transparent)]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      {children}
    </div>
  );
}
