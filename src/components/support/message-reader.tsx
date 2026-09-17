'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Alert, Button, Skeleton } from '@heroui/react';
import { useDeleteMessage, useSenderMessages, useSenderOrders, useSupportMessage } from '@/hooks/use-support';
import { shortId } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import {
  isDeletionRequest,
  isDriverMessage,
  previewOf,
  senderApps,
  senderOf,
  SENDER_APP_LABEL_KEY,
} from '@/lib/ops/support';
import { parseErrorKey } from '@/lib/parse/errors';
import { HISTORY_LIMIT } from '@/lib/services/support';
import { customerHref } from '@/lib/url/customer-filters';
import { driverHref } from '@/lib/url/driver-filters';
import { managerHref } from '@/lib/url/manager-filters';
import { ordersHref } from '@/lib/url/order-filters';
import { restaurantHref } from '@/lib/url/restaurant-filters';
import { supportMessageHref } from '@/lib/url/support-filters';
import type { SupportMessage } from '@/types/message';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CopyValue } from '@/components/ui/copy-value';
import { StageChip } from '@/components/ui/stage-chip';
import { DriverAvatar, Tag } from '@/components/drivers/driver-bits';
import {
  AlertIcon,
  BikeIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  InboxIcon,
  MailIcon,
  ManagerIcon,
  MapPinIcon,
  PhoneIcon,
  ReceiptIcon,
  StoreIcon,
  TrashIcon,
  UserIcon,
} from '@/components/icons';
import { ReplyComposer } from './reply-composer';
import { SenderDeliveries } from './sender-deliveries';

/**
 * The open message, and everything needed to answer it without leaving the page: the full
 * text, a box to answer in, the orders it is about, the contact details as typed, the
 * account behind it and its earlier messages.
 *
 * The order of it is the work: read, look at the order, answer. A **driver's** message goes
 * straight from the text to the deliveries they were carrying when they wrote — which is
 * what their message is about, and what ops correct — and their orders *as a customer* sink
 * to the bottom, where they belong for someone who is rarely a customer. Anyone else keeps
 * the customer's own reading: their latest orders, then everything else.
 *
 * switch-dashboard showed a message as one cell of a table row, cut to the column's width,
 * with nothing about who sent it beyond an id. Answering one meant copying that id into
 * three other pages.
 */
