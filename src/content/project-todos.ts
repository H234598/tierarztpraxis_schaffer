export type ProjectTodoStatus =
  "open" | "in-progress" | "blocked" | "done" | "not-applicable";

export type ProjectTodoPriority = "P0" | "P1" | "P2" | "P3";

export type ProjectTodoCategory =
  | "content"
  | "legal"
  | "accessibility"
  | "design"
  | "infrastructure"
  | "security"
  | "datatransfer"
  | "testing"
  | "operations";

export type ProjectTodoVisibility = "public" | "internal";

export interface ProjectTodo {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: ProjectTodoStatus;
  readonly priority: ProjectTodoPriority;
  readonly category: ProjectTodoCategory;
  readonly productionBlocker: boolean;
  readonly visibility: ProjectTodoVisibility;
  readonly owner: "Praxis" | "Repository" | "Cloudflare" | "Rechtliche Prüfung";
  readonly source: string;
  readonly acceptanceCriteria: readonly string[];
  readonly relatedPaths: readonly string[];
  readonly updatedAt: string;
}

export interface ProjectTodoCounts {
  readonly open: number;
  readonly inProgress: number;
  readonly blocked: number;
  readonly done: number;
  readonly notApplicable: number;
}

export interface ProjectTodoFilterOption {
  readonly value: string;
  readonly label: string;
}

export interface PublicTodoView {
  readonly counts: ProjectTodoCounts;
  readonly productionBlockers: readonly ProjectTodo[];
  readonly remainingTodos: readonly ProjectTodo[];
  readonly completedTodos: readonly ProjectTodo[];
  readonly filters: {
    readonly categories: readonly ProjectTodoFilterOption[];
    readonly statuses: readonly ProjectTodoFilterOption[];
    readonly owners: readonly ProjectTodoFilterOption[];
  };
}

export const projectTodoStatusLabels: Readonly<Record<ProjectTodoStatus, string>> = {
  open: "Offen",
  "in-progress": "In Arbeit",
  blocked: "Blockiert",
  done: "Erledigt",
  "not-applicable": "Nicht zutreffend",
};

export const projectTodoCategoryLabels: Readonly<Record<ProjectTodoCategory, string>> =
  {
    content: "Inhalte",
    legal: "Recht",
    accessibility: "Barrierefreiheit",
    design: "Design",
    infrastructure: "Infrastruktur",
    security: "Sicherheit",
    datatransfer: "Datentransfer",
    testing: "Tests",
    operations: "Betrieb",
  };

function openTodo(
  id: string,
  priority: ProjectTodoPriority,
  category: ProjectTodoCategory,
  productionBlocker: boolean,
  owner: ProjectTodo["owner"],
  title: string,
  acceptanceCriterion: string,
): ProjectTodo {
  return {
    id,
    title,
    description: title,
    status: "open",
    priority,
    category,
    productionBlocker,
    visibility: "public",
    owner,
    source: "docs/UMSETZUNGSPLAN.md §14.4",
    acceptanceCriteria: [acceptanceCriterion],
    relatedPaths: ["docs/UMSETZUNGSPLAN.md"],
    updatedAt: "2026-08-04",
  };
}

function doneTodo(...args: Parameters<typeof openTodo>): ProjectTodo {
  return { ...openTodo(...args), status: "done" };
}

