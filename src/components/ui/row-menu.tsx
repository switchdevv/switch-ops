'use client';

import { useState, type ReactNode } from 'react';
import { Popover } from '@heroui/react';
import { MoreIcon } from '@/components/icons';

export type RowMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  isDanger?: boolean;
};

/**
 * A row's less frequent actions behind one ⋯ button. The menu closes itself before the
 * chosen action runs, so a dialog that action opens is never stacked under a popover.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        tabIndex={0}
        aria-label={label}
        className="text-muted hover:bg-surface-tertiary hover:text-foreground focus-visible:ring-focus grid size-8 shrink-0 cursor-pointer place-items-center rounded-xl transition-colors outline-none focus-visible:ring-2"
      >
        <MoreIcon className="size-5" />
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="w-56">
        <Popover.Dialog aria-label={label} className="flex flex-col p-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setIsOpen(false);
                item.onPress();
              }}
              className={
                'text-body hover:bg-surface-secondary focus-visible:ring-focus flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors outline-none focus-visible:ring-2 ' +
                (item.isDanger ? 'text-danger' : '')
              }
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