export function MessageReader({
  id,
  fromList,
  pinnedRegion,
  cityNames,
  now,
  hrefFor,
  newerHref,
  olderHref,
  onBack,
  onDeleted,
  onOpened,
}: {
  id: string;
  /** The row as the list has it, when it is on the page. */
  fromList: SupportMessage | undefined;
  pinnedRegion: string;
  cityNames: Map<string, string>;
  now: number;
  /** Opens another message in the inbox, keeping its filters. */
  hrefFor: (id: string) => string;
  newerHref: string | null;
  olderHref: string | null;
  onBack: () => void;
  onDeleted: (message: string) => void;
  onOpened: (id: string) => void;
}) {
  const { t, format } = useI18n();
  const query = useSupportMessage(id, pinnedRegion, fromList);
  const remove = useDeleteMessage();
  const [isDeleting, setIsDeleting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const message = query.data ?? null;
  const loadedId = message?.objectId;

  // Marked read once the server has it — not on a placeholder that might answer "not found".
  useEffect(() => {
    if (loadedId && !query.isPlaceholderData) onOpened(loadedId);
  }, [loadedId, query.isPlaceholderData, onOpened]);

  // A new message is a new page to a screen reader: focus its heading, not the list link
  // that is about to lose its tint.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [id]);

  if (query.status === 'pending') return <ReaderSkeleton />;

  if (query.status === 'error') {
    return (
      <ReaderFrame onBack={onBack}>
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{t('support.reader.loadError')}</Alert.Title>
            <Alert.Description>{t(parseErrorKey(query.error, 'fetch'))}</Alert.Description>
          </Alert.Content>
          <Button variant="secondary" size="sm" onPress={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      </ReaderFrame>
    );
  }

  if (!message) {
    return (
      <ReaderFrame onBack={onBack}>
        <ReaderEmpty title={t('support.reader.notFoundTitle')} body={t('support.reader.notFoundBody')} />
      </ReaderFrame>
    );
  }

  const sender = senderOf(message);
  const apps = senderApps(sender);
  const name = message.fullname || sender?.fullname || t('common.none');
  const regionId = sender?.city?.objectId;
  const isDeletion = isDeletionRequest(message.message);
  const isDriver = isDriverMessage(sender);

  return (
    <ReaderFrame
      onBack={onBack}
      nav={
        <div className="flex items-center gap-1">
          <StepLink href={newerHref} label={t('support.reader.previous')}>
            <ChevronUpIcon className="size-4" />
          </StepLink>
          <StepLink href={olderHref} label={t('support.reader.next')}>
            <ChevronDownIcon className="size-4" />
          </StepLink>
        </div>
      }
    >
      <article aria-labelledby="support-reader-heading" className="flex flex-col gap-5">
        {/* ---- who, when ---- */}
        <header className="flex items-start gap-3">
          <DriverAvatar name={name} className="size-12" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2
              id="support-reader-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-h5 truncate font-bold outline-none"
            >
              <bdi>{name}</bdi>
            </h2>
            <p className="text-caption text-muted">
              <time dateTime={message.createdAt} title={format.relative(message.createdAt, now)}>
                {t('support.reader.received', { time: format.dateTime(message.createdAt) })}
              </time>
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {apps.map((app) => (
                <Tag key={app} tone={app === 'food' ? 'muted' : app === 'driver' ? 'accent' : 'warning'}>
                  {t(SENDER_APP_LABEL_KEY[app])}
                </Tag>
              ))}
              {sender?.enabled === false && <Tag tone="danger">{t('support.reader.accountDisabled')}</Tag>}
              {sender?.staffType && <Tag tone="warning">{t('support.reader.staffAccount')}</Tag>}
            </div>
          </div>
        </header>

        {isDeletion && (
          <div className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2.5 rounded-xl p-3">
            <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-caption font-bold">{t('support.reader.deletionTitle')}</p>
              <p className="text-caption">{t('support.reader.deletionBody')}</p>
            </div>
          </div>
        )}

        {/* ---- the message ---- */}
        <blockquote
          dir="auto"
          className="bg-surface-secondary text-body rounded-2xl p-4 leading-relaxed break-words whitespace-pre-wrap select-text"
        >
          {message.message?.trim() || <span className="text-faint italic">{t('support.list.noText')}</span>}
        </blockquote>

        {/* ---- the answer ---- */}
        {sender && apps.length > 0 ? (
          <ReplyComposer
            messageId={message.objectId}
            name={name}
            apps={apps}
            language={sender.language}
            pinnedRegion={pinnedRegion}
          />
        ) : (
          <p className="text-caption text-faint">
            {sender ? t('support.reply.noApps') : t('support.reply.unavailable')}
          </p>
        )}

        {/* ---- what the message is about ---- */}
        {isDriver && sender && (
          <SenderDeliveries driverId={sender.objectId} messageAt={message.createdAt} pinnedRegion={pinnedRegion} />
        )}

        {/* ---- the other ways to reach them ---- */}
        <div className="flex flex-wrap items-center gap-2">
          {message.phone && (
            <a href={`tel:${message.phone}`} className={ACTION_LINK}>
              <PhoneIcon aria-hidden className="size-4" />
              {t('support.reader.call')}
            </a>
          )}
          {message.email && (
            <a href={`mailto:${message.email}`} className={ACTION_LINK}>
              <MailIcon aria-hidden className="size-4" />
              {t('support.reader.email')}
            </a>
          )}
          <CopyLinkButton id={message.objectId} />
          <Button
            variant="ghost"
            size="sm"
            className="text-danger ms-auto"
            onPress={() => {
              remove.reset();
              setIsDeleting(true);
            }}
          >
            <TrashIcon aria-hidden className="size-4" />
            {t('support.delete.action')}
          </Button>
        </div>

        {/* ---- contact & account ---- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Panel title={t('support.reader.contact')} hint={t('support.reader.contactHint')}>
            <Fact icon={<PhoneIcon className="size-3.5" />}>
              {message.phone ? (
                <CopyValue value={message.phone} prefix="" label={t('common.copy')} />
              ) : (
                <span className="text-faint">{t('support.reader.noPhone')}</span>
              )}
            </Fact>
            <Fact icon={<MailIcon className="size-3.5" />}>
              {message.email ? (
                <CopyValue value={message.email} prefix="" label={t('common.copy')} className="min-w-0" />
              ) : (
                <span className="text-faint">{t('support.reader.noEmail')}</span>
              )}
            </Fact>
          </Panel>

          <Panel title={t('support.reader.sender')}>
            {sender ? (
              <>
                <Fact icon={<MapPinIcon className="size-3.5" />}>
                  {regionId ? (cityNames.get(regionId) ?? regionId) : <span className="text-faint">{t('support.reader.noRegion')}</span>}
                </Fact>
                <Fact label={t('support.reader.accountId')}>
                  <CopyValue value={sender.objectId} label={t('support.reader.accountId')} />
                </Fact>
                {sender.createdAt && (
                  <p className="text-caption text-faint">
                    {t('support.reader.memberSince', { date: format.date(sender.createdAt) })}
                  </p>
                )}
                {apps.length === 0 && <p className="text-caption text-faint">{t('support.reader.noApps')}</p>}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <Link href={ordersHref('user', sender.objectId)} className={TEXT_LINK}>
                    <ReceiptIcon aria-hidden className="size-3.5" />
                    {t('support.reader.openOrders')}
                  </Link>
                  {apps.includes('food') && (
                    <Link href={customerHref(sender.objectId)} className={TEXT_LINK}>
                      <UserIcon aria-hidden className="size-3.5" />
                      {t('support.reader.openCustomer')}
                    </Link>
                  )}
                  {apps.includes('driver') && (
                    <Link href={driverHref(sender.objectId)} className={TEXT_LINK}>
                      <BikeIcon aria-hidden className="size-3.5" />
                      {t('support.reader.openDriver')}
                    </Link>
                  )}
                  {apps.includes('manager') && (
                    <Link href={managerHref(sender.objectId)} className={TEXT_LINK}>
                      <ManagerIcon aria-hidden className="size-3.5" />
                      {t('support.reader.openManager')}
                    </Link>
                  )}
                  {sender.managerStore?.objectId && (
                    <Link href={restaurantHref(sender.managerStore.objectId)} className={TEXT_LINK}>
                      <StoreIcon aria-hidden className="size-3.5" />
                      {t('support.reader.openRestaurant')}
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <p className="text-caption text-faint">{t('support.reader.noAccount')}</p>
            )}
            <Fact label={t('support.reader.messageId')}>
              <CopyValue value={message.objectId} label={t('support.reader.messageId')} />
            </Fact>
          </Panel>
        </div>

        {sender && (
          <>
            {!isDriver && (
              <RecentOrders
                userId={sender.objectId}
                pinnedRegion={pinnedRegion}
                now={now}
                title={t('support.reader.recentOrders')}
              />
            )}
            <History
              userId={sender.objectId}
              currentId={message.objectId}
              pinnedRegion={pinnedRegion}
              now={now}
              hrefFor={hrefFor}
            />
            {/* A driver's orders as a customer: last, and only when there are any — one more
                empty panel under every driver's message would be all it ever is. */}
            {isDriver && (
              <RecentOrders
                userId={sender.objectId}
                pinnedRegion={pinnedRegion}
                now={now}
                title={t('support.reader.customerOrders')}
                hideWhenEmpty
              />
            )}
          </>
        )}
      </article>

      {isDeleting && (
        <ConfirmDialog
          title={t('support.delete.title')}
          confirmLabel={t('support.delete.confirm')}
          pendingLabel={t('support.delete.pending')}
          isDanger
          isPending={remove.isPending}
          error={remove.isError ? t(parseErrorKey(remove.error, 'support')) : null}
          onClose={() => setIsDeleting(false)}
          onConfirm={() =>
            remove.mutate(
              { id: message.objectId, pinnedRegion },
              {
                onSuccess: () => {
                  setIsDeleting(false);
                  onDeleted(t('support.delete.done'));
                },
              },
            )
          }
        >
          <p className="text-body text-muted">{t('support.delete.body')}</p>
          <p dir="auto" className="text-caption bg-surface-secondary line-clamp-3 rounded-xl p-2.5">
            {previewOf(message.message)}
          </p>
        </ConfirmDialog>
      )}
    </ReaderFrame>
  );
}

