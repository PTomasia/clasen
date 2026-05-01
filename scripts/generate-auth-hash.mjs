// Gerador de hash PBKDF2 pra basic auth do middleware.
//
// Uso:
//   node scripts/generate-auth-hash.mjs
//
// O script pede a senha por stdin, gera salt aleatório e hash PBKDF2
// (SHA-256, 100k iterations, 32 bytes) e imprime os valores prontos pra
// colar no middleware.ts.
//
// IMPORTANTE: a senha aparece no terminal enquanto digita. Após copiar
// salt+hash, limpe o histórico do terminal pra não deixar a senha em
// scrollback (tecla Up/Down do shell). No Windows: clear ou cls.

import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

rl.question(
  "Digite a senha (vai aparecer na tela; limpe o terminal depois): ",
  (senha) => {
    rl.close();
    if (!senha || senha.length < 8) {
      console.error(
        "\nErro: senha muito curta. Use pelo menos 8 caracteres (idealmente 20+ aleatórios)."
      );
      process.exit(1);
    }

    const salt = randomBytes(16).toString("hex");
    const iterations = 100000;
    const hash = pbkdf2Sync(
      senha,
      Buffer.from(salt, "hex"),
      iterations,
      32,
      "sha256"
    ).toString("hex");

    console.log("\n— Cole estes 2 valores no src/middleware.ts —\n");
    console.log(`const AUTH_SALT_HEX = "${salt}";`);
    console.log(`const AUTH_HASH_HEX = "${hash}";`);
    console.log("\n(senha NÃO precisa ir pro código)");
  }
);
