export function joinBasePath(base: string, pathname: string): string {
  const cleanPath = pathname.replace(/^\/+/, "");
  return `${base}${cleanPath}`.replace(/\/{2,}/g, "/");
}

export function withBase(pathname: string): string {
  return joinBasePath(import.meta.env.BASE_URL, pathname);
}