const ACTION_LINK =
  'text-caption border-border/70 hover:bg-surface-secondary focus-visible:ring-focus inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 font-bold transition-colors outline-none focus-visible:ring-2';

const TEXT_LINK =
  'text-caption text-link inline-flex items-center gap-1 font-bold hover:underline focus-visible:ring-focus rounded outline-none focus-visible:ring-2';

/**
 * The card the reader sits in, with Back on narrow screens (where the list is hidden).
 *
 * From `lg` it scrolls inside itself, under the sticky top the inbox gives it: a message
 * with its answer box, its deliveries and its history is taller than the screen, and a
 * sticky panel taller than the viewport can only be read by scrolling the *list* to its
 * end — which is the opposite of how this screen is used. Two panes, each scrolling its
 * own, is what every mail client settled on.
 */
function ReaderFrame({ onBack, nav, children }: { onBack: () => void; nav?: ReactNode; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t('support.reader.label')}
      className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-4 border p-4 sm:p-5 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:overscroll-contain"
    >
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <Button variant="ghost" size="sm" onPress={onBack}>
          <ChevronLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
          {t('support.reader.back')}
        </Button>
        {nav}
      </div>
      {nav && <div className="-mb-2 hidden justify-end lg:flex">{nav}</div>}
      {children}
    </section>
  );
}