export const projectTodos = [
  openTodo(
    "CNT-001",
    "P0",
    "content",
    true,
    "Praxis",
    "Öffentliche Praxis-E-Mail bestätigen",
    "Eine veröffentlichungsfähige Praxis-E-Mail ist von der Praxis bestätigt.",
  ),
  openTodo(
    "CNT-002",
    "P0",
    "content",
    true,
    "Praxis",
    "Behandelte Tierarten bestätigen",
    "Die behandelten Tierarten sind fachlich bestätigt.",
  ),
  openTodo(
    "CNT-003",
    "P0",
    "content",
    true,
    "Praxis",
    "Vollständiges Leistungsangebot fachlich freigeben",
    "Das veröffentlichte Leistungsangebot ist fachlich freigegeben.",
  ),
  openTodo(
    "CNT-004",
    "P0",
    "content",
    true,
    "Praxis",
    "Notdienst außerhalb der Sprechzeiten festlegen",
    "Notdienst, Erreichbarkeit und Formulierung sind bestätigt.",
  ),
  openTodo(
    "CNT-005",
    "P1",
    "content",
    true,
    "Praxis",
    "Teammitglieder, Funktionen und Qualifikationen erfassen",
    "Freigegebene Teamdaten liegen vollständig vor.",
  ),
  openTodo(
    "CNT-006",
    "P1",
    "content",
    true,
    "Praxis",
    "Echte Praxis- und Teamfotos samt Einwilligungen bereitstellen",
    "Nutzungsrechte und Einwilligungen für jedes Bild sind dokumentiert.",
  ),
  openTodo(
    "CNT-007",
    "P2",
    "content",
    true,
    "Praxis",
    "Urlaubs-, Feiertags- und Kurzfristhinweise organisatorisch zuordnen",
    "Eine verantwortliche Pflege der Hinweise ist festgelegt.",
  ),
  openTodo(
    "CNT-008",
    "P2",
    "content",
    false,
    "Praxis",
    "Social-Media-Ziele final bestätigen",
    "Ziele und Fortführung der Social-Media-Präsenzen sind bestätigt.",
  ),
  openTodo(
    "CNT-009",
    "P2",
    "content",
    false,
    "Praxis",
    "Eröffnungsrückblick final freigeben",
    "Text und Umfang des Eröffnungsrückblicks sind freigegeben.",
  ),

  openTodo(
    "A11Y-001",
    "P1",
    "accessibility",
    true,
    "Praxis",
    "Lichte Eingangstürbreite messen",
    "Lichte Türbreite ist gemessen und dokumentiert.",
  ),
  openTodo(
    "A11Y-002",
    "P1",
    "accessibility",
    true,
    "Praxis",
    "Höhe der Türschwelle messen",
    "Schwellenhöhe ist gemessen und dokumentiert.",
  ),
  openTodo(
    "A11Y-003",
    "P1",
    "accessibility",
    true,
    "Praxis",
    "Praxis-WC beschreiben",
    "Zugänglichkeit und Ausstattung des Praxis-WCs sind beschrieben.",
  ),
  openTodo(
    "A11Y-004",
    "P1",
    "accessibility",
    true,
    "Praxis",
    "Bewegungsflächen für Rollstuhl/Rollator prüfen",
    "Bewegungsflächen sind geprüft und Ergebnis dokumentiert.",
  ),
  openTodo(
    "A11Y-005",
    "P2",
    "accessibility",
    false,
    "Praxis",
    "Parkplatzmerkmale präzisieren",
    "Relevante Parkplatzmerkmale sind präzise beschrieben.",
  ),
  openTodo(
    "A11Y-006",
    "P2",
    "accessibility",
    false,
    "Repository",
    "Barrierearme ÖPNV-Anfahrt ermitteln",
    "Barrierearme Anfahrt und mögliche Hindernisse sind dokumentiert.",
  ),
  openTodo(
    "A11Y-007",
    "P0",
    "accessibility",
    true,
    "Repository",
    "Tastaturtest aller Seiten durchführen",
    "Alle Seiten sind per Tastatur geprüft; Befunde sind behoben oder dokumentiert.",
  ),
  openTodo(
    "A11Y-008",
    "P0",
    "accessibility",
    true,
    "Repository",
    "200- und 400-Prozent-Zoom prüfen",
    "Zoom-Prüfung bei 200 und 400 Prozent ist dokumentiert.",
  ),
  openTodo(
    "A11Y-009",
    "P0",
    "accessibility",
    true,
    "Repository",
    "Screenreader-Stichprobe durchführen",
    "Screenreader-Stichprobe ist dokumentiert; schwere Barrieren sind behoben.",
  ),
  openTodo(
    "A11Y-010",
    "P0",
    "testing",
    true,
    "Repository",
    "axe-Tests ohne schwere oder kritische Fehler",
    "axe-Tests melden keine schweren oder kritischen Fehler.",
  ),

  openTodo(
    "LEG-001",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Berufsbezeichnung und Verleihungsstaat eintragen",
    "Berufsbezeichnung und Verleihungsstaat sind rechtlich geprüft eingetragen.",
  ),
  openTodo(
    "LEG-002",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Zuständige Tierärztekammer eintragen",
    "Zuständige Tierärztekammer ist rechtlich geprüft eingetragen.",
  ),
  openTodo(
    "LEG-003",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Zuständige Aufsichtsbehörde eintragen",
    "Zuständige Aufsichtsbehörde ist rechtlich geprüft eingetragen.",
  ),
  openTodo(
    "LEG-004",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Berufsrechtliche Regelungen verlinken",
    "Berufsrechtliche Regelungen sind rechtlich geprüft verlinkt.",
  ),
  openTodo(
    "LEG-005",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Berufshaftpflichtangaben prüfen",
    "Berufshaftpflichtangaben sind rechtlich geprüft.",
  ),
  openTodo(
    "LEG-006",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Umsatzsteuer-ID oder Nichtvorhandensein klären",
    "Umsatzsteuerstatus ist rechtlich geklärt.",
  ),
  openTodo(
    "LEG-007",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Impressum rechtlich freigeben",
    "Impressum ist rechtlich freigegeben.",
  ),
  openTodo(
    "LEG-008",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Datenschutzerklärung rechtlich freigeben",
    "Datenschutzerklärung ist rechtlich freigegeben.",
  ),
  openTodo(
    "LEG-009",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Cloudflare-Auftragsverarbeitung prüfen und dokumentieren",
    "Auftragsverarbeitung ist geprüft und dokumentiert.",
  ),
  openTodo(
    "LEG-010",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Verzeichnis der Verarbeitungstätigkeiten für Datentransfer ergänzen",
    "Verzeichnis enthält Datentransfer vollständig.",
  ),
  openTodo(
    "LEG-011",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Rechtsgrundlage und Informationspflicht für Datentransfer festlegen",
    "Rechtsgrundlage und Informationspflichten sind festgelegt.",
  ),
  openTodo(
    "LEG-012",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Portal-Aufbewahrung und Übergabe in Praxisakte festlegen",
    "Aufbewahrung und Übergabe in Praxisakte sind festgelegt.",
  ),
  openTodo(
    "LEG-013",
    "P1",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Datenpannen- und Betroffenenrechteprozess dokumentieren",
    "Prozess für Datenpannen und Betroffenenrechte ist dokumentiert.",
  ),
  openTodo(
    "LEG-014",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Datentransfer-Arbeitsfassung rechtlich freigeben",
    "Datenschutzhinweise, Impressum und Datentransfer-Entscheidungsdokument sind geprüft und freigegeben.",
  ),
  openTodo(
    "LEG-015",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Datentransfer-Aufbewahrung und Aktenübergabe entscheiden",
    "Aufbewahrung, Löschung und Übergabe in die offizielle Praxisakte sind dokumentiert.",
  ),
  openTodo(
    "LEG-016",
    "P0",
    "legal",
    true,
    "Rechtliche Prüfung",
    "Betroffenenrechte- und Datenpannenprozess freigeben",
    "Kontaktweg, Identitätsprüfung und Prozesse für Betroffenenrechte und Datenpannen sind freigegeben.",
  ),

  doneTodo(
    "DES-001",
    "P1",
    "design",
    false,
    "Repository",
    "Startseite 1 modernisieren",
    "Startseite 1 ist gemäß Designvorgabe modernisiert.",
  ),
  doneTodo(
    "DES-002",
    "P1",
    "design",
    false,
    "Repository",
    "Startseite 2 implementieren",
    "Startseite 2 ist implementiert und erreichbar.",
  ),
  doneTodo(
    "DES-003",
    "P1",
    "design",
    false,
    "Repository",
    "Startseite 3 implementieren",
    "Startseite 3 ist implementiert und erreichbar.",
  ),
  doneTodo(
    "DES-004",
    "P0",
    "design",
    false,
    "Repository",
    "Startseite 4 als Landingpage implementieren",
    "Startseite 4 ist als Landingpage unter / implementiert.",
  ),
  doneTodo(
    "DES-005",
    "P1",
    "design",
    false,
    "Repository",
    "Startseiten-Dropdown barrierefrei umsetzen",
    "Dropdown ist per Tastatur bedienbar und semantisch ausgezeichnet.",
  ),
  doneTodo(
    "DES-006",
    "P1",
    "design",
    true,
    "Praxis",
    "Produktionsbilder erstellen und kennzeichnen",
    "Produktionsbilder sind bereitgestellt und korrekt gekennzeichnet.",
  ),
  doneTodo(
    "DES-007",
    "P1",
    "design",
    true,
    "Repository",
    "Bildnachweise pflegen",
    "Bildnachweise sind vollständig gepflegt.",
  ),
  doneTodo(
    "DES-008",
    "P2",
    "testing",
    false,
    "Repository",
    "Visuelle Regression für vier Varianten einrichten",
    "Visuelle Regression deckt alle vier Varianten ab.",
  ),

  openTodo(
    "DT-001",
    "P0",
    "datatransfer",
    true,
    "Cloudflare",
    "D1 in EU-Jurisdiktion erstellen",
    "D1-Datenbank ist in EU-Jurisdiktion erstellt und dokumentiert.",
  ),
  openTodo(
    "DT-002",
    "P0",
    "datatransfer",
    true,
    "Cloudflare",
    "privaten R2-Bucket in EU-Jurisdiktion erstellen",
    "Privater R2-Bucket ist in EU-Jurisdiktion erstellt und dokumentiert.",
  ),
  openTodo(
    "DT-003",
    "P0",
    "datatransfer",
    true,
    "Cloudflare",
    "Queue und Dead-Letter-Queue erstellen",
    "Queue und Dead-Letter-Queue sind eingerichtet.",
  ),
  openTodo(
    "DT-004",
    "P0",
    "security",
    true,
    "Cloudflare",
    "Access-Anwendungen und Admin-E-Mail-Policy einrichten",
    "Access-Anwendungen und Admin-Policy sind getestet eingerichtet.",
  ),
  openTodo(
    "DT-005",
    "P0",
    "security",
    true,
    "Cloudflare",
    "TOKEN_PEPPER und Session-Secrets setzen",
    "Produktionsumgebung enthält getrennte, gesetzte Geheimnisse ohne Offenlegung.",
  ),
  openTodo(
    "DT-006",
    "P0",
    "datatransfer",
    true,
    "Repository",
    "D1-Migration anwenden",
    "D1-Migration ist erfolgreich in Zielumgebung angewendet.",
  ),
  openTodo(
    "DT-007",
    "P0",
    "datatransfer",
    true,
    "Repository",
    "Token- und Sessionlogik implementieren",
    "Token- und Sessionlogik ist implementiert und getestet.",
  ),
  openTodo(
    "DT-008",
    "P0",
    "datatransfer",
    true,
    "Repository",
    "Berichtserstellung implementieren",
    "Berichtserstellung ist implementiert und getestet.",
  ),
  openTodo(
    "DT-009",
    "P0",
    "datatransfer",
    true,
    "Repository",
    "sichere Bild-/Video-Uploads implementieren",
    "Uploads prüfen Typ, Größe und Zugriffsrechte.",
  ),
  openTodo(
    "DT-010",
    "P0",
    "datatransfer",
    true,
    "Repository",
    "privaten Download und Range-Support implementieren",
    "Private Downloads und Range-Support sind getestet.",
  ),
  openTodo(
    "DT-011",
    "P0",
    "datatransfer",
    true,
    "Repository",
    "Admin-Token-Erzeugung implementieren",
    "Admin kann Token sicher erzeugen und widerrufen.",
  ),
  openTodo(
    "DT-012",
    "P1",
    "datatransfer",
    true,
    "Repository",
    "optionale Antwort und Rückrufstatus implementieren",
    "Optionale Antwort und Rückrufstatus sind implementiert.",
  ),
  openTodo(
    "DT-013",
    "P0",
    "datatransfer",
    true,
    "Repository",
    "E-Mail-Benachrichtigung ohne Berichtsinhalte",
    "Benachrichtigungen enthalten keine Berichtsinhalte.",
  ),
  openTodo(
    "DT-014",
    "P0",
    "operations",
    true,
    "Cloudflare",
    "Löschlauf und R2-Lifecycle konfigurieren",
    "Löschlauf und R2-Lifecycle sind eingerichtet und getestet.",
  ),
  openTodo(
    "DT-015",
    "P0",
    "testing",
    true,
    "Repository",
    "End-to-End-Sicherheitstest",
    "End-to-End-Sicherheitstest ist erfolgreich dokumentiert.",
  ),
  openTodo(
    "DT-016",
    "P1",
    "operations",
    true,
    "Praxis",
    "Übernahme-in-Praxisakte-Status definieren",
    "Status und Prozess für Praxisaktenübernahme sind festgelegt.",
  ),
  openTodo(
    "DT-017",
    "P1",
    "operations",
    true,
    "Repository",
    "Datentransfer-Betriebshandbuch erstellen",
    "Betriebshandbuch ist vollständig und geprüft.",
  ),

  openTodo(
    "OPS-001",
    "P0",
    "security",
    true,
    "Cloudflare",
    "Produktions-Turnstile-Widget und Secret",
    "Produktions-Widget und zugehöriges Geheimnis sind gesetzt und getestet.",
  ),
  openTodo(
    "OPS-002",
    "P0",
    "infrastructure",
    true,
    "Cloudflare",
    "Entwicklungs- und Produktions-D1/R2 trennen",
    "Entwicklungs- und Produktionsressourcen sind nachweislich getrennt.",
  ),
  openTodo(
    "OPS-003",
    "P0",
    "operations",
    true,
    "Cloudflare",
    "Migrationsworkflow mit manueller Freigabe",
    "Migrationsworkflow verlangt eine manuelle Freigabe.",
  ),
  openTodo(
    "OPS-004",
    "P1",
    "operations",
    true,
    "Cloudflare",
    "R2-Speicherwarnung bei 7 GB",
    "Speicherwarnung bei 7 GB ist eingerichtet und getestet.",
  ),
  openTodo(
    "OPS-005",
    "P1",
    "operations",
    true,
    "Cloudflare",
    "Queue-Reconciliation und Alarmierung",
    "Reconciliation und Alarmierung sind eingerichtet und getestet.",
  ),
  openTodo(
    "OPS-006",
    "P1",
    "operations",
    true,
    "Cloudflare",
    "D1-Time-Travel-Restore testen",
    "D1-Time-Travel-Restore ist erfolgreich getestet.",
  ),
  openTodo(
    "OPS-007",
    "P1",
    "operations",
    true,
    "Cloudflare",
    "Rollback- und Incident-Runbook testen",
    "Rollback- und Incident-Runbook sind erfolgreich getestet.",
  ),
  openTodo(
    "OPS-008",
    "P2",
    "operations",
    false,
    "Praxis",
    "monatliche Inhaltsprüfung terminieren",
    "Regelmäßiger Termin für Inhaltsprüfung ist festgelegt.",
  ),
] as const satisfies readonly ProjectTodo[];

