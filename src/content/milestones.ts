export type HistoricalMilestoneStatus = "abgeschlossen" | "geplant";

export interface HistoricalMilestone {
  readonly id: `H${number}`;
  readonly period: string;
  readonly goal: string;
  readonly status: HistoricalMilestoneStatus;
  readonly evidence: string;
}

export const historicalMilestones = [
  {
    id: "H0",
    period: "2026-07-15",
    goal: "Moderne Website für die Tierarztpraxis auf GitHub Pages; Cloudflare Free Tier darf ergänzen.",
    status: "abgeschlossen",
    evidence: "Grundarchitektur definiert",
  },
  {
    id: "H1",
    period: "2026-07-15 bis 2026-08-03",
    goal: "Repository in `tierarztpraxis_schaffer` umbenennen; Altseiten-ZIP inventarisieren; relevante Daten, Texte, Farben und Bilder übernehmen; Joomla/MHTML nicht migrieren.",
    status: "abgeschlossen",
    evidence: "PR #1",
  },
  {
    id: "H2",
    period: "2026-07-15",
    goal: "FAQ und Stellenangebote werden verpflichtende Seiten; Telefonnummer prominent; OSM integrieren; fehlende Angaben als kontrollierte Platzhalter.",
    status: "abgeschlossen",
    evidence: "PR #1 und PR #2",
  },
  {
    id: "H3",
    period: "2026-07-16",
    goal: "Kanonische Domain mit Bindestrich; Alias ohne Bindestrich; API auf eigener Subdomain; GitHub-Pages-Custom-Domain repositorybezogen konfigurieren.",
    status: "abgeschlossen",
    evidence: "DNS-/Pages-Konzept",
  },
  {
    id: "H4",
    period: "2026-07-16",
    goal: "OpenStreetMap direkt anzeigen; Koordinaten `49.483750, 10.9705833333`.",
    status: "abgeschlossen",
    evidence: "Kontaktseite",
  },
  {
    id: "H5",
    period: "2026-07-16",
    goal: "Empfängeradresse ohne Worker-Codeänderung austauschbar; Workers KV statt Durable Object für selten geänderte Konfiguration.",
    status: "abgeschlossen",
    evidence: "Worker/KV",
  },
  {
    id: "H6",
    period: "2026-07-16",
    goal: "Entwicklungsmodus darf echte E-Mails nur an `tierarztpraxis_schaffer@herr-der-mails.de` senden.",
    status: "abgeschlossen",
    evidence: "Worker deployed, Nutzer bestätigt Versand",
  },
  {
    id: "H7",
    period: "2026-07-16",
    goal: "Produktionsbuild muss bei fehlenden Pflichtwerten scheitern; Entwicklungsmodus darf markierte Platzhalter ausliefern.",
    status: "abgeschlossen",
    evidence: "Validator und Workflows",
  },
  {
    id: "H8",
    period: "2026-07-16",
    goal: "Bauliche Zugänglichkeit konkret beschreiben: Erdgeschoss, kleine Türschwelle, Standardtür, kein Aufzug, Parkplätze vor der Tür, Unterstützung jederzeit.",
    status: "abgeschlossen",
    evidence: "Praxisdaten und FAQ",
  },
  {
    id: "H9",
    period: "2026-08-03",
    goal: "Worker deployen und CI mit Lockfile, Frozen Install und minimalen Rechten härten.",
    status: "abgeschlossen",
    evidence: "PR #1/Worker-Workflow",
  },
  {
    id: "H10",
    period: "2026-08-03",
    goal: "Vollständige Entwicklungsversion der Website mit Kontaktformular, OSM, FAQ, Jobs und Rechtsseiten veröffentlichen.",
    status: "abgeschlossen",
    evidence: "PR #2",
  },
  {
    id: "H11",
    period: "2026-08-03",
    goal: "Echtes Turnstile-Schlüsselpaar erzwingen, Dummy-Fallback entfernen und Fehlermeldungen präzisieren.",
    status: "abgeschlossen",
    evidence: "PR #3",
  },
  {
    id: "H12",
    period: "2026-08-03",
    goal: "CSP-bedingt blockierten Inline-Formularhandler diagnostizieren; als externes Asset ausgeben; Artefaktregressionstest ergänzen.",
    status: "abgeschlossen",
    evidence: "PR #4",
  },
  {
    id: "H13",
    period: "2026-08-04",
    goal: "Optik eleganter, hübscher und moderner gestalten; Texte lebendiger machen; mehrere Designrichtungen erstellen.",
    status: "geplant",
    evidence: "Startseiten 2–4",
  },
  {
    id: "H14",
    period: "2026-08-04",
    goal: "Alle drei neuen Designs plus bestehende Seite auswählbar machen; Standard ist die dritte neue Preview.",
    status: "geplant",
    evidence: "Startseiten 1–4",
  },
  {
    id: "H15",
    period: "2026-08-04",
    goal: "Neue Seite `TODO` mit allen offenen Daten, Entscheidungen, Aufgaben und Produktionsblockern.",
    status: "geplant",
    evidence: "strukturierte TODO-Registry",
  },
  {
    id: "H16",
    period: "2026-08-04",
    goal: "Tokenbasierter Datentransfer für Berichte, Bilder, Videos und Links; optionaler Praxisantwort-Thread.",
    status: "geplant",
    evidence: "Datentransfer-MVP",
  },
] as const satisfies readonly HistoricalMilestone[];
