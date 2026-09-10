import type { Dictionary } from '../dictionary';

/**
 * The French dictionary. Typed as `Dictionary` (= `typeof en`) rather than inferred, so
 * a key added to English and forgotten here fails the build instead of silently
 * rendering an English string to a French-speaking dispatcher.
 *
 * Terminology follows switch-dashboard's own fr.json where it exists — "Livreur" for a
 * driver, "Magasin" for a restaurant, "Région" for a city — so a dispatcher moving
 * between the two staff tools reads the same words for the same things.
 */
export const fr: Dictionary = {
  app: {
    name: 'Switch',
    suite: 'Ops',
    title: 'Switch Ops',
    description: 'Suivi des commandes en direct pour la plateforme Switch.',
  },

  nav: {
    menu: 'Menu',
    orders: 'Commandes',
    map: 'Carte en direct',
    signOut: 'Déconnexion',
    signingOut: 'Déconnexion…',
    account: 'Connecté',
    staff: 'Personnel',
    admin: 'Admin',
  },

  theme: {
    label: 'Thème',
    light: 'Clair',
    dark: 'Sombre',
    system: 'Système',
  },

  language: {
    label: 'Langue',
  },

  login: {
    subtitle: 'Utilisez votre compte personnel Switch.',
    username: "Nom d'utilisateur",
    usernamePlaceholder: 'votre.identifiant',
    password: 'Mot de passe',
    submit: 'Se connecter',
    submitting: 'Connexion…',
    footnote: "Outil interne — les comptes sont créés par l'équipe plateforme Switch.",
  },

  auth: {
    noAccessTitle: "Ce compte ne peut pas utiliser Switch Ops",
    noAccessBody:
      "Ops est réservé aux comptes du personnel. Demandez à l'équipe plateforme Switch de créer le vôtre.",
    verifyFailedTitle: "Impossible de vérifier votre compte",
    noRegionTitle: "Aucune région attribuée à ce compte",
    noRegionBody:
      "Ops montre au personnel les commandes de sa propre région, et ce compte n'en a aucune. Demandez à un admin de définir votre région dans le tableau de bord.",
    tryAgain: 'Réessayer',
  },

  account: {
    open: 'Votre compte',
    title: 'Compte',
    role: 'Rôle',
    region: 'Région',
    allRegions: 'Toutes les régions',
    noRegion: 'Non attribuée',
    email: 'E-mail',
    phone: 'Téléphone',
    scopeAll: 'Vous voyez les commandes de toutes les régions.',
    scopeSingle: 'Vous voyez uniquement les commandes de {region}.',
  },

  errors: {
    network: 'Serveur injoignable. Vérifiez votre connexion et réessayez.',
    badCredentials: 'Mot de passe incorrect.',
    usernameUnknown: "Aucun compte avec cet identifiant.",
    notStaff: "Ce compte n'a pas d'accès personnel.",
    missingOrForbidden: "Vous n'avez pas la permission de voir ceci, ou cela n'existe plus.",
    forbidden: "Vous n'avez pas la permission de faire cela.",
    rejected: 'Le serveur a rejeté cette requête.',
    staffLoginMissing:
      "La connexion du personnel n'est pas disponible sur le serveur — parlez-en à l'équipe plateforme (`loginStaff`).",
    sessionExpired: 'Votre session a expiré. Veuillez vous reconnecter.',
    unknown: "Une erreur s'est produite. Veuillez réessayer.",
    driverOffline:
      "Ce livreur est déconnecté dans l'application livreur : la commande n'a pas pu lui être attribuée.",
    orderCanceled: 'Cette commande a été annulée.',
    orderTaken: 'Un livreur a déjà accepté cette commande.',
  },

  common: {
    none: '—',
    copy: 'Copier',
    copied: 'Copié',
    retry: 'Réessayer',
    loading: 'Chargement',
  },

  orders: {
    eyebrow: 'Opérations',
    title: 'Commandes',
    subtitle: 'Toutes les commandes de la plateforme, les plus récentes en premier.',

    live: {
      on: 'En direct',
      off: 'En pause',
      toggleOn: "Reprendre l'actualisation automatique",
      toggleOff: "Suspendre l'actualisation automatique",
      refresh: 'Actualiser maintenant',
      refreshing: 'Actualisation…',
      updated: 'Actualisé {time}',
      never: 'Pas encore chargé',
    },

    search: {
      label: 'Recherche',
      placeholder: 'Rechercher…',
      field: 'Rechercher par',
      orderId: 'ID de commande',
      userId: 'ID du client',
      driverId: 'ID du livreur',
      restaurantId: 'ID du magasin',
      clear: 'Effacer la recherche',
      submit: 'Rechercher',
      hint: "Les ID de commande se recherchent par leur début ; les trois autres exigent l'ID complet.",
    },

    filters: {
      region: 'Région',
      anyRegion: 'Toutes les régions',
      type: 'Type',
      anyType: 'Tous les types',
      stage: 'Étape',
      anyStage: 'Toutes les étapes',
      regionLocked: 'Votre région attribuée — les commandes hors de celle-ci ne sont pas affichées.',
      unassignedOnly: 'À affecter',
      reset: 'Tout effacer',
      active_one: '{count} filtre actif',
      active_other: '{count} filtres actifs',
    },

    range: {
      label: 'Date',
      today: "Aujourd'hui",
      yesterday: 'Hier',
      week: '7 derniers jours',
      month: '30 derniers jours',
      all: "N'importe quelle date",
      custom: 'Personnalisé',
      from: 'Du',
      to: 'Au',
      anyDate: 'Toutes les dates',
    },

    pipeline: {
      heading: 'Flux',
      caption_one: '{count} commande sur {range}',
      caption_other: '{count} commandes sur {range}',
      empty: 'Aucune commande sur cette période.',
      hint: 'Choisissez une étape pour filtrer la liste.',
      partial: "Les compteurs suivent les filtres ci-dessus, sauf l'étape et le livreur.",
    },

    alert: {
      unassigned_one: "{count} commande en livraison n'a pas de livreur.",
      unassigned_other: "{count} commandes en livraison n'ont pas de livreur.",
      unassignedAction: 'Les afficher',
    },

    stage: {
      new: 'Nouvelle',
      confirmed: 'Confirmée',
      active: 'En cours',
      done: 'Terminée',
      canceled: 'Annulée',
    },

    status: {
      placed: 'Passée',
      confirmed: 'Confirmée',
      onTheWay: 'En chemin',
      prepared: 'Prêt pour le ramassage',
      delivered: 'Livré',
      picked: 'Ramassé',
      canceled: 'Annulé',
      unknown: 'Inconnu',
    },

    type: {
      delivery: 'Livraison',
      pickup: 'Pickup',
    },

    row: {
      customerPhone: 'Téléphone du client',
      driver: 'Livreur',
      noDriver: 'Sans livreur',
      items_one: '{count} article',
      items_other: '{count} articles',
      noItems: 'Aucun article',
      expand: 'Afficher le détail',
      collapse: 'Masquer le détail',
      ready: 'Prêt',
      waiting: 'En attente depuis {duration}',
    },

    detail: {
      orderNote: 'Note du client',

      people: 'Personnes',
      customer: 'Client',
      driver: 'Livreur',
      restaurant: 'Magasin',
      manager: 'Manageur',
      unassigned: 'Pas encore attribué',
      noPhone: 'Aucun téléphone',
      copyId: "Copier l'ID",

      basket: 'Panier',
      quantity: '×{count}',
      supplements: 'Suppléments',
      lineNote: 'Note',
      basketEmpty: "Cette commande n'a aucune ligne.",
      basketUnresolved: 'Un plat de cette commande a été supprimé du menu.',

      payment: 'Paiement',
      itemsTotal: 'Total des articles',
      discount: 'Remise',
      deliveryFee: 'Livraison',
      freeDelivery: 'Livraison gratuite',
      service: 'Frais de service',
      total: 'Total',
      cash: 'Espèces',
      creditcards: 'Carte',
      unknownMethod: 'Non renseigné',

      showOnMap: 'Voir sur la carte',
    },

    empty: {
      title: 'Aucune commande ne correspond',
      body: 'Rien ne correspond aux filtres ci-dessus.',
      bodySearch: 'Rien ne correspond à « {query} » sur cette période.',
      searchAllDates: 'Chercher sur toutes les dates',
      clear: 'Effacer tous les filtres',
    },

    error: {
      title: 'Impossible de charger les commandes',
    },

    list: {
      updating: 'Mise à jour des résultats…',
    },

    pager: {
      previous: 'Précédent',
      next: 'Suivant',
      page: 'Page {page}',
      pageOf: 'Page {page} sur {total}',
      showing: '{from}–{to} sur {total}',
      label: 'Pagination',
    },
  },

  dispatch: {
    panel: 'Dispatch',
    region: 'Région',
    allRegions: 'Toutes les régions',
    window: 'Commandes ouvertes passées ces {hours} dernières heures.',
    truncated: 'Affichage des {shown} plus récentes sur {total} commandes ouvertes.',

    kpi: {
      needsDriver: 'Sans livreur',
      awaitingRestaurant: 'Attente magasin',
      freeDrivers: 'Livreurs libres',
      late_one: '{count} en retard',
      late_other: '{count} en retard',
      busy_one: '{count} en course',
      busy_other: '{count} en course',
    },

    tabs: {
      label: 'Listes',
      orders: 'Commandes',
      drivers: 'Livreurs',
      restaurants: 'Magasins',
    },

    search: {
      label: 'Filtrer les listes',
      placeholder: 'N° de commande, nom ou téléphone…',
      clear: 'Effacer le filtre',
      noOrders: 'Aucune commande ouverte ne correspond à « {query} ».',
      noDrivers: 'Aucun livreur ne correspond à « {query} ».',
      noRestaurants: 'Aucun magasin avec une commande ouverte ne correspond à « {query} ».',
    },

    restaurants: {
      heading: 'Avec commandes en cours',
      orders_one: '{count} commande',
      orders_other: '{count} commandes',
      noDriver_one: '{count} sans livreur',
      noDriver_other: '{count} sans livreur',
      toAccept_one: '{count} à accepter',
      toAccept_other: '{count} à accepter',
      empty: "Aucun magasin n'a de commande ouverte",
      emptyBody: "Un magasin apparaît ici dès qu'une de ses commandes est passée.",
    },

    hours: {
      title: 'Horaires',
      openUntil: "Ouvert jusqu'à {time}",
      breakUntil: "Pause jusqu'à {time}",
      paused: 'En pause',
      pausedHint:
        "Désactivé dans l'application gérant ou le tableau de bord — les clients ne peuvent pas commander.",
      opensAt: 'Fermé · ouvre à {time}',
      dayOff: "Fermé aujourd'hui",
      closed: 'Fermé',
      unknown: 'Aucun horaire renseigné',
      schedule: '{open} – {close}',
      breakWindow: 'Pause {start} – {end}',
      everyDay: 'Tous les jours',
    },

    phase: {
      needsDriver: 'Livreur à attribuer',
      awaitingRestaurant: 'En attente du magasin',
      withDriver: 'Avec un livreur',
      pickup: 'Retrait client',
    },

    phaseHint: {
      needsDriver: 'Acceptée par le magasin — attribuez un livreur.',
      awaitingRestaurant: 'Passée, pas encore acceptée par le magasin.',
      withDriver: "Un livreur s'en occupe.",
      pickup: 'Le client la récupère au magasin.',
    },

    driverState: {
      available: 'Disponible',
      busy: 'En course',
      signalLost: 'Signal perdu',
    },

    driverStateHint: {
      available: 'En ligne et libre de prendre une commande.',
      busy: 'Transporte une commande.',
      signalLost: "En ligne, mais l'application n'envoie plus de position.",
    },

    queue: {
      emptyOrders: 'Aucune commande en cours',
      emptyOrdersBody: 'Les commandes apparaissent ici dès leur passage.',
      allAssigned: 'Chaque livraison acceptée a un livreur.',
      emptyDrivers: 'Aucun livreur en ligne',
      emptyDriversBody: "Les livreurs apparaissent ici quand ils se connectent dans l'application livreur.",
      noDriver: 'Sans livreur',
      waiting: 'En attente depuis {duration}',
      toRestaurant: 'en route vers le magasin',
      toCustomer: 'en route vers le client',
      carrying: 'Sur #{order}',
      seen: 'Vu {time}',
      noPosition: 'Aucune position',
    },

    detail: {
      back: 'Retour à la liste',
      notFoundTitle: "N'est plus sur la carte",
      notFoundBody:
        "Elle a été livrée ou annulée entre-temps, ou elle appartient à une région qui n'est pas affichée.",
      openInOrders: 'Ouvrir dans Commandes',
      placed: 'Passée {time}',
      route: 'Trajet',
      pickupStop: 'Récupérer chez',
      dropoffStop: 'Livrer à',
      collectedByCustomer: 'Le client récupère cette commande ici.',
      straightLine: "{distance} à vol d'oiseau",
      noPin: 'Aucune position enregistrée — absent de la carte.',
      driver: 'Livreur',
      noDriverYet: 'Pas encore de livreur',
      notAcceptedYet: "Le magasin n'a pas encore accepté cette commande.",
      candidates: 'Livreurs libres les plus proches',
      candidatesHint: "Distance à vol d'oiseau jusqu'au magasin.",
      noCandidates: "Aucun livreur libre n'est en ligne ici pour le moment.",
      othersBusy_one: '{count} livreur est sur une autre course.',
      othersBusy_other: "{count} livreurs sont sur d'autres courses.",
      showAll: 'Tout afficher ({count})',
      showFewer: 'Afficher moins',
      assign: 'Attribuer',
      call: 'Appeler',
      viewDriver: 'Fiche du livreur',
      viewRestaurant: 'Fiche du magasin',
      position: 'Position mise à jour {time}',
      noPosition: 'Aucune position reçue pour le moment',
      staleWarning:
        "Aucune position depuis {duration}. L'application livreur est peut-être fermée ou hors ligne — appelez-le avant de l'envoyer.",
      carrying: 'Transporte',
      nearbyOrders: 'Commandes en attente de livreur',
      nearbyOrdersHint: "Distance à vol d'oiseau entre ce livreur et le magasin de chaque commande.",
      noNearbyOrders: "Aucune commande n'attend de livreur.",
      busyNotice: 'En course — il pourra recevoir une commande une fois celle-ci livrée.',
      offlineNotice:
        "Déconnecté dans l'application livreur — aucune commande ne peut lui être attribuée.",
      ordersHere: 'Commandes ouvertes ici',
      driverHistory: 'Commandes de ce livreur',
      restaurantHistory: 'Commandes de ce magasin',
      fromRestaurant: '{distance} du magasin',
      rank: 'N° {rank} le plus proche',
    },

    action: {
      assignTitle: 'Attribuer {driver} à la commande #{order} ?',
      assignDetail: '{distance} de {restaurant}',
      earlyWarning: "Le magasin n'a pas encore accepté cette commande.",
      staleWarning: 'La position de ce livreur date de {duration}.',
      confirm: 'Attribuer le livreur',
      cancel: 'Annuler',
      sending: 'Attribution…',
      done: '{driver} attribué à la commande #{order}.',
      failed: "Impossible d'attribuer le livreur",
      dismiss: 'Fermer',
    },

    map: {
      label: 'Carte des commandes ouvertes, des magasins et des livreurs',
      zoomIn: 'Zoom avant',
      zoomOut: 'Zoom arrière',
      fitAll: 'Tout afficher',
      legend: 'Légende',
      showLegend: 'Afficher la légende',
      hideLegend: 'Masquer la légende',
      customers: 'Clients',
      restaurants: 'Magasins',
      drivers: 'Livreurs',
      region: 'Contour de la région',
      lines: 'Lignes',
      trip: 'La commande, du magasin au client',
      approach: 'Un livreur vers sa prochaine étape',
      candidate: 'Un livreur libre à proximité',
      straight: "Lignes droites, pas d'itinéraires routiers.",
      loading: 'Chargement de la carte…',
      errorTitle: "La carte n'a pas pu se charger",
      errorBody:
        'Les commandes et les livreurs restent listés dans le panneau, et peuvent être attribués depuis celui-ci.',
      retry: 'Réessayer',
      unplaced_one: "{count} élément n'a pas de position et n'apparaît que dans la liste.",
      unplaced_other: "{count} éléments n'ont pas de position et n'apparaissent que dans la liste.",
      pinOrder: 'Commande #{order}, {customer}',
      pinRestaurant_one: '{name}, {count} commande ouverte',
      pinRestaurant_other: '{name}, {count} commandes ouvertes',
    },

    sheet: {
      expand: 'Agrandir le panneau',
      collapse: 'Réduire le panneau',
    },
  },
};
