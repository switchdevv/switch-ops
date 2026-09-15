'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendDriver } from '@/hooks/use-dispatch';
import { canSendDriverOnConfirm, canUnassignDriver, type EditOrderParams } from '@/lib/ops/order-edit';
import { DRIVER_CHANGED, NO_DRIVER_FOR_ORDER } from '@/lib/parse/errors';
import { queryKeys } from '@/lib/query/keys';
import { confirmOrder, editOrder, unassignDriver } from '@/lib/services/order-actions';
import type { Order } from '@/types/order';

/**
 * The same order sits on the board, on the map and possibly in a driver's queue, so a
 * change to it re-reads all three. Settled rather than success: a refusal (the restaurant
 * accepted it a moment ago) means those screens are behind too.
 */
function useInvalidateOrders() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
  };
}

export type ConfirmRequest = {
  order: Pick<Order, 'objectId' | 'status' | 'canceled' | 'deliveryType'> & { driver?: unknown };
  /** The driver to send once it is confirmed, or null to confirm and assign later. */
  driverId: string | null;
};

/** Whether the driver went out. A refused assign after a confirm that went through is an
 * outcome, not an error: the order *is* confirmed, and saying "couldn't confirm" would be
 * a lie that gets it confirmed twice. */
export type ConfirmOutcome = { driver: 'none' } | { driver: 'sent' } | { driver: 'refused'; error: unknown };

/**
 * Confirms a placed order on the restaurant's behalf, and — for a delivery, when ops chose
 * one — sends it a driver straight after.
 *
 * A pickup is refused a driver here, before anything is written: the server's
 * `assignDriver` doesn't check the order's type (and clears `canceled` on whatever it is
 * given), so this is the last place that rule can hold.
 */
export function useConfirmOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async ({ order, driverId }: ConfirmRequest): Promise<ConfirmOutcome> => {
      if (driverId && !canSendDriverOnConfirm(order)) throw new Error(NO_DRIVER_FOR_ORDER);
      await confirmOrder(order.objectId);
      if (!driverId) return { driver: 'none' };
      try {
        await sendDriver({ orderId: order.objectId, driverId });
        return { driver: 'sent' };
      } catch (error) {
        return { driver: 'refused', error };
      }
    },
    onSettled: invalidate,
  });
}

export type UnassignRequest = {
  order: Pick<Order, 'objectId' | 'status' | 'canceled' | 'deliveryType'> & {
    driver?: { objectId?: string } | null;
  };
  /** The driver ops were asked about — refused if the order no longer carries them. */
  driverId: string;
};

/**
 * Takes the driver off an order, handing it back to "needs a driver". The driver taken off
 * is the one ops confirmed; see `unassignDriver` for why that matters.
 */
export function useUnassignDriver() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: async ({ order, driverId }: UnassignRequest) => {
      if (!canUnassignDriver(order) || order.driver?.objectId !== driverId) throw new Error(DRIVER_CHANGED);
      return unassignDriver(order.objectId, driverId);
    },
    onSettled: invalidate,
  });
}

/** Saves a corrected status and prices. */
export function useEditOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: (params: EditOrderParams) => editOrder(params),
    onSettled: invalidate,
  });
}
