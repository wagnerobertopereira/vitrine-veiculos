// Gera as ilustrações provisórias (SVG) de cada segmento.
// Roda sozinho no deploy: node tools/gerar-ilustracoes.mjs
// Troque as ilustrações por fotos reais pelo painel do administrador.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "img");
mkdirSync(join(OUT, "imoveis"), { recursive: true });

function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const uni = (r, a, b) => a + r() * (b - a);
const int = (r, a, b) => Math.floor(uni(r, a, b + 1));

const SKIES = [["#f6d7a7", "#fbeedd"], ["#a9cbe0", "#e8f1f4"], ["#f2b48a", "#f9e2c8"], ["#9fc3d6", "#f3efe2"]];
const HILLS = [["#9bb07a", "#6f8d55", "#4c6b3b"], ["#a7b47e", "#7d9358", "#56703f"], ["#b9b07a", "#8a9a5b", "#5e7744"]];

function hill(y, amp, color, r, w = 800, h = 500) {
  const pts = []; for (let i = 0; i <= 6; i++) pts.push([i * w / 6, y + uni(r, -amp, amp)]);
  let d = `M0 ${h} L0 ${pts[0][1].toFixed(0)} `;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [x, yy] = pts[i];
    d += `Q${(px + (x - px) / 4).toFixed(0)} ${py.toFixed(0)} ${((px + x) / 2).toFixed(0)} ${((py + yy) / 2).toFixed(0)} T${x.toFixed(0)} ${yy.toFixed(0)} `;
  }
  return `<path d="${d}L${w} ${h} Z" fill="${color}"/>`;
}
function tree(x, y, s, r, cor) {
  const c = cor || pick(r, ["#3f5e34", "#4e7140", "#35522d", "#5b7d47"]);
  return `<rect x="${(x - 2 * s).toFixed(0)}" y="${(y - 10 * s).toFixed(0)}" width="${(4 * s).toFixed(0)}" height="${(12 * s).toFixed(0)}" fill="#5a4330"/>` +
    `<circle cx="${x}" cy="${(y - 16 * s).toFixed(0)}" r="${(11 * s).toFixed(0)}" fill="${c}"/>` +
    `<circle cx="${(x - 7 * s).toFixed(0)}" cy="${(y - 11 * s).toFixed(0)}" r="${(8 * s).toFixed(0)}" fill="${c}"/>` +
    `<circle cx="${(x + 7 * s).toFixed(0)}" cy="${(y - 11 * s).toFixed(0)}" r="${(8 * s).toFixed(0)}" fill="${c}"/>`;
}
function house(x, y, s) {
  const f = (n) => n.toFixed(0);
  return `<rect x="${x}" y="${f(y - 40 * s)}" width="${f(90 * s)}" height="${f(40 * s)}" fill="#efe3cf"/>` +
    `<polygon points="${f(x - 8 * s)},${f(y - 40 * s)} ${f(x + 45 * s)},${f(y - 70 * s)} ${f(x + 98 * s)},${f(y - 40 * s)}" fill="#a2532f"/>` +
    `<rect x="${f(x + 38 * s)}" y="${f(y - 24 * s)}" width="${f(14 * s)}" height="${f(24 * s)}" fill="#6b4a33"/>` +
    `<rect x="${f(x + 12 * s)}" y="${f(y - 30 * s)}" width="${f(16 * s)}" height="${f(12 * s)}" fill="#8fb3c4"/>` +
    `<rect x="${f(x + 62 * s)}" y="${f(y - 30 * s)}" width="${f(16 * s)}" height="${f(12 * s)}" fill="#8fb3c4"/>`;
}
function cena(seed, extra = []) {
  const r = rng(seed); const [s1, s2] = pick(r, SKIES); const hl = pick(r, HILLS);
  const p = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice">`,
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs>`,
    `<rect width="800" height="500" fill="url(#s)"/>`, `<circle cx="${int(r, 120, 680)}" cy="${int(r, 70, 130)}" r="${int(r, 28, 42)}" fill="#fff6e0" opacity=".85"/>`,
    hill(230, 30, "#b8c6b4", r), hill(290, 35, hl[0], r), hill(350, 25, hl[1], r), hill(420, 15, hl[2], r)];
  for (let i = int(r, 5, 9); i--;) p.push(tree(int(r, 20, 780), int(r, 330, 380), uni(r, .5, .9), r));
  if (extra.includes("lago")) p.push(`<ellipse cx="${int(r, 150, 300)}" cy="455" rx="120" ry="22" fill="#7fa9b8"/>`);
  if (extra.includes("casa")) p.push(house(int(r, 380, 520), 430, uni(r, 1.1, 1.5)));
  if (extra.includes("piscina")) p.push(`<rect x="560" y="440" width="170" height="40" rx="10" fill="#7cc4d4" stroke="#e9e2d2" stroke-width="6"/>`);
  if (extra.includes("cerca")) { for (let x = 30; x < 780; x += 45) p.push(`<rect x="${x}" y="440" width="5" height="40" fill="#7a5a3c"/>`); p.push(`<rect x="20" y="452" width="770" height="3" fill="#7a5a3c"/>`); }
  if (extra.includes("pomar")) for (let x = 80; x < 360; x += 55) { p.push(tree(x, 480, .8, r, "#5f8a3e")); p.push(`<circle cx="${x + 4}" cy="465" r="3" fill="#e08a2e"/>`); }
  for (let i = int(r, 4, 7); i--;) p.push(tree(int(r, 20, 780), int(r, 470, 520), uni(r, 1, 1.5), r));
  return p.join("") + "</svg>";
}

// ---- Imóveis (cenas do sul de Minas) ----
const IMGS = {
  ca01: [["casa"], ["casa", "pomar"], []], ca02: [["casa", "piscina"], ["casa"]], ap01: [["casa"], []],
  ch01: [["casa", "piscina"], ["pomar"], ["lago"]], ch02: [["casa", "lago"], ["pomar"]],
  te01: [["cerca"], []], te02: [["cerca"], ["lago"]], op01: [["casa", "lago"], ["pomar"]],
};
Object.entries(IMGS).forEach(([k, vs], i) => vs.forEach((ex, j) => writeFileSync(join(OUT, "imoveis", `${k}-${j + 1}.svg`), cena(i * 31 + j * 7 + 1, ex))));
writeFileSync(join(OUT, "imoveis", "hero.svg"), cena(5, ["lago", "casa", "pomar"]));

// ---- Veículos (silhuetas num estúdio) ----
mkdirSync(join(OUT, "veiculos"), { recursive: true });
function estudio(fundo, chao, conteudo, w = 800, h = 500) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fundo[0]}"/><stop offset="1" stop-color="${fundo[1]}"/></linearGradient>` +
    `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${chao[0]}"/><stop offset="1" stop-color="${chao[1]}"/></linearGradient>` +
    `<radialGradient id="l" cx=".5" cy=".35" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#p)"/><rect width="${w}" height="${h}" fill="url(#l)"/>` +
    `<rect y="${h * .68}" width="${w}" height="${h * .32}" fill="url(#c)"/>` + conteudo + `</svg>`;
}
const roda = (x, y, r, aro = "#c9ced6") => `<circle cx="${x}" cy="${y}" r="${r}" fill="#1c1f24"/><circle cx="${x}" cy="${y}" r="${r * .62}" fill="${aro}"/><circle cx="${x}" cy="${y}" r="${r * .22}" fill="#5b616b"/>` +
  [0, 72, 144, 216, 288].map((a) => { const t = a * Math.PI / 180; return `<line x1="${x}" y1="${y}" x2="${(x + Math.cos(t) * r * .58).toFixed(1)}" y2="${(y + Math.sin(t) * r * .58).toFixed(1)}" stroke="#8a919b" stroke-width="${(r * .1).toFixed(1)}"/>`; }).join("");
