# Support alerts by web push — what it would take

**Audience:** whoever owns the Parse Server behind `api.switchfood.net`, and whoever picks
this console up next.
**Status:** not built, and not needed for the console to alert anyone. Switch Ops raises
support alerts **itself**, while it is open (`src/components/support-alerts.tsx`). This
file records why it isn't push today, and what a move to push has to change — server
first, console second.

## What exists now

| | switch-dashboard | switch-ops |
|---|---|---|
| How a new `Message` is noticed | Firebase web push from the server's `afterSave` | The console polls every 30 s while a tab is open |
| Reaches you with the app closed | Yes, while the browser runs | No |
| Which staff pushes it receives | All of them — orders, cancels, support | Support only, by construction |
| Where the alert lands | Snackbar + `alert.mp3` + a bell backed by IndexedDB | Toast + the same sound + a bell backed by the unread inbox |

The console's own alerts stay either way. They are the fallback for a browser that refuses
notifications, for http on a LAN IP, and for the minutes after a token is rotated.

## Why ops can't just do what the dashboard does

**There is one push slot per account, and the dashboard owns it.** A `_User` row carries a
`pushToken` object keyed by app: `food`, `driver`, `manager`, `staff`. The dashboard writes
`pushToken.staff` on every page load (`switch-dashboard/src/navigation/stacks/MainStack.jsx`,
`APP_TYPE = 'staff'`) and clears it on sign-out. A token is per browser *and per origin*, so
`switch-ops.web.app` would get a different one and the two apps would overwrite each other
on every load — whichever was opened last would be the only one receiving.

**Every staff push goes to that one slot, not just support.** The senders are
`switch-server/cloud/message/message.js` (support, `data.page: 'support'`),
`cloud/order/food.js`, `cloud/order/driver.js`, `cloud/order/manager.js` and
`cloud/agenda.js` (all orders, `data.page: 'orders'`). Ops would receive the order pushes too.

**A push can't be silently dropped in the background.** Chrome requires a service worker to
show a notification for every push it receives while no tab is visible, so "ignore the ones
that aren't support" is not available there — the browser shows its own "This site has been
updated in the background" instead, and Firefox eventually drops the subscription.

So ops needs a **slot of its own that only ever carries support**.

## 1. Server: a `pushToken.ops` slot

In `cloud/message/message.js`, keep the existing `pushToken.staff` push exactly as it is —
the dashboard depends on it — and add a second one to `pushToken.ops`, with the ops scope:

- **Admins get every region.** That is what an admin sees in the ops inbox, and the console
  alerts them accordingly.
- **Staff get the sender's `city`**, and only with `opsAccess === true` (see
  `ops-access-backend.md`; a staff account without the grant can't open the console at all).
- **A sender with no `city`** currently means *nobody* is notified — the trigger returns
  early on `req.user.get('city')`. Ops shows those messages to admins, so admins should be
  pushed for them too.
- `Parse.Config`'s `sendNotifsToAll` should keep overriding the region test, as it does today.

Payload, so a click lands on the message:

```js
sendPushNotification({
  title,                                   // translations[language].messages.newMessage
  body: message.get('message'),            // trimmed; the dashboard sends no body today
  token: staff.get('pushToken').ops,
  data: { notifId, id: objectId, page: 'support' },
  webpush: {
    fcmOptions: { link: `https://switch-ops.web.app/support?id=${objectId}` },
    notification: { tag: `support-${objectId}` },
  },
});
```

`sendPushNotification` in `cloud/push/push.js` builds only `notification`, `data`, `android`
and the target, so it needs to pass `webpush` through. firebase-admin ^9.3 (the pinned
version) supports it.

While there: FCM answers a dead token with `messaging/registration-token-not-registered`.
The helper swallows every error (`.catch(() => {})`), so nothing ever clears a stale token.
Dropping the slot on that error would stop the server pushing into the void for ever.

## 2. Console: register the slot, and hand the payload to the alerts that already exist

- Add the `firebase` modular SDK and `public/firebase-messaging-sw.js`. The Firebase project
  is `switch-proj` — the same config and VAPID key as
  `switch-dashboard/src/push/index.js` and `src/configs/index.js` (`webPushKey`).
- After sign-in, `getToken(messaging, { vapidKey, serviceWorkerRegistration })`, then save it
  on the account's **own** row with a plain save:

  ```ts
  user.set('pushToken.ops', token); // dot notation: Parse 8 sends it as a nested $set
  await user.save();
  ```

  Dot notation matters. Writing the whole `pushToken` object back, as the dashboard does,
  republishes whatever the browser last read for `food` / `driver` / `manager`, which is the
  same trap as `putUser` elsewhere on this platform. `_User` rows are owner-writable, so no
  cloud function is needed, and `pushToken` is a protectedField that Parse returns to its own
  owner.
- `unset('pushToken.ops')` on sign-out, as the dashboard clears `staff`.
- Foreground: `onMessage` → the announce path in `components/support-alerts.tsx` (toast,
  sound, desktop notification, bell refresh). One shape of alert, whichever way the message
  arrived.
- Background: the service worker shows the notification itself and follows
  `webpush.fcmOptions.link` on click.
- Keep the poller. It is what covers a browser with notifications denied, and what fills the
  bell's count anyway.
- Hosting needs nothing new: the catch-all `Cache-Control: public, max-age=0, must-revalidate`
  in `firebase.json` already keeps the service worker fresh, and `public/` is copied into
  `out/` by `next build`.

## 3. Order of the rollout

1. **Server first.** Pushing to a slot no account has yet is a no-op — nothing changes for
   anyone until a console writes one.
2. **Console second.** From the first sign-in after the deploy, that browser gets support
   pushes; the dashboard's `pushToken.staff` is untouched, so it keeps its own.

## What this still won't fix

- **One browser per account.** A slot holds a single token, so signing into ops on a second
  machine moves the pushes to it — the same limitation the dashboard has today. Several
  devices at once would need a token array, or a `StaffDevice` class keyed by account.
- **No push over plain http.** A LAN IP (`http://192.168.x.x:3020`) has no Push API and no
  secure context, so only the in-console alerts work there.
- **iOS.** Safari delivers web push only to a web app the person has added to the Home
  Screen.
- **Nothing is retroactive.** A message that arrives while the browser is shut is waiting in
  the bell's count, not replayed as a notification.
