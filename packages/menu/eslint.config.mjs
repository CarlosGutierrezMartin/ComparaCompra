import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // Funciones puras: sin acceso a red (docs/SPEC.md, reglas de estilo).
      "no-restricted-globals": ["error", "fetch", "XMLHttpRequest", "WebSocket"],
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
