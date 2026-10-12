export type HomeVariantId = "1" | "2" | "3" | "4";

export interface HomeVariantDefinition {
  readonly id: HomeVariantId;
  readonly label: `Startseite ${HomeVariantId}`;
  readonly route: `/startseiten/${HomeVariantId}/`;
  readonly designName: string;
  readonly isDefault: boolean;
  readonly canonicalPath: "/";
  readonly robots: "noindex,follow";
}

export const homeVariants = [
  {
    id: "1",
    label: "Startseite 1",
    route: "/startseiten/1/",
    designName: "Bestandsvariante",
    isDefault: false,
    canonicalPath: "/",
    robots: "noindex,follow",
  },
  {
    id: "2",
    label: "Startseite 2",
    route: "/startseiten/2/",
    designName: "Premium klinisch",
    isDefault: false,
    canonicalPath: "/",
    robots: "noindex,follow",
  },
  {
    id: "3",
    label: "Startseite 3",
    route: "/startseiten/3/",
    designName: "Editorial ruhig",
    isDefault: false,
    canonicalPath: "/",
    robots: "noindex,follow",
  },
  {
    id: "4",
    label: "Startseite 4",
    route: "/startseiten/4/",
    designName: "Modern Teal/Koralle",
    isDefault: true,
    canonicalPath: "/",
    robots: "noindex,follow",
  },
] as const satisfies readonly HomeVariantDefinition[];

export const defaultHomeVariantId: HomeVariantId = "4";