function StepLink({ href, label, children }: { href: string | null; label: string; children: ReactNode }) {
  const className =
    'grid size-8 place-items-center rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus';
  if (!href) {
    return (
      <span aria-disabled title={label} className={`${className} text-faint opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} replace scroll={false} aria-label={label} title={label} className={`${className} text-muted hover:bg-surface-secondary hover:text-foreground`}>
      {children}
    </Link>
  );
}

function CopyLinkButton({ id }: { id: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      type="button"
      className={ACTION_LINK}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${supportMessageHref(id)}`);
          setCopied(true);
        } catch {
          // No clipboard outside a secure context; the address bar still has the link.
        }
      }}
    >
      <CopyIcon aria-hidden className="size-4" />
      {copied ? t('support.reader.linkCopied') : t('support.reader.copyLink')}
    </button>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="border-border/70 flex min-w-0 flex-col gap-2 rounded-2xl border p-3">
      <div>
        <h3 className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{title}</h3>
        {hint && <p className="text-micro text-faint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Fact({ icon, label, children }: { icon?: ReactNode; label?: string; children: ReactNode }) {
  return (
    <div className="text-caption flex min-w-0 items-center gap-2">
      {icon && (
        <span aria-hidden className="text-muted shrink-0">
          {icon}
        </span>
      )}
      {label && <span className="text-faint shrink-0">{label}</span>}
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

/** The sender's own orders — the customer's side of the account. `hideWhenEmpty` is for a
 * driver, where this is a footnote rather than the point. */
function RecentOrders({
  userId,
  pinnedRegion,
  now,
  title,
  hideWhenEmpty,
}: {
  userId: string;
  pinnedRegion: string;
  now: number;
  title: string;
  hideWhenEmpty?: boolean;
}) {
  const { t, format } = useI18n();
  const query = useSenderOrders(userId, pinnedRegion);
  const orders = query.data?.results ?? [];

  if (hideWhenEmpty && orders.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{title}</h3>
        {(query.data?.count ?? 0) > orders.length && (
          <Link href={ordersHref('user', userId)} className={TEXT_LINK}>
            {t('support.reader.openOrders')}
          </Link>
        )}
      </div>

      {query.status === 'pending' ? (
        <Skeleton className="h-16 w-full rounded-2xl" />
      ) : query.status === 'error' ? (
        <p className="text-caption text-danger">{t('support.reader.ordersError')}</p>
      ) : orders.length === 0 ? (
        <p className="text-caption text-faint">{t('support.reader.noOrders')}</p>
      ) : (
        <ul className="border-border/70 divide-separator/70 divide-y overflow-hidden rounded-2xl border">
          {orders.map((order) => (
            <li key={order.objectId}>
              <Link
                href={ordersHref('objectId', order.objectId)}
                className="hover:bg-surface-secondary focus-visible:ring-focus flex items-center gap-3 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset"
              >
                <span className="text-caption tabular w-16 shrink-0 font-bold">#{shortId(order.objectId)}</span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-caption truncate">
                    <bdi>{order.restaurant?.name ?? t('common.none')}</bdi>
                  </span>
                  <span className="text-micro text-faint tabular" title={format.dateTime(order.createdAt)}>
                    {format.relative(order.createdAt, now)} · {format.money(order.options?.total, order.city?.currency)}
                  </span>
                </span>
                <StageChip order={order} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function History({
  userId,
  currentId,
  pinnedRegion,
  now,
  hrefFor,
}: {
  userId: string;
  currentId: string;
  pinnedRegion: string;
  now: number;
  hrefFor: (id: string) => string;
}) {
  const { t, format } = useI18n();
  const query = useSenderMessages(userId, pinnedRegion);
  const messages = query.data?.results ?? [];

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{t('support.reader.history')}</h3>

      {query.status === 'pending' ? (
        <Skeleton className="h-12 w-full rounded-2xl" />
      ) : query.status === 'error' ? (
        <p className="text-caption text-danger">{t('support.reader.historyError')}</p>
      ) : messages.length <= 1 ? (
        <p className="text-caption text-faint">{t('support.reader.historyEmpty')}</p>
      ) : (
        <>
          <ol className="border-border/70 divide-separator/70 divide-y overflow-hidden rounded-2xl border">
            {messages.map((item) => {
              const isCurrent = item.objectId === currentId;
              const body = (
                <>
                  <span className="text-micro text-faint tabular w-20 shrink-0" title={format.dateTime(item.createdAt)}>
                    {format.relative(item.createdAt, now)}
                  </span>
                  <span className="text-caption min-w-0 flex-1 truncate">
                    <bdi>{previewOf(item.message) || t('support.list.noText')}</bdi>
                  </span>
                  {isCurrent && <Tag tone="accent">{t('support.reader.thisOne')}</Tag>}
                </>
              );
              return (
                <li key={item.objectId}>
                  {isCurrent ? (
                    <div aria-current="true" className="bg-accent-soft/50 flex items-center gap-3 px-3 py-2">
                      {body}
                    </div>
                  ) : (
                    <Link
                      href={hrefFor(item.objectId)}
                      replace
                      scroll={false}
                      className="hover:bg-surface-secondary focus-visible:ring-focus flex items-center gap-3 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset"
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
          {(query.data?.count ?? 0) > HISTORY_LIMIT && (
            <p className="text-micro text-faint">{t('support.reader.historyMore', { count: HISTORY_LIMIT })}</p>
          )}
        </>
      )}
    </section>
  );
}

/** Shown in the reader column before any message is picked (wide screens only). */
export function ReaderPlaceholder() {
  const { t } = useI18n();
  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card border">
      <ReaderEmpty title={t('support.reader.placeholderTitle')} body={t('support.reader.placeholderBody')} />
    </section>
  );
}

function ReaderEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <span className="bg-surface-secondary text-muted mb-2 grid size-12 place-items-center rounded-2xl">
        <InboxIcon className="size-6" />
      </span>
      <p className="text-h6 font-bold">{title}</p>
      <p className="text-muted text-body max-w-prose">{body}</p>
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-4 border p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-1/3 rounded-md" />
          <Skeleton className="h-3 w-1/4 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    </section>
  );
}
