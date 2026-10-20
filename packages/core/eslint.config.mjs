import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.strict, {
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "no-restricted-globals": ["error", "fetch", "XMLHttpRequest", "WebSocket"],
  },
});
