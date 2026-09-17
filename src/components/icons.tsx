import type { SVGProps } from 'react';

/**
 * Hand-rolled, stroke-based icon set rather than a dependency: the console needs
 * roughly two dozen glyphs, and every one here inherits `currentColor` and the caller's
 * size class, so they theme themselves in both schemes for free.
 *
 * Keep new icons on the same 24×24 grid at 1.75 stroke width, or they will look bolder
 * or lighter than their neighbours at the 14–18px sizes this UI actually renders them.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ---- navigation & chrome ------------------------------------------------ */

export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" />
      <circle cx="4" cy="6.5" r="1.4" />
      <circle cx="4" cy="12" r="1.4" />
      <circle cx="4" cy="17.5" r="1.4" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5" />
      <path d="M10 16 6 12l4-4M6 12h9" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z" />
    </Icon>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.75" y="4" width="18.5" height="12.5" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </Icon>
  );
}

export function LanguagesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 5.5h8.5M7.25 3.5v2M9.5 5.5c0 3.4-2.6 6.6-6.5 8" />
      <path d="M5 10.5c1.4 1.9 3.4 3.3 5.5 4" />
      <path d="m12.5 20.5 4-9.5 4 9.5M13.9 17.4h5.2" />
    </Icon>
  );
}

/* ---- controls ----------------------------------------------------------- */

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m14.5 5.5-6 6.5 6 6.5" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 5.5 6 6.5-6 6.5" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5.5 9 6.5 6 6.5-6" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.5 15.5 4 4" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 5.5h17l-6.5 7.5v6l-4 2v-8Z" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 12.5A8 8 0 0 0 17.7 17.7L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2" />
      <path d="M15 5.5A2 2 0 0 0 13 3.5H5.5a2 2 0 0 0-2 2V13a2 2 0 0 0 2 2" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

/* ---- domain ------------------------------------------------------------- */

export function StoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V9.5" />
      <path d="M3 9.5 4.8 4.4A1.5 1.5 0 0 1 6.2 3.5h11.6a1.5 1.5 0 0 1 1.4.9L21 9.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Icon>
  );
}

/** A person with a tie — a restaurant's manager, as opposed to a customer. */
export function ManagerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
      <path d="m12 13.5-1 2.25 1 3.25 1-3.25-1-2.25Z" />
    </Icon>
  );
}

export function BikeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5.75" cy="17" r="3.25" />
      <circle cx="18.25" cy="17" r="3.25" />
      <path d="M9 17h5.5l-3-8.5H9M13.5 8.5h4l1.5 8" />
    </Icon>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 8h14l-1 11.5a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8Z" />
      <path d="M9 8V6.25a3 3 0 0 1 6 0V8" />
    </Icon>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 3.5h13v17l-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5-2.1-1.5-2.2 1.5Z" />
      <path d="M9 8.5h6M9 12.5h4" />
    </Icon>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.6 3.5H5.2a1.7 1.7 0 0 0-1.7 1.9c.5 4.6 2.4 8.4 5.3 11.3 2.9 2.9 6.7 4.8 11.3 5.3a1.7 1.7 0 0 0 1.9-1.7v-2.4a1.7 1.7 0 0 0-1.4-1.7l-2.6-.5a1.7 1.7 0 0 0-1.6.6l-1 1.2a13.6 13.6 0 0 1-5.4-5.4l1.2-1a1.7 1.7 0 0 0 .6-1.6l-.5-2.6a1.7 1.7 0 0 0-1.7-1.4Z" />
    </Icon>
  );
}

/** The handset with a cross where the ringing would be — a call nobody answered. */
export function PhoneMissedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.6 3.5H5.2a1.7 1.7 0 0 0-1.7 1.9c.5 4.6 2.4 8.4 5.3 11.3 2.9 2.9 6.7 4.8 11.3 5.3a1.7 1.7 0 0 0 1.9-1.7v-2.4a1.7 1.7 0 0 0-1.4-1.7l-2.6-.5a1.7 1.7 0 0 0-1.6.6l-1 1.2a13.6 13.6 0 0 1-5.4-5.4l1.2-1a1.7 1.7 0 0 0 .6-1.6l-.5-2.6a1.7 1.7 0 0 0-1.7-1.4Z" />
      <path d="m15.5 3.5 5 5M20.5 3.5l-5 5" />
    </Icon>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.75" y="5" width="18.5" height="14" rx="2.5" />
      <path d="m3.5 7.5 7.36 5.15a2 2 0 0 0 2.28 0L20.5 7.5" />
    </Icon>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.75" />
    </Icon>
  );
}

export function RouteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <path d="M8 18.5h6.5a4 4 0 0 0 0-8h-5a4 4 0 0 1 0-8H16" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.3l3.2 2" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8.5 3v4M15.5 3v4" />
    </Icon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M11.2 3.5H4.8a1.3 1.3 0 0 0-1.3 1.3v6.4c0 .35.14.68.38.93l8.1 8.1a1.3 1.3 0 0 0 1.85 0l6.4-6.4a1.3 1.3 0 0 0 0-1.85l-8.1-8.1a1.3 1.3 0 0 0-.93-.38Z" />
      <circle cx="8" cy="8" r="1.3" />
    </Icon>
  );
}

export function CashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M6 10v4M18 10v4" />
    </Icon>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6.5 15h3" />
    </Icon>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4.5h14v11.75L14.25 21H5Z" />
      <path d="M19 16.25h-4.75V21" />
      <path d="M8.5 9h7M8.5 12.5h4.5" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.6 4.1 2.9 17.4a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.1a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.5v4M12 16.75h.01" />
    </Icon>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
      <path d="M6.1 4.5h11.8a2 2 0 0 1 1.85 1.24l2.75 6.6v5.16a2 2 0 0 1-2 2H3.5a2 2 0 0 1-2-2v-5.16l2.75-6.6A2 2 0 0 1 6.1 4.5Z" />
    </Icon>
  );
}

