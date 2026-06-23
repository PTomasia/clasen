import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Severidade ajustada para o CI refletir saúde real (erro = problema de verdade).
  // O que continua ERRO: rules-of-hooks (hook condicional é bug), exhaustive-deps,
  // e o resto do padrão do Next. O que vira AVISO está justificado abaixo.
  {
    rules: {
      // `db: any` é intencional: services/queries rodam contra dois drivers Drizzle
      // (libsql em prod, better-sqlite3 nos testes); um tipo compartilhado seria
      // custoso e frágil. Mantido como aviso para não travar o CI.
      "@typescript-eslint/no-explicit-any": "warn",
      // Regras do React Compiler (eslint-plugin-react-hooks v6): advisórias, sinalizam
      // padrões que o compiler não otimiza — não são bugs de correção. Ex.:
      // setState em effect para sincronizar form de dialog (padrão legítimo do projeto).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
