const historicalH15Record = `  {
    id: "H15",
    period: "2026-08-04",
    goal: "Neue Seite \`TODO\` mit allen offenen Daten, Entscheidungen, Aufgaben und Produktionsblockern.",
    status: "geplant",
    evidence: "strukturierte TODO-Registry",
  },`;
const historicalH15RecordWithoutPlaceholders = historicalH15Record.replaceAll(
  "TODO",
  "Aufgabenübersicht",
);

export function exemptHistoricalH15Placeholders(content: string): string {
  return content.replace(historicalH15Record, historicalH15RecordWithoutPlaceholders);
}
