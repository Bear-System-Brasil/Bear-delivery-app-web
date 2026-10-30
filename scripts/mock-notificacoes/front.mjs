#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Build + start do front apontado pro back de teste das notificações.
//
//   pnpm mock:front           (build e sobe em http://localhost:3200)
//   pnpm mock:front --sem-build
//
// O .env do projeto aponta pra PRODUÇÃO. Um build sem as variáveis abaixo
// já mandou um teste pra produção, então este script fixa as duas URLs e
// confere no bundle antes de subir: se o client não apontar pro mock, aborta.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MOCK = `http://localhost:${process.env.MOCK_PORT ?? 4100}`;
const env = { ...process.env, NEXT_PUBLIC_API_URL: MOCK, API_URL: MOCK };

if (!process.argv.includes("--sem-build")) {
  console.log(`Build apontado pra ${MOCK}...`);
  const build = spawnSync("npx", ["next", "build"], { env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

// O NEXT_PUBLIC_API_URL é embutido no bundle no build: confere que é o mock.
function contem(dir, texto) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (contem(caminho, texto)) return true;
    } else if (nome.endsWith(".js") && readFileSync(caminho, "utf8").includes(texto)) {
      return true;
    }
  }
  return false;
}
if (!contem(".next/static", MOCK)) {
  console.error(`ABORTADO: o bundle não aponta pra ${MOCK}. Rode sem --sem-build.`);
  process.exit(1);
}

console.log("Bundle conferido. Subindo o front em http://localhost:3200 ...");
spawn("npx", ["next", "start", "-p", "3200"], { env, stdio: "inherit" });
