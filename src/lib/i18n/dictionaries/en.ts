/**
 * The English dictionary — and, because `Dictionary` is `typeof en`, the schema every
 * other language is checked against. Adding a key here is a type error in fr.ts until
 * it is translated there too, which is the whole point of hand-rolling this instead of
 * loading JSON.
 *
 * Placeholders are `{name}` and are substituted by `t()`; see lib/i18n/dictionary.ts.
 *
 * Where a string already exists in switch-dashboard's own localisation
 * (src/localization/langs/en.json), it is reproduced verbatim so the two staff tools
 * name the same thing the same way.
 */
export const en = {
  app: {
    name: 'Switch',
    suite: 'Ops',
    title: 'Switch Ops',
    description: 'Live order operations for the Switch platform.',
  },

  nav: {
    menu: 'Menu',
    orders: 'Orders',
    map: 'Live map',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    account: 'Signed in',
    staff: 'Staff',
    admin: 'Admin',
  },

  theme: {
    label: 'Colour theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },

  language: {
    label: 'Language',
  },

  login: {
    subtitle: 'Use your Switch staff account.',
    username: 'Username',
    usernamePlaceholder: 'your.username',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    footnote: 'Internal tool — accounts are provisioned by the Switch platform team.',
  },

  auth: {
    noAccessTitle: "This account can't use Switch Ops",
    noAccessBody:
      'Ops is restricted to staff accounts. Ask the Switch platform team to provision yours.',
    verifyFailedTitle: "Couldn't verify your account",
    noRegionTitle: 'No region assigned to this account',
    noRegionBody:
      'Ops shows staff the orders in their own region, and this account has none. Ask an admin to set your region on the staff dashboard.',
    tryAgain: 'Try again',
  },

  account: {
    open: 'Your account',
    title: 'Account',
    role: 'Role',
    region: 'Region',
    allRegions: 'All regions',
    noRegion: 'Not assigned',
    email: 'Email',
    phone: 'Phone',
    scopeAll: 'You can see orders from every region.',
    scopeSingle: 'You only see orders from {region}.',
  },

  errors: {
    network: "Can't reach the server. Check your connection and try again.",
    badCredentials: 'Wrong password.',
    usernameUnknown: 'No account with that username.',
    notStaff: "This account doesn't have staff access.",
    missingOrForbidden: "You don't have permission to view this, or it no longer exists.",
    forbidden: "You don't have permission to do that.",
    rejected: 'The server rejected that request.',
    staffLoginMissing:
      "Staff sign-in isn't available on the server — ask the platform team about `loginStaff`.",
    sessionExpired: 'Your session has expired. Please sign in again.',
    unknown: 'Something went wrong. Please try again.',
    driverOffline:
      "That driver is offline in the driver app, so the order couldn't be assigned to them.",
    orderCanceled: 'This order was canceled.',
    orderTaken: 'A driver has already accepted this order.',
  },

  common: {
    none: '—',
    copy: 'Copy',
    copied: 'Copied',
    retry: 'Retry',
    loading: 'Loading',
  },

  orders: {
    eyebrow: 'Operations',
    title: 'Orders',
    subtitle: 'Every order on the platform, newest first.',

    live: {
      on: 'Live',
      off: 'Paused',
      toggleOn: 'Resume auto-refresh',
      toggleOff: 'Pause auto-refresh',
      refresh: 'Refresh now',
      refreshing: 'Refreshing…',
      updated: 'Updated {time}',
      never: 'Not loaded yet',
    },

    search: {
      label: 'Search',
      placeholder: 'Search…',
      field: 'Search by',
      orderId: 'Order ID',
      userId: 'Customer ID',
      driverId: 'Driver ID',
      restaurantId: 'Restaurant ID',
      clear: 'Clear search',
      submit: 'Search',
      hint: 'Order IDs match from the start; the other three need the full ID.',
    },

    filters: {
      region: 'Region',
      anyRegion: 'Any region',
      type: 'Type',
      anyType: 'Any type',
      stage: 'Stage',
      anyStage: 'Any stage',
      regionLocked: 'Your assigned region — orders outside it are not shown.',
      unassignedOnly: 'Needs a driver',
      reset: 'Clear all',
      active_one: '{count} filter active',
      active_other: '{count} filters active',
    },

    range: {
      label: 'Date',
      today: 'Today',
      yesterday: 'Yesterday',
      week: 'Last 7 days',
      month: 'Last 30 days',
      all: 'Any date',
      custom: 'Custom',
      from: 'From',
      to: 'To',
      anyDate: 'All dates',
    },

    pipeline: {
      heading: 'Pipeline',
      caption_one: '{count} order in {range}',
      caption_other: '{count} orders in {range}',
      empty: 'Nothing placed in this period.',
      hint: 'Pick a stage to filter the list.',
      partial: 'Counts follow the filters above, except the stage and driver ones.',
    },

    alert: {
      unassigned_one: '{count} delivery order has no driver.',
      unassigned_other: '{count} delivery orders have no driver.',
      unassignedAction: 'Show them',
    },

    stage: {
      new: 'New',
      confirmed: 'Confirmed',
      active: 'In transit',
      done: 'Completed',
      canceled: 'Canceled',
    },

    status: {
      placed: 'Placed',
      confirmed: 'Confirmed',
      onTheWay: 'On the way',
      prepared: 'Ready for pickup',
      delivered: 'Delivered',
      picked: 'Picked up',
      canceled: 'Canceled',
      unknown: 'Unknown',
    },

    type: {
      delivery: 'Delivery',
      pickup: 'Pickup',
    },

    row: {
      customerPhone: 'Customer phone',
      driver: 'Driver',
      noDriver: 'No driver',
      items_one: '{count} item',
      items_other: '{count} items',
      noItems: 'No items',
      expand: 'Show order details',
      collapse: 'Hide order details',
      ready: 'Ready',
      waiting: 'Waiting {duration}',
    },

    detail: {
      orderNote: 'Customer note',

      people: 'People',
      customer: 'Customer',
      driver: 'Driver',
      restaurant: 'Restaurant',
      manager: 'Manager',
      unassigned: 'Not assigned yet',
      noPhone: 'No phone',
      copyId: 'Copy ID',

      basket: 'Basket',
      quantity: '×{count}',
      supplements: 'Supplements',
      lineNote: 'Note',
      basketEmpty: 'This order has no line items.',
      basketUnresolved: 'A dish on this order was deleted from the menu.',

      payment: 'Payment',
      itemsTotal: 'Items total',
      discount: 'Discount',
      deliveryFee: 'Delivery',
      freeDelivery: 'Free delivery',
      service: 'Service fee',
      total: 'Total',
      cash: 'Cash',
      creditcards: 'Card',
      unknownMethod: 'Not recorded',

      showOnMap: 'Show on map',
    },

    empty: {
      title: 'No orders match',
      body: 'Nothing here for the filters above.',
      bodySearch: 'Nothing matching “{query}” in this period.',
      searchAllDates: 'Search all dates',
      clear: 'Clear all filters',
    },

    error: {
      title: "Couldn't load orders",
    },

    list: {
      updating: 'Updating results…',
    },

    pager: {
      previous: 'Previous',
      next: 'Next',
      page: 'Page {page}',
      pageOf: 'Page {page} of {total}',
      showing: '{from}–{to} of {total}',
      label: 'Pagination',
    },
  },

  dispatch: {
    panel: 'Dispatch',
    region: 'Region',
    allRegions: 'All regions',
    window: 'Open orders placed in the last {hours} h.',
    truncated: 'Showing the {shown} newest of {total} open orders.',

    kpi: {
      needsDriver: 'Need a driver',
      awaitingRestaurant: 'Awaiting restaurant',
      freeDrivers: 'Free drivers',
      late_one: '{count} late',
      late_other: '{count} late',
      busy_one: '{count} on a job',
      busy_other: '{count} on a job',
    },

    tabs: {
      label: 'Lists',
      orders: 'Orders',
      drivers: 'Drivers',
      restaurants: 'Restaurants',
    },

    search: {
      label: 'Filter the lists',
      placeholder: 'Order #, name or phone…',
      clear: 'Clear filter',
      noOrders: 'No open order matches “{query}”.',
      noDrivers: 'No driver matches “{query}”.',
      noRestaurants: 'No restaurant with an open order matches “{query}”.',
    },

    restaurants: {
      heading: 'With open orders',
      orders_one: '{count} order',
      orders_other: '{count} orders',
      noDriver_one: '{count} without a driver',
      noDriver_other: '{count} without a driver',
      toAccept_one: '{count} to accept',
      toAccept_other: '{count} to accept',
      empty: 'No restaurant has an open order',
      emptyBody: 'A restaurant appears here as soon as one of its orders is placed.',
    },

    hours: {
      title: 'Hours',
      openUntil: 'Open until {time}',
      breakUntil: 'On break until {time}',
      paused: 'Paused',
      pausedHint: "Switched off in the manager app or on the dashboard — customers can't order.",
      opensAt: 'Closed · opens at {time}',
      dayOff: 'Closed today',
      closed: 'Closed',
      unknown: 'No opening hours set',
      schedule: '{open} – {close}',
      breakWindow: 'Break {start} – {end}',
      everyDay: 'Every day',
    },

    phase: {
      needsDriver: 'Needs a driver',
      awaitingRestaurant: 'Awaiting restaurant',
      withDriver: 'With a driver',
      pickup: 'Customer pickup',
    },

    phaseHint: {
      needsDriver: 'Accepted by the restaurant — assign a driver.',
      awaitingRestaurant: 'Placed, not accepted by the restaurant yet.',
      withDriver: 'A driver is on it.',
      pickup: 'The customer collects it at the restaurant.',
    },

    driverState: {
      available: 'Available',
      busy: 'On a job',
      signalLost: 'Signal lost',
    },

    driverStateHint: {
      available: 'Online and free to take an order.',
      busy: 'Carrying an order.',
      signalLost: 'Online, but the app has stopped sending positions.',
    },

    queue: {
      emptyOrders: 'No orders in progress',
      emptyOrdersBody: 'Orders appear here the moment they are placed.',
      allAssigned: 'Every accepted delivery has a driver.',
      emptyDrivers: 'No driver is online',
      emptyDriversBody: 'Drivers appear here when they go online in the driver app.',
      noDriver: 'No driver',
      waiting: 'Waiting {duration}',
      toRestaurant: 'heading to the restaurant',
      toCustomer: 'heading to the customer',
      carrying: 'On #{order}',
      seen: 'Seen {time}',
      noPosition: 'No position',
    },

    detail: {
      back: 'Back to the list',
      notFoundTitle: 'Not on the map any more',
      notFoundBody:
        'It has been delivered or canceled since, or it belongs to a region that is not shown.',
      openInOrders: 'Open in orders',
      placed: 'Placed {time}',
      route: 'Route',
      pickupStop: 'Pick up at',
      dropoffStop: 'Deliver to',
      collectedByCustomer: 'The customer collects this order here.',
      straightLine: '{distance} in a straight line',
      noPin: 'No pin on file — not shown on the map.',
      driver: 'Driver',
      noDriverYet: 'No driver yet',
      notAcceptedYet: "The restaurant hasn't accepted this order yet.",
      candidates: 'Nearest free drivers',
      candidatesHint: 'Straight-line distance to the restaurant.',
      noCandidates: 'No free driver is online here right now.',
      othersBusy_one: '{count} driver is on another job.',
      othersBusy_other: '{count} drivers are on other jobs.',
      showAll: 'Show all {count}',
      showFewer: 'Show fewer',
      assign: 'Assign',
      call: 'Call',
      viewDriver: 'Driver details',
      viewRestaurant: 'Restaurant details',
      position: 'Position updated {time}',
      noPosition: 'No position received yet',
      staleWarning:
        'No position for {duration}. The driver app may be closed or offline — call before sending them.',
      carrying: 'Carrying',
      nearbyOrders: 'Orders waiting for a driver',
      nearbyOrdersHint: "Straight-line distance from this driver to each order's restaurant.",
      noNearbyOrders: 'No order is waiting for a driver.',
      busyNotice: "On a job — they can be assigned again once it's delivered.",
      offlineNotice: "Offline in the driver app — orders can't be assigned to them.",
      ordersHere: 'Open orders here',
      driverHistory: "This driver's orders",
      restaurantHistory: "This restaurant's orders",
      fromRestaurant: '{distance} from the restaurant',
      rank: 'Nearest no. {rank}',
    },

    action: {
      assignTitle: 'Assign {driver} to #{order}?',
      assignDetail: '{distance} from {restaurant}',
      earlyWarning: "The restaurant hasn't accepted this order yet.",
      staleWarning: "This driver's position is {duration} old.",
      confirm: 'Assign driver',
      cancel: 'Cancel',
      sending: 'Assigning…',
      done: '{driver} assigned to #{order}.',
      failed: "Couldn't assign the driver",
      dismiss: 'Dismiss',
    },

    map: {
      label: 'Map of open orders, restaurants and drivers',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      fitAll: 'Show everything',
      legend: 'Legend',
      showLegend: 'Show the legend',
      hideLegend: 'Hide the legend',
      customers: 'Customers',
      restaurants: 'Restaurants',
      drivers: 'Drivers',
      region: 'Region outline',
      lines: 'Lines',
      trip: 'The order, restaurant to customer',
      approach: 'A driver to their next stop',
      candidate: 'A free driver nearby',
      straight: 'Straight lines, not driving routes.',
      loading: 'Loading the map…',
      errorTitle: "The map couldn't load",
      errorBody: 'Orders and drivers are still listed in the panel, and can be assigned from there.',
      retry: 'Try again',
      unplaced_one: '{count} item has no position and is only in the list.',
      unplaced_other: '{count} items have no position and are only in the list.',
      pinOrder: 'Order #{order}, {customer}',
      pinRestaurant_one: '{name}, {count} open order',
      pinRestaurant_other: '{name}, {count} open orders',
    },

    sheet: {
      expand: 'Expand the panel',
      collapse: 'Collapse the panel',
    },
  },
} as const;
