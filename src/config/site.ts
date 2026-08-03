import { accessibilityFaqAnswer, practiceAccessibility } from "./practice";

const deploymentMode = import.meta.env.SITE_DEPLOYMENT_MODE ?? "development";

export const siteConfig = {
  deploymentMode,
  isDevelopment: deploymentMode !== "production",
  canonicalUrl:
    import.meta.env.PUBLIC_SITE_URL ??
    "https://tierarztpraxis-schaffer.telacore.org",
  contactApiUrl:
    import.meta.env.PUBLIC_CONTACT_API_URL ??
    "https://api.tierarztpraxis-schaffer.telacore.org/v1/contact",
  turnstileSiteKey:
    import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ??
    "1x00000000000000000000AA",
  name: "Tierarztpraxis Dr. Michael Schäffer",
  shortName: "Tierarztpraxis Dr. Schäffer",
  claim: "Mit Herz, Kompetenz und moderner Tiermedizin.",
  subclaim: "Aus Leidenschaft für Ihren Liebling – persönlich für Sie da.",
  phone: {
    display: "0911 63 29 29 83",
    href: "tel:+4991163292983",
  },
  address: {
    street: "Friedrich-Ebert-Straße 17",
    postalCode: "90766",
    city: "Fürth",
    country: "Deutschland",
  },
  coordinates: {
    latitude: 49.48375,
    longitude: 10.970583333333334,
  },
  publicEmail: "TODO: Öffentliche Praxis-E-Mail bestätigen",
  appointmentNote: "Wir bitten stets um telefonische Voranmeldung.",
  openingHours: [
    { day: "Montag", time: "08:00–19:00" },
    { day: "Dienstag", time: "09:00–19:00" },
    { day: "Mittwoch", time: "09:00–19:00" },
    { day: "Donnerstag", time: "09:00–19:00" },
    { day: "Freitag", time: "08:00–19:00" },
    {
      day: "Samstag",
      time: "10:00–17:00",
      note: "Notfallsprechstunde; erhöhter Gebührensatz nach GOT – noch zu bestätigen",
    },
  ],
  emergencyOutsideHours:
    "TODO: Zuständigen tierärztlichen Notdienst und Ablauf ergänzen",
  accessibility: {
    faqAnswer: accessibilityFaqAnswer,
    details: practiceAccessibility,
  },
  social: {
    instagram: "https://www.instagram.com/tierarztpraxis_dr_schaeffer/",
    facebook: "https://www.facebook.com/profile.php?id=61587199954668",
  },
} as const;
