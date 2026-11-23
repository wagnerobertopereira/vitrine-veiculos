// Organiza os arquivos enviados soltos (sem pastas) na estrutura que o server.js espera.
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const R = dirname(fileURLToPath(import.meta.url));
const MAPA = {
  "app.js": "public/app.js", "index.html": "public/index.html", "styles.css": "public/styles.css",
  "sw.js": "public/sw.js", "config.json": "public/config.json", "logo.jpg": "public/img/logo.jpg",
  "segmento-veiculos.json": "public/segmentos/veiculos.json", "segmento-imoveis.json": "public/segmentos/imoveis.json",
  "exemplos-veiculos.json": "public/data/exemplos-veiculos.json", "exemplos-imoveis.json": "public/data/exemplos-imoveis.json",
  "gerar-ilustracoes.mjs": "tools/gerar-ilustracoes.mjs",
};
// Fotos dos veículos de exemplo (ex.: cr01-1.jpg) vão para public/img/fotos/
for (const f of readdirSync(R)) if (/^(cr|of|mt)\d+-\d+\.jpg$/i.test(f)) MAPA[f] = `public/img/fotos/${f.toLowerCase()}`;
for (const [de, para] of Object.entries(MAPA)) {
  const o = join(R, de), d = join(R, para);
  if (existsSync(o)) { mkdirSync(dirname(d), { recursive: true }); copyFileSync(o, d); }
}
