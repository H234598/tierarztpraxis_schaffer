import { describe, expect, it } from "vitest";

import { historicalMilestones } from "../src/content/milestones";

describe("historische Meilensteine", () => {
  it("liefert H15 mit dem verbindlichen Seitennamen und der Plan-Evidenz", () => {
    const h15 = historicalMilestones.find((milestone) => milestone.id === "H15");

    expect(h15?.goal).toBe(
      "Neue Seite `TODO` mit allen offenen Daten, Entscheidungen, Aufgaben und Produktionsblockern.",
    );
    expect(h15?.evidence).toBe("strukturierte TODO-Registry");
  });
});
