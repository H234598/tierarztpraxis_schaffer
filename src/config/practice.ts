import { todo, verified } from "./verified-value";

const ownerConfirmation = "Bestätigung durch den Auftraggeber";
const confirmedOn = "2026-07-16";

export const practiceAccessibility = {
  location: verified(
    "Die gesamte Praxis befindet sich im Erdgeschoss.",
    ownerConfirmation,
    confirmedOn,
  ),
  entranceThreshold: verified(
    "Am Eingang befindet sich eine kleine Türschwelle; der Zugang ist nicht vollständig schwellenlos.",
    ownerConfirmation,
    confirmedOn,
  ),
  entranceDoor: verified(
    "Die Eingangstür hat Standardbreite.",
    ownerConfirmation,
    confirmedOn,
  ),
  elevator: verified(
    "Ein Aufzug wird nicht benötigt, weil alle Praxisräume im Erdgeschoss liegen.",
    ownerConfirmation,
    confirmedOn,
  ),
  parking: verified(
    "Geeignete Parkplätze befinden sich unmittelbar vor der Praxis.",
    ownerConfirmation,
    confirmedOn,
  ),
  teamAssistance: verified(
    "Unterstützung durch das Praxisteam wird jederzeit gewährleistet.",
    ownerConfirmation,
    confirmedOn,
  ),
  entranceDoorClearWidthCm: todo<number | null>(
    null,
    "Die lichte Türbreite in Zentimetern vor Produktion ausmessen.",
  ),
  thresholdHeightCm: todo<number | null>(
    null,
    "Die Höhe der Türschwelle in Zentimetern vor Produktion ausmessen.",
  ),
  accessibleToilet: todo<boolean | null>(
    null,
    "Zugänglichkeit und Ausstattung des Praxis-WCs prüfen.",
  ),
  publicTransport: todo<string>(
    "TODO: Barrierearme ÖPNV-Anfahrt ergänzen",
    "Haltestellen, Entfernung und mögliche Hindernisse prüfen.",
  ),
} as const;

export const accessibilityFaqAnswer = [
  practiceAccessibility.location.value,
  practiceAccessibility.entranceThreshold.value,
  practiceAccessibility.entranceDoor.value,
  practiceAccessibility.elevator.value,
  practiceAccessibility.parking.value,
  "Benötigen Sie beim Zugang oder während Ihres Besuchs Unterstützung, hilft Ihnen unser Team jederzeit gerne.",
  "Bitte rufen Sie uns bei besonderen Anforderungen vor Ihrem Besuch kurz an, damit wir Sie bestmöglich unterstützen können.",
].join(" ");
