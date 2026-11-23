// Organiza os arquivos enviados soltos (sem pastas) na estrutura que o server.js espera.
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const R = dirname(fileURLToPath(import.meta.url));
const MAPA = {
  "app.js": "public/app.js", "index.html": "public/index.html", "styles.css": "public/styles.css",
  "sw.js": "public/sw.js", "config.json": "public/config.json",
  "segmento-veiculos.json": "public/segmentos/veiculos.json", "segmento-imoveis.json": "public/segmentos/imoveis.json",
  "exemplos-veiculos.json": "public/data/exemplos-veiculos.json", "exemplos-imoveis.json": "public/data/exemplos-imoveis.json",
  "gerar-ilustracoes.mjs": "tools/gerar-ilustracoes.mjs",
};
for (const [de, para] of Object.entries(MAPA)) {
  const o = join(R, de), d = join(R, para);
  if (existsSync(o)) { mkdirSync(dirname(d), { recursive: true }); copyFileSync(o, d); }
}
