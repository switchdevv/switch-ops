'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/use-access';
import { queryKeys } from '@/lib/query/keys';
import { createOpsPusher, DRIVER_DECLINED_EVENT, OPS_ALL_CHANNEL, opsCityChannel } from '@/lib/realtime/ops-pusher';

/**
 * Keeps the console current when drivers decline orders. Renders nothing, and alerts
 * nobody.
 *
 * A decline isn't news on its own. An order sent to a crowd can collect dozens before one
 * driver takes it, and a toast for each would bury the console. What ops need is to see
 * it where they are deciding: next to the driver in the map's assign list, and as a count
 * on the board row. Both read `Order.driverDeclines`. This component only makes that
 * read happen now rather than on the next poll, whenever the server announces a decline
 * over Pusher (lib/realtime/ops-pusher.ts). An admin listens to every region, a staff
 * account to its own.
 *
 * A burst of declines is one refresh: the first schedules it, and the rest arriving
 * within `BATCH_MS` join it. Without a Pusher key, or against a server with no
 * `declineDriver` yet, this does nothing, and the polls show declines a little later.
 */

const BATCH_MS = 1_500;

export function DeclineSync() {
  const queryClient = useQueryClient();
  const { region: scope, role } = useAccess();

  const channelName =
    role === 'admin'
      ? OPS_ALL_CHANNEL
      : role === 'staff' && scope.kind === 'single'
        ? opsCityChannel(scope.regionId)
        : null;

  useEffect(() => {
    if (!channelName) return;
    const pusher = createOpsPusher();
    if (!pusher) return;

    let timer: number | null = null;
    const refresh = () => {
      timer = null;
      // Joined, not restarted, like every refresh the console triggers on its own.
      for (const queryKey of [queryKeys.dispatch.all, queryKeys.queue.all, queryKeys.orders.all]) {
        void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
      }
    };
    const onDeclined = () => {
      timer ??= window.setTimeout(refresh, BATCH_MS);
    };

    const channel = pusher.subscribe(channelName);
    channel.bind(DRIVER_DECLINED_EVENT, onDeclined);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      channel.unbind(DRIVER_DECLINED_EVENT, onDeclined);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [channelName, queryClient]);

  return null;
}