const priorityRank: Readonly<Record<ProjectTodoPriority, number>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function compareTodos(left: ProjectTodo, right: ProjectTodo): number {
  const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];

  if (priorityDifference !== 0) return priorityDifference;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function isCompleted(todo: ProjectTodo): boolean {
  return todo.status === "done" || todo.status === "not-applicable";
}

function uniqueFilterOptions(
  todos: readonly ProjectTodo[],
  getValue: (todo: ProjectTodo) => string,
  getLabel: (todo: ProjectTodo) => string,
): readonly ProjectTodoFilterOption[] {
  return [
    ...new Map(
      todos.map((todo) => [
        getValue(todo),
        { value: getValue(todo), label: getLabel(todo) },
      ]),
    ).values(),
  ].sort((left, right) =>
    left.label === right.label ? 0 : left.label < right.label ? -1 : 1,
  );
}

export function createPublicTodoView(
  todos: readonly ProjectTodo[] = projectTodos,
): PublicTodoView {
  const publicTodos = todos
    .filter((todo) => todo.visibility === "public")
    .toSorted(compareTodos);
  const counts = publicTodos.reduce<ProjectTodoCounts>(
    (result, todo) => ({
      ...result,
      open: result.open + Number(todo.status === "open"),
      inProgress: result.inProgress + Number(todo.status === "in-progress"),
      blocked: result.blocked + Number(todo.status === "blocked"),
      done: result.done + Number(todo.status === "done"),
      notApplicable: result.notApplicable + Number(todo.status === "not-applicable"),
    }),
    { open: 0, inProgress: 0, blocked: 0, done: 0, notApplicable: 0 },
  );

  return {
    counts,
    productionBlockers: publicTodos.filter(
      (todo) => todo.productionBlocker && !isCompleted(todo),
    ),
    remainingTodos: publicTodos.filter(
      (todo) => !todo.productionBlocker && !isCompleted(todo),
    ),
    completedTodos: publicTodos.filter(isCompleted),
    filters: {
      categories: uniqueFilterOptions(
        publicTodos,
        (todo) => todo.category,
        (todo) => projectTodoCategoryLabels[todo.category],
      ),
      statuses: uniqueFilterOptions(
        publicTodos,
        (todo) => todo.status,
        (todo) => projectTodoStatusLabels[todo.status],
      ),
      owners: uniqueFilterOptions(
        publicTodos,
        (todo) => todo.owner,
        (todo) => todo.owner,
      ),
    },
  };
}

export function getOpenProductionBlockers(): readonly ProjectTodo[] {
  return createPublicTodoView(projectTodos).productionBlockers;
}
