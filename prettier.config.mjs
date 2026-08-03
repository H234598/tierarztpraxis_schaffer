import astro from "prettier-plugin-astro";

export default {
  plugins: [astro],
  overrides: [
    {
      files: "*.astro",
      options: { parser: "astro" },
    },
  ],
  printWidth: 88,
  proseWrap: "always",
  trailingComma: "all",
};
