import {
  cleanupExpired,
  type CleanupEnv,
  type CleanupResult,
} from "../transfers/cleanup";

export async function runMaintenance(
  env: CleanupEnv,
  now = new Date(),
): Promise<CleanupResult> {
  return cleanupExpired(env, now);
}

export default { runMaintenance };
