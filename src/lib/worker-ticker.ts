/**
 * A heartbeat that a background tab can't throttle.
 *
 * Chrome winds timers in a tab that has been hidden for a few minutes down to one
 * wake-up a minute, and this console spends its evenings in a background tab — which is
 * exactly when the driver queue has to keep going out (components/queue-runner.tsx) and a
 * support message has to be noticed (components/support-alerts.tsx). Timers inside a
 * dedicated worker are exempt, so the beat comes from a tiny worker built from a blob.
 * MapLibre does the same, and there's no CSP on the hosting to forbid it.
 *
 * Falls back to `setInterval` where a worker can't be created, which costs only the
 * throttling this exists to avoid.
 */

/** Calls `onTick` every `intervalMs`, from a worker when it can. Returns the stop. */
export function startTicker(intervalMs: number, onTick: () => void): () => void {
  try {
    const source = `setInterval(function () { postMessage(0); }, ${intervalMs});`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = onTick;
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = window.setInterval(onTick, intervalMs);
    return () => window.clearInterval(id);
  }
}