function carro(cor, estilo = "hatch", dx = 0) {
  const sombra = `<ellipse cx="${400 + dx}" cy="402" rx="290" ry="20" fill="#000" opacity=".22"/>`;
  const corpos = {
    hatch: "M130 370 L130 318 Q132 300 160 294 L250 282 L320 222 Q336 210 360 210 L520 210 Q548 210 566 226 L622 286 L668 300 Q680 304 680 320 L680 370 Z",
    sedan: "M110 370 L110 322 Q112 304 140 298 L240 286 L312 226 Q328 214 352 214 L500 214 Q526 214 546 230 L604 284 L676 296 Q692 300 692 318 L692 370 Z",
    suv: "M120 372 L120 300 Q122 282 150 278 L230 272 L282 196 Q294 182 318 182 L560 182 Q586 182 600 200 L644 270 L676 282 Q690 288 690 306 L690 372 Z",
    picape: "M100 372 L100 306 Q102 290 128 286 L210 280 L262 206 Q274 192 298 192 L420 192 Q440 192 444 212 L450 284 L700 284 Q712 284 712 298 L712 372 Z",
  };
  const vidros = {
    hatch: "M262 284 L328 228 Q338 220 356 220 L432 220 L432 284 Z M444 284 L444 220 L516 220 Q540 220 554 236 L594 284 Z",
    sedan: "M256 288 L320 234 Q330 224 350 224 L424 224 L424 288 Z M436 288 L436 224 L498 224 Q520 224 536 238 L578 288 Z",
    suv: "M246 274 L292 206 Q300 194 318 194 L420 194 L420 274 Z M432 274 L432 194 L556 194 Q576 194 586 210 L624 274 Z",
    picape: "M228 282 L272 214 Q280 202 298 202 L362 202 L362 282 Z M374 282 L374 202 L424 202 Q434 202 436 214 L440 282 Z",
  };
  const rodas = { hatch: [222, 588], sedan: [214, 594], suv: [228, 590], picape: [208, 610] }[estilo];
  return `<g transform="translate(${dx} 0)">${sombra.replace(`${400 + dx}`, "400")}<path d="${corpos[estilo]}" fill="${cor}"/>` +
    `<path d="${corpos[estilo]}" fill="url(#l)" opacity=".5"/><path d="${vidros[estilo]}" fill="#243447" opacity=".88"/>` +
    `<rect x="${estilo === "picape" ? 690 : 662}" y="${estilo === "suv" ? 292 : 304}" width="18" height="10" rx="3" fill="#ffe7a8"/><rect x="${estilo === "sedan" ? 112 : 122}" y="${estilo === "suv" ? 292 : 312}" width="14" height="10" rx="3" fill="#d9483b"/>` +
    `<rect x="${rodas[0] - 70}" y="352" width="${rodas[1] - rodas[0] + 140}" height="8" rx="4" fill="#000" opacity=".25"/>` +
    roda(rodas[0], 370, 44) + roda(rodas[1], 370, 44) + `</g>`;
}
function moto(cor, estilo = "street") {
  const alta = estilo === "trail";
  const y = alta ? 352 : 362, r = alta ? 62 : 56;
  const tanque = estilo === "scooter"
    ? `<path d="M300 ${y - 20} Q300 ${y - 110} 360 ${y - 150} L392 ${y - 150} L380 ${y - 60} L540 ${y - 60} Q580 ${y - 60} 586 ${y - 20} Z" fill="${cor}"/>`
    : `<path d="M352 ${y - 120} Q380 ${y - 160} 450 ${y - 158} L520 ${y - 150} Q540 ${y - 146} 530 ${y - 120} L470 ${y - 96} L380 ${y - 96} Z" fill="${cor}"/>` +
      `<path d="M500 ${y - 150} L620 ${y - 148} Q640 ${y - 146} 630 ${y - 132} L512 ${y - 126} Z" fill="#1f2328"/>` +
      `<path d="M610 ${y - 140} L640 ${y - 100} L600 ${y - 96} Z" fill="${cor}"/>`;
  return `<ellipse cx="420" cy="${y + r - 2}" rx="250" ry="16" fill="#000" opacity=".22"/>` +
    roda(250, y, r, "#9aa1ab") + roda(590, y, r, "#9aa1ab") +
    `<path d="M250 ${y} L330 ${y - 140} M330 ${y - 140} L300 ${y - 196} L270 ${y - 196}" stroke="#2b2f36" stroke-width="12" stroke-linecap="round" fill="none"/>` +
    `<path d="M590 ${y} L520 ${y - 70} L400 ${y - 70} L330 ${y - 130}" stroke="#2b2f36" stroke-width="10" stroke-linejoin="round" fill="none"/>` +
    `<rect x="400" y="${y - 96}" width="110" height="70" rx="12" fill="#4a4f57"/><path d="M470 ${y - 30} L640 ${y - 50}" stroke="#7d848e" stroke-width="12" stroke-linecap="round"/>` +
    tanque + `<circle cx="318" cy="${y - 170}" r="16" fill="#ffe7a8" stroke="#2b2f36" stroke-width="5"/>`;
}
const FUNDOS = [[["#e9edf2", "#cfd6df"], ["#9aa3ae", "#6f7883"]], [["#efe9e1", "#d9cfc2"], ["#a39684", "#7a6e5e"]], [["#e4ecef", "#c3d2d8"], ["#8c9ca3", "#61727a"]], [["#2b3440", "#1b222b"], ["#3b4652", "#1d242c"]]];
const V = {
  "cr01": [carro, "#c8cdd3", "hatch"], "cr02": [carro, "#1f2a38", "sedan"], "cr03": [carro, "#9b1c1c", "suv"], "cr04": [carro, "#f1f1f1", "picape"],
  "cr05": [carro, "#2c5d8a", "hatch"], "of01": [carro, "#6b6f75", "sedan"], "mt01": [moto, "#c62828", "street"], "mt02": [moto, "#1d4e89", "trail"], "mt03": [moto, "#f2f2f2", "scooter"],
};
Object.entries(V).forEach(([k, [fn, cor, est]], i) => [0, 1, 2].forEach((j) => {
  const [p, c] = FUNDOS[(i + j) % FUNDOS.length];
  writeFileSync(join(OUT, "veiculos", `${k}-${j + 1}.svg`), estudio(p, c, fn(cor, est, j === 1 ? 0 : 0)));
}));
writeFileSync(join(OUT, "veiculos", "hero.svg"), estudio(["#1d2a3a", "#0f1620"], ["#2a3644", "#141b24"], `<g transform="translate(-170 40) scale(.9)">${carro("#d9481e", "suv")}</g><g transform="translate(420 70) scale(.85)">${moto("#e8e8e8", "trail")}</g>`, 1200, 500));
writeFileSync(join(OUT, "veiculos", "sem-foto.svg"), estudio(FUNDOS[0][0], FUNDOS[0][1], carro("#b9c0c8", "hatch")));
console.log("Ilustrações geradas.");
