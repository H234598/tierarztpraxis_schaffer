export function withBase(pathname: string): string {
  const base = import.meta.env.BASE_URL;
  const cleanPath = pathname.replace(/^\/+/, "");
  return `${base}${cleanPath}`.replace(/\/{2,}/g, "/");
}
