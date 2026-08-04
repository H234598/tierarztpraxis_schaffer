import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface VerifiedAdminIdentity {
  readonly email: string;
  readonly subject: string;
}

type KeyResolver = JWTVerifyGetKey;

interface AccessVerifierOptions {
  readonly createKeyResolver?: (jwksUrl: URL) => KeyResolver;
  readonly maxCachedJwks?: number;
}

export interface AccessVerifier {
  verify(assertion: string | null, teamDomain: string | undefined, audience: string | undefined): Promise<VerifiedAdminIdentity | null>;
}

const maximumAssertionLength = 8_192;
const defaultCacheSize = 4;

function trustedIssuer(teamDomain: string | undefined): URL | null {
  if (!teamDomain) return null;
  try {
    const url = teamDomain.startsWith("https://") ? new URL(teamDomain) : new URL(`https://${teamDomain}`);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash ||
      !url.hostname.endsWith(".cloudflareaccess.com") || url.hostname === "cloudflareaccess.com"
    ) return null;
    return teamDomain.startsWith("https://")
      ? teamDomain === url.origin ? url : null
      : teamDomain === url.hostname ? url : null;
  } catch {
    return null;
  }
}

function validCompactJwt(assertion: string | null): assertion is string {
  return Boolean(assertion && assertion.length <= maximumAssertionLength && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(assertion));
}

function validEmail(email: unknown): email is string {
  return typeof email === "string" && email === email.trim() && email.length > 0 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

function validAudience(audience: string | undefined): audience is string {
  return typeof audience === "string" && audience === audience.trim() && audience.length > 0 && audience.length <= 512;
}

function validSubject(subject: unknown): subject is string {
  return typeof subject === "string" && subject === subject.trim() && subject.length > 0 && subject.length <= 256;
}

export function createAccessVerifier(options: AccessVerifierOptions = {}): AccessVerifier {
  const cache = new Map<string, KeyResolver>();
  const cacheSize = Math.max(1, Math.min(options.maxCachedJwks ?? defaultCacheSize, defaultCacheSize));
  const createKeyResolver = options.createKeyResolver ?? createRemoteJWKSet;
  function resolverFor(issuer: URL): KeyResolver {
    const jwksUrl = new URL("/cdn-cgi/access/certs", issuer);
    const cached = cache.get(jwksUrl.href);
    if (cached) return cached;
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
    const resolver = createKeyResolver(jwksUrl);
    cache.set(jwksUrl.href, resolver);
    return resolver;
  }
  return {
    async verify(assertion, teamDomain, audience) {
      const issuer = trustedIssuer(teamDomain);
      if (!issuer || !validAudience(audience) || !validCompactJwt(assertion)) return null;
      try {
        const verified = await jwtVerify(assertion, resolverFor(issuer), {
          algorithms: ["RS256"], issuer: issuer.origin, audience,
          requiredClaims: ["exp", "nbf", "iat", "iss", "aud", "sub", "email"],
        });
        const { email, sub } = verified.payload;
        return validEmail(email) && validSubject(sub) ? { email, subject: sub } : null;
      } catch {
        return null;
      }
    },
  };
}

export const accessVerifier = createAccessVerifier();
