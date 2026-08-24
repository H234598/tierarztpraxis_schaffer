export interface HomeCopy {
  readonly hero: {
    readonly eyebrow: string;
    readonly title: string;
    readonly accent?: string;
    readonly intro: string;
  };
  readonly philosophy: {
    readonly title: string;
    readonly paragraphs: readonly string[];
  };
  readonly accessibility: {
    readonly title: string;
    readonly text: string;
  };
}

export const sharedHomeCopy = {
  hero: {
    eyebrow: "Tierarztpraxis in Fürth",
    title: "Mit Herz, Kompetenz und moderner Tiermedizin.",
    intro: "Aus Leidenschaft für Ihren Liebling – persönlich für Sie da.",
  },
} as const satisfies Pick<HomeCopy, "hero">;

export const variant1HomeCopy = {
  hero: {
    eyebrow: "Tierarztpraxis in Fürth",
    title: "Mit Herz, Kompetenz und moderner Tiermedizin.",
    intro:
      "Wir nehmen uns Zeit, hören zu und erklären verständlich, was Ihr Tier jetzt braucht.",
  },
} as const satisfies Pick<HomeCopy, "hero">;

export const variant2HomeCopy = {
  hero: {
    eyebrow: "Tierarztpraxis in Fürth",
    title: "Mit Herz, Zeit und moderner Medizin für Ihr Tier da.",
    intro:
      "Einfühlsame Betreuung, klare Worte und ein ruhiger Blick auf das, was Ihr Tier jetzt braucht.",
  },
} as const satisfies Pick<HomeCopy, "hero">;

export const variant3HomeCopy = {
  hero: {
    eyebrow: "Tierarztpraxis in Fürth",
    title: "Vertrauen beginnt mit einem ruhigen Gespräch.",
    intro:
      "Wir hören zu, erklären verständlich und nehmen uns Zeit – für Sie und Ihr Tier.",
  },
  philosophy: {
    title: "Unsere Philosophie",
    paragraphs: [
      "Jedes Tier ist einzigartig. Deshalb verbinden wir moderne Tiermedizin mit Empathie, Transparenz und einer Atmosphäre, in der Fragen willkommen sind.",
    ],
  },
} as const satisfies Pick<HomeCopy, "hero" | "philosophy">;

export const variant4HomeCopy = {
  hero: {
    eyebrow: "Tierarztpraxis in Fürth",
    title: "Willkommen in der Tierarztpraxis Dr. Schäffer.",
    accent: "Persönlich. Sorgfältig. Für Ihr Tier da.",
    intro:
      "Von der Vorsorge bis zur Behandlung begleiten wir Sie mit Erfahrung, Ruhe und einem offenen Ohr.",
  },
} as const satisfies Pick<HomeCopy, "hero">;

export const sharedServicePlaceholderCards = [
  {
    title: "Vorsorge und Beratung",
    text: "TODO: Tatsächliches Vorsorge-, Impf- und Beratungsangebot der Praxis fachlich bestätigen.",
  },
  {
    title: "Diagnostik und Behandlung",
    text: "TODO: Vorhandene Diagnostik, behandelte Tierarten und Behandlungsschwerpunkte ergänzen.",
  },
  {
    title: "Operationen und Nachsorge",
    text: "TODO: Operationsspektrum, Narkoseverfahren und Nachsorgeangebot bestätigen.",
  },
] as const;

export const sharedHomeFacts = {
  phoneDisplay: "0911 63 29 29 83",
  phoneHref: "tel:+4991163292983",
  address: "Friedrich-Ebert-Straße 17, 90766 Fürth",
  appointmentNote: "Wir bitten stets um telefonische Voranmeldung.",
  emergencyNote: "Das Kontaktformular und der Datentransfer sind keine Notfallkanäle.",
} as const;