/** A folded paper map — the live map in the sidebar. Deliberately not the single pin of
 * `MapPinIcon`, which already means "one location" everywhere else in this UI. */
export function MapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 4.5 3.5 6.75v12.75L9 17.25l6 2.25 5.5-2.25V4.5L15 6.75Z" />
      <path d="M9 4.5v12.75M15 6.75V19.5" />
    </Icon>
  );
}

/** Where a delivery is going. A house rather than a person: the pin marks the address,
 * which is what a driver is sent to and what a customer describes on the phone. */
export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" />
      <path d="M9.5 20.5v-6h5v6" />
    </Icon>
  );
}

/* ---- map controls -------------------------------------------------------- */

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Icon>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 12h13" />
    </Icon>
  );
}

/** Frame everything — the four corners of a viewfinder. */
export function FrameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <circle cx="12" cy="12" r="2.25" />
    </Icon>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3.5 8.5 4.25L12 12 3.5 7.75Z" />
      <path d="m3.5 12 8.5 4.25L20.5 12" />
      <path d="m3.5 16.25 8.5 4.25 8.5-4.25" />
    </Icon>
  );
}

/** A driver whose app has stopped reporting: the signal arcs, struck through. */
export function SignalOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.6 15.1a5 5 0 0 1 6.8 0" />
      <path d="M5.2 11.7a10 10 0 0 1 13.6 0" />
      <path d="M12 18.6h.01" />
      <path d="m3.5 3.5 17 17" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </Icon>
  );
}

/** A driver's queue: orders stacked up, the line moving forward. */
export function QueueIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h9M4.5 12h9M4.5 17h6" />
      <path d="M18 18.5V6.5M15.5 9 18 6.5 20.5 9" />
    </Icon>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5.5 15 6.5-6 6.5 6" />
    </Icon>
  );
}

/** Leaves this screen for another one — the orders board, in a new context. */
export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18.5 14.5v4A1.5 1.5 0 0 1 17 20H5.5A1.5 1.5 0 0 1 4 18.5V7A1.5 1.5 0 0 1 5.5 5.5h4" />
    </Icon>
  );
}

/* ---- catalogue ---------------------------------------------------------- */

/** A row's other actions, behind one button. */
export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5.5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18.5" cy="12" r="1.2" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 19.5h4l10-10a2.83 2.83 0 0 0-4-4l-10 10v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
      <path d="M6.5 7 7.4 19a1.5 1.5 0 0 0 1.5 1.5h6.2a1.5 1.5 0 0 0 1.5-1.5l.9-12M10.5 11v5.5M13.5 11v5.5" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7Z" />
    </Icon>
  );
}

/** On the platform, or taken off it — a restaurant's, a menu's or a dish's `enabled`. */
export function PowerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5v8" />
      <path d="M7 6.3a7.5 7.5 0 1 0 10 0" />
    </Icon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 4 2.47 5 5.53.8-4 3.9.94 5.5L12 16.6l-4.94 2.6.94-5.5-4-3.9 5.53-.8L12 4Z" />
    </Icon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m20.5 15.5-4.5-4.5L6 19.5" />
    </Icon>
  );
}

/** A restaurant's menu — a section of dishes. */
export function MenuBookIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 6.5c-1.8-1.3-4.3-2-7.5-2v13c3.2 0 5.7.7 7.5 2 1.8-1.3 4.3-2 7.5-2v-13c-3.2 0-5.7.7-7.5 2Z" />
      <path d="M12 6.5v13" />
    </Icon>
  );
}

/** A password — reset from the Drivers screen. */
export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="15.5" r="4" />
      <path d="m10.85 12.65 8.4-8.4M16.5 7l2.5 2.5M14 9.5l2 2" />
    </Icon>
  );
}

/** A message sent to someone's phone, as a push. Not `MailIcon`: nothing is emailed. */
export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 3.5 10 14" />
      <path d="m20.5 3.5-6.5 17-4-6.5-6.5-4Z" />
    </Icon>
  );
}

/** A conversation — the support inbox. */
export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.3-4.3A7.5 7.5 0 1 1 20.5 11.5Z" />
      <path d="M9 10.5h6M9 13.5h3.5" />
    </Icon>
  );
}

/** A bell — the support alerts in the shell's header. Not `AlertIcon`, the warning
 * triangle: this one is somewhere to look, not something wrong. */
export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 4.2-1.2 5.9-1.85 6.6a.85.85 0 0 0 .6 1.4h14.5a.85.85 0 0 0 .6-1.4C19.2 14.9 18 13.2 18 9Z" />
      <path d="M10.2 20a2 2 0 0 0 3.6 0" />
    </Icon>
  );
}

/** A shield with a tick — who may use the console (/access). switch-finance's glyph. */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9.25 12 2 2 3.5-3.75" />
    </Icon>
  );
}

/** The Switch logotype mark — an "S" drawn in the caller's colour, so it reads on the
 * brand gradient and on a plain surface alike. */
export function SwitchMark(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M16.4 7.6c-.9-1-2.4-1.6-4.2-1.6-2.6 0-4.3 1.1-4.3 2.8 0 1.5 1.2 2.3 3.9 2.7l1.4.2c2.9.4 4.4 1.5 4.4 3.5 0 2.2-2.1 3.8-5.3 3.8-2.3 0-4.2-.7-5.3-2"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
