import type { ParseObjectJSON, ParsePointer } from './parse';

/**
 * The account behind a support message, as the inbox includes it — enough to say who they
 * are to Switch (which apps, which region) and where their other screens are.
 *
 * Narrowed like every `_User` read in this console (see types/user.ts). `managerStore` is
 * the restaurant a manager-app account runs, set by `assignManager`.
 */
export type MessageSender = ParseObjectJSON & {
  fullname?: string;
  username?: string;
  phone?: string;
  appType?: string[];
  staffType?: string;
  enabled?: boolean;
  city?: ParsePointer<'City'>;
  managerStore?: ParsePointer<'Restaurant'>;
};

/**
 * A row of the `Message` class — what the Support screen of switch-food, switch-driver and
 * switch-manager saves (src/screens/Support/Support.js in each), and what
 * switch-dashboard's Support page lists.
 *
 * The contact fields are what the person typed into that form, prefilled from their
 * profile — not a copy of the account, which may say something else by now. There is no
 * region, status or "handled" column: the row is written once by its author (its ACL is the
 * author's, plus public read) and a Staff session can only read or delete it.
 */
export type SupportMessage = ParseObjectJSON & {
  /** The account that sent it. Included, so a full row — or a bare pointer when the
   * account is gone or can't be read. */
  user?: MessageSender | ParsePointer<'_User'>;
  fullname?: string;
  email?: string;
  phone?: string;
  message?: string;
};
