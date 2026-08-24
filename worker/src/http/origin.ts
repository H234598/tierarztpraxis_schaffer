export function allowedValues(csv: string): Set<string> {
  return new Set(
    csv
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}
