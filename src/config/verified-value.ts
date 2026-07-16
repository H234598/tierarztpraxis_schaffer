export type VerificationStatus =
  | "todo"
  | "legacy-unverified"
  | "verified";

export interface VerifiedValue<T> {
  readonly value: T;
  readonly status: VerificationStatus;
  readonly source: string;
  readonly verifiedAt?: string;
  readonly note?: string;
}

export function verified<T>(
  value: T,
  source: string,
  verifiedAt: string,
): VerifiedValue<T> {
  return {
    value,
    status: "verified",
    source,
    verifiedAt,
  };
}

export function todo<T>(
  value: T,
  note: string,
): VerifiedValue<T> {
  return {
    value,
    status: "todo",
    source: "Noch nicht bestätigt",
    note,
  };
}
