// Vitrine de vendas multi-segmento: servidor do site (Node 22+, sem dependências externas).
// Serve o site (pasta public/), guarda anúncios, contatos, fotos e a configuração da empresa
// num bucket S3 ou em arquivos. O segmento (veículos, imóveis...) vem de public/segmentos/<id>.json.
//
// Variáveis de ambiente:
//   ADMIN_SENHA   senha do painel (obrigatória em produção)
//   SEGREDO       texto aleatório longo para assinar o login (opcional; gerado se faltar)
//   DATA_DIR      pasta dos dados quando não há bucket (padrão: ./dados)
//   S3_ENDPOINT, S3_BUCKET, S3_KEY, S3_SECRET, S3_REGION  bucket onde ficam os dados (recomendado)
//   SEM_EXEMPLOS  "1" para não carregar anúncios de exemplo
//   PORT          porta (padrão: 3000)
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname, normalize, dirname } from "node:path";
import { createHmac, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(RAIZ, "public");
const DATA_DIR = process.env.DATA_DIR || join(RAIZ, "dados");
const PORT = +process.env.PORT || 3000;
const SENHA = process.env.ADMIN_SENHA || "";
const SEGREDO = process.env.SEGREDO || randomBytes(32).toString("hex");
if (!SENHA) console.warn("AVISO: defina ADMIN_SENHA para liberar o painel do administrador.");

// Ilustrações provisórias: geradas na primeira execução
if (!existsSync(join(PUBLIC, "img", "veiculos", "hero.svg"))) await import("./tools/gerar-ilustracoes.mjs");

// ---- Armazenamento ----
const S3 = process.env.S3_BUCKET ? { endpoint: process.env.S3_ENDPOINT.replace(/\/$/, ""), bucket: process.env.S3_BUCKET, key: process.env.S3_KEY, secret: process.env.S3_SECRET, region: process.env.S3_REGION || "auto" } : null;
const sha = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();
async function s3(metodo, chave, corpo, tipo) {
  const url = new URL(`${S3.endpoint}/${S3.bucket}/${chave.split("/").map(encodeURIComponent).join("/")}`);
  const agora = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ""), dia = agora.slice(0, 8);
  const hashCorpo = sha(corpo || "");
  const cab = { host: url.host, "x-amz-content-sha256": hashCorpo, "x-amz-date": agora, ...(tipo ? { "content-type": tipo } : {}) };
  const nomes = Object.keys(cab).sort();
  const canon = [metodo, url.pathname, "", ...nomes.map((n) => `${n}:${cab[n]}`), "", nomes.join(";"), hashCorpo].join("\n");
  const escopo = `${dia}/${S3.region}/s3/aws4_request`;
  const assinar = ["AWS4-HMAC-SHA256", agora, escopo, sha(canon)].join("\n");
  const k = hmac(hmac(hmac(hmac("AWS4" + S3.secret, dia), S3.region), "s3"), "aws4_request");
  const sig = createHmac("sha256", k).update(assinar).digest("hex");
  const { host, ...enviar } = cab;
  const r = await fetch(url, { method: metodo, body: corpo, headers: { ...enviar, authorization: `AWS4-HMAC-SHA256 Credential=${S3.key}/${escopo}, SignedHeaders=${nomes.join(";")}, Signature=${sig}` } });
  if (metodo === "GET" && r.status === 404) return null;
  if (!r.ok) throw new Error(`Armazenamento respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return metodo === "GET" ? Buffer.from(await r.arrayBuffer()) : true;
}
const guardar = {
  async ler(chave) {
    if (S3) return s3("GET", chave);
    try { return await readFile(join(DATA_DIR, chave)); } catch { return null; }
  },
  async gravar(chave, dados, tipo) {
    if (S3) return s3("PUT", chave, dados, tipo);
    await mkdir(dirname(join(DATA_DIR, chave)), { recursive: true }); await writeFile(join(DATA_DIR, chave), dados);
  },
};
let fila = Promise.resolve();
const salvar = (chave, obj) => (fila = fila.then(() => guardar.gravar(chave, JSON.stringify(obj), "application/json")));
console.log(`Dados em: ${S3 ? "bucket " + S3.bucket : DATA_DIR}`);

// ---- Segmentos e configuração da empresa ----
const SEGMENTOS = Object.fromEntries(readdirSync(join(PUBLIC, "segmentos")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(PUBLIC, "segmentos", f), "utf8"))).map((s) => [s.id, s]));
const PADRAO = JSON.parse(readFileSync(join(PUBLIC, "config.json"), "utf8"));
let SALVA = JSON.parse((await guardar.ler("config.json")) || "{}");
const CAMPOS_EMPRESA = ["nome", "marcaCurta", "marcaLinha", "razaoSocial", "cnpj", "registro", "whatsapp", "whatsappExibicao", "email", "endereco", "cidade", "uf", "horario", "instagram", "logo"];
const VISUAIS = ["classico", "garagem"];
const CORES = ["principal", "principalTexto", "destaque", "destaqueTexto", "realce"];
function config() {
  const segmento = SEGMENTOS[SALVA.segmento] ? SALVA.segmento : SEGMENTOS[PADRAO.segmento] ? PADRAO.segmento : Object.keys(SEGMENTOS)[0];
  return { segmento, visual: VISUAIS.includes(SALVA.visual) ? SALVA.visual : PADRAO.visual || "classico", empresa: { ...PADRAO.empresa, ...(SALVA.empresa || {}) }, cores: { ...(PADRAO.cores || {}), ...(SALVA.cores || {}) } };
}
const corSeg = () => { const c = config(); return { ...SEGMENTOS[c.segmento].cores, ...c.cores }; };
function limparConfig(c) {
  const o = { empresa: {}, cores: {} };
  if (SEGMENTOS[c?.segmento]) o.segmento = c.segmento;
  if (VISUAIS.includes(c?.visual)) o.visual = c.visual;
  for (const k of CAMPOS_EMPRESA) if (typeof c?.empresa?.[k] === "string") o.empresa[k] = c.empresa[k].trim().slice(0, 200);
  if (o.empresa.cnpj) o.empresa.cnpj = o.empresa.cnpj.replace(/\D/g, "").slice(0, 14);
  if (o.empresa.logo && !/^(img|uploads)\/[\w.\-/]+\.(png|jpe?g|webp|svg)$/i.test(o.empresa.logo)) delete o.empresa.logo;
  if (o.empresa.whatsapp) o.empresa.whatsapp = o.empresa.whatsapp.replace(/\D/g, "").slice(0, 15);
  for (const k of CORES) if (/^#[0-9a-f]{6}$/i.test(c?.cores?.[k] || "")) o.cores[k] = c.cores[k];
  return o;
}

// ---- Anúncios ----
// Cada anúncio guarda o segmento dele; o site mostra só os do segmento ativo.
const VERSAO_EXEMPLOS = "2026-11-23b";
let ITENS = JSON.parse((await guardar.ler("itens.json")) || "[]");
const META = JSON.parse((await guardar.ler("meta.json")) || "{}");
async function carregarExemplos(seg) {
  if (process.env.SEM_EXEMPLOS === "1") return;
  META.exemplos ||= {};
  if (META.exemplos[seg] === VERSAO_EXEMPLOS) return;
  const arq = join(PUBLIC, "data", `exemplos-${seg}.json`);
  const exemplos = existsSync(arq) ? JSON.parse(readFileSync(arq, "utf8")).map((e) => ({ ...e, segmento: seg, exemplo: true })) : [];
  const outros = ITENS.filter((i) => !(i.exemplo && i.segmento === seg));
  ITENS = [...outros, ...exemplos.filter((e) => !outros.some((p) => p.segmento === seg && p.codigo === e.codigo))];
  META.exemplos[seg] = VERSAO_EXEMPLOS;
  await salvar("itens.json", ITENS); await salvar("meta.json", META);
  console.log(`Exemplos de ${seg}: ${exemplos.length}.`);
}
await carregarExemplos(config().segmento);
let LEADS = JSON.parse((await guardar.ler("leads.json")) || "[]");

// ---- Login (token assinado, vale 30 dias) ----
const assinar = (v) => createHmac("sha256", SEGREDO).update(v).digest("base64url");
function criarToken() { const exp = String(Date.now() + 30 * 864e5); return `${exp}.${assinar(exp)}`; }
function tokenValido(req) {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  const [exp, sig] = t.split(".");
  if (!exp || !sig || +exp < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(assinar(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}
function senhaConfere(s) {
  if (!SENHA) return false;
  const a = Buffer.from(assinar(String(s || ""))), b = Buffer.from(assinar(SENHA));
  return timingSafeEqual(a, b);
}

// ---- Limite simples contra abuso (por IP) ----
const tentativas = new Map();
function limitado(req, chave, max, janelaMs) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const k = chave + ip, agora = Date.now();
  const l = (tentativas.get(k) || []).filter((t) => agora - t < janelaMs);
  l.push(agora); tentativas.set(k, l);
  return l.length > max;
}

// ---- Utilidades HTTP ----
const TIPOS_MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
function json(res, status, corpo) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(corpo)); }
async function lerCorpo(req, limite = 6 * 1024 * 1024) {
  let tam = 0; const partes = [];
  for await (const p of req) { tam += p.length; if (tam > limite) throw Object.assign(new Error("Arquivo grande demais."), { status: 413 }); partes.push(p); }
  try { return JSON.parse(Buffer.concat(partes).toString("utf8") || "{}"); } catch { throw Object.assign(new Error("Dados inválidos."), { status: 400 }); }
}
async function servirArquivo(res, base, caminho) {
  const arq = normalize(join(base, caminho));
  if (!arq.startsWith(base)) return false;
  try {
    const s = await stat(arq); if (!s.isFile()) return false;
    res.writeHead(200, { "Content-Type": TIPOS_MIME[extname(arq).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    res.end(await readFile(arq)); return true;
  } catch { return false; }
}
const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function paginaHtml(res) {
  const c = config(), seg = SEGMENTOS[c.segmento];
  const titulo = `${c.empresa.nome} | ${seg.descricaoCurta}${c.empresa.cidade ? " em " + c.empresa.cidade : ""}`;
  const html = (await readFile(join(PUBLIC, "index.html"), "utf8"))
    .replaceAll("{{TITULO}}", escHtml(titulo)).replaceAll("{{NOME}}", escHtml(c.empresa.nome))
    .replaceAll("{{DESCRICAO}}", escHtml(`${seg.descricaoCurta}. Fale direto pelo WhatsApp.`)).replaceAll("{{COR}}", escHtml(corSeg().principal || "#1d3557"));
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }); res.end(html);
}

// ---- Ícones do app: gerados com as cores da empresa ----
function iconeSvg() {
  const c = corSeg(), letra = escHtml((config().empresa.marcaCurta || config().empresa.nome || "?").trim()[0]?.toUpperCase() || "?");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="${c.principal}"/><rect x="6" y="30" width="28" height="3" rx="1.5" fill="${c.realce}"/><text x="20" y="26" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="20" fill="${c.principalTexto}">${letra}</text></svg>`;
}
const cachePng = new Map();
function iconePng(size) {
  const c = corSeg(), chave = `${size}${c.principal}${c.realce}`;
  if (cachePng.has(chave)) return cachePng.get(chave);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [fundo, barra, claro] = [c.principal, c.realce, c.principalTexto].map(hex);
  const px = Buffer.alloc(size * size * 3), k = size / 40;
  for (let py = 0; py < size; py++) for (let x0 = 0; x0 < size; x0++) {
    const x = (x0 + .5) / k, y = (py + .5) / k; let cor = fundo;
    if (x >= 6 && x <= 34 && y >= 30 && y <= 33) cor = barra;
    const d = Math.hypot(x - 20, y - 17); if (d <= 8.5 && d >= 5) cor = claro;
    px.set(cor, (py * size + x0) * 3);
  }
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const crcT = Array.from({ length: 256 }, (_, n) => { let x = n; for (let i = 0; i < 8; i++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1; return x >>> 0; });
  const crc = (b) => { let x = 0xffffffff; for (const v of b) x = crcT[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const out = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  cachePng.set(chave, out); return out;
}

// ---- Anúncios: validação ----
const CODIGO_OK = /^[A-Z]{2,3}-\d{1,4}$/;
const doSegmento = () => { const s = config().segmento; return ITENS.filter((i) => (i.segmento || s) === s); };
const existe = (c, seg = config().segmento) => ITENS.some((i) => i.codigo === c && (i.segmento || seg) === seg);
function limpar(it) {
  const o = {};
  for (const [k, v] of Object.entries(it || {})) {
    if (typeof v === "string") o[k] = v.slice(0, k === "descricao" ? 5000 : 300);
    else if (Array.isArray(v)) o[k] = v.slice(0, 40).map((x) => String(x).slice(0, 500));
    else if (typeof v === "number" || typeof v === "boolean" || v === null) o[k] = v;
  }
  o.codigo = String(o.codigo || "").toUpperCase();
  return o;
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  try {
    if (p === "/api/config" && req.method === "GET")
      return json(res, 200, { ...config(), segmentos: Object.values(SEGMENTOS).map((s) => ({ id: s.id, nome: s.nome })) });
    if (p === "/api/itens" && req.method === "GET") {
      const admin = tokenValido(req);
      return json(res, 200, doSegmento().filter((i) => admin || i.status !== "oculto").map((i) => { const c = { ...i }; if (!admin) delete c.responsavel; return c; }));
    }
    if (p === "/api/login" && req.method === "POST") {
      if (limitado(req, "login", 10, 15 * 60e3)) return json(res, 429, { erro: "Muitas tentativas. Espere 15 minutos." });
      const { senha } = await lerCorpo(req, 10e3);
      return senhaConfere(senha) ? json(res, 200, { token: criarToken() }) : json(res, 401, { erro: "Senha incorreta." });
    }
    if (p === "/api/leads" && req.method === "POST") {
      if (limitado(req, "lead", 10, 60 * 60e3)) return json(res, 429, { erro: "Muitos envios. Tente mais tarde ou chame no WhatsApp." });
      const lead = limpar(await lerCorpo(req, 50e3)); delete lead.codigo;
      if (!lead.nome || !lead.whatsapp) return json(res, 400, { erro: "Informe nome e WhatsApp." });
      lead.fotos = (lead.fotos || []).filter((f) => f.startsWith("uploads/"));
      lead.segmento = config().segmento; lead.criado_em = new Date().toISOString();
      LEADS.unshift(lead); LEADS = LEADS.slice(0, 1000); await salvar("leads.json", LEADS);
      return json(res, 201, { ok: true });
    }
    if (p === "/api/fotos" && req.method === "POST") {
      if (!tokenValido(req) && limitado(req, "foto", 20, 60 * 60e3)) return json(res, 429, { erro: "Limite de fotos atingido. Mande o restante pelo WhatsApp." });
      const { dataUrl } = await lerCorpo(req);
      const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || "");
      if (!m) return json(res, 400, { erro: "Envie uma foto JPG, PNG ou WEBP." });
      const nome = `${randomUUID()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
      await guardar.gravar(`uploads/${nome}`, Buffer.from(m[2], "base64"), `image/${m[1]}`);
      return json(res, 201, { url: `uploads/${nome}` });
    }

    // Rotas só do administrador
    if (p.startsWith("/api/")) {
      if (!tokenValido(req)) return json(res, 401, { erro: "Entre com a senha do painel." });
      if (p === "/api/leads" && req.method === "GET") return json(res, 200, LEADS.filter((l) => (l.segmento || config().segmento) === config().segmento));
      if (p === "/api/config" && req.method === "PUT") {
        const nova = limparConfig(await lerCorpo(req, 50e3));
        if (!nova.empresa.nome) return json(res, 400, { erro: "Informe o nome da empresa." });
        if (nova.empresa.cnpj && nova.empresa.cnpj.length !== 14) return json(res, 400, { erro: "O CNPJ precisa ter 14 números." });
        SALVA = { ...SALVA, ...nova }; cachePng.clear();
        await salvar("config.json", SALVA);
        await carregarExemplos(config().segmento);
        return json(res, 200, config());
      }
      if (p === "/api/itens" && req.method === "POST") {
        const it = limpar(await lerCorpo(req, 200e3)); it.segmento = config().segmento;
        if (!CODIGO_OK.test(it.codigo)) return json(res, 400, { erro: "Código inválido. Use o formato AB-01." });
        if (existe(it.codigo)) return json(res, 409, { erro: `Já existe o código ${it.codigo}.` });
        ITENS.unshift(it); await salvar("itens.json", ITENS);
        return json(res, 201, it);
      }
      const m = /^\/api\/itens\/([^/]+)$/.exec(p);
      if (m) {
        const seg = config().segmento, antigo = decodeURIComponent(m[1]).toUpperCase();
        const eh = (i) => i.codigo === antigo && (i.segmento || seg) === seg;
        if (!ITENS.some(eh)) return json(res, 404, { erro: "Anúncio não encontrado." });
        if (req.method === "DELETE") { ITENS = ITENS.filter((i) => !eh(i)); await salvar("itens.json", ITENS); return json(res, 200, { ok: true }); }
        if (req.method === "PUT") {
          const it = limpar(await lerCorpo(req, 200e3)); it.segmento = seg;
          if (!CODIGO_OK.test(it.codigo)) return json(res, 400, { erro: "Código inválido. Use o formato AB-01." });
          if (it.codigo !== antigo && existe(it.codigo)) return json(res, 409, { erro: `Já existe o código ${it.codigo}.` });
          ITENS = ITENS.map((i) => (eh(i) ? it : i)); await salvar("itens.json", ITENS);
          return json(res, 200, it);
        }
      }
      return json(res, 404, { erro: "Rota não encontrada." });
    }

    // Arquivos gerados com os dados da empresa
    if (p === "/manifest.webmanifest") {
      const c = config(), seg = SEGMENTOS[c.segmento];
      res.writeHead(200, { "Content-Type": TIPOS_MIME[".webmanifest"], "Cache-Control": "no-cache" });
      return res.end(JSON.stringify({ name: c.empresa.nome, short_name: c.empresa.marcaCurta || c.empresa.nome, description: seg.descricaoCurta, lang: "pt-BR", start_url: "./#inicio", display: "standalone", background_color: "#f4f5f7", theme_color: corSeg().principal,
        icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] }));
    }
    if (p === "/icon.svg") { res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-cache" }); return res.end(iconeSvg()); }
    const ic = /^\/icon-(192|512)\.png$/.exec(p);
    if (ic) { res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" }); return res.end(iconePng(+ic[1])); }
    if (p === "/" || p === "/index.html") return paginaHtml(res);

    if (p.startsWith("/uploads/")) {
      const nome = p.slice(9);
      const dados = /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(nome) ? await guardar.ler(`uploads/${nome}`) : null;
      if (!dados) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TIPOS_MIME[extname(nome)], "Cache-Control": "public, max-age=31536000, immutable" });
      return res.end(dados);
    }
    if (await servirArquivo(res, PUBLIC, p)) return;
    if (extname(p)) { res.writeHead(404); return res.end(); }
    await paginaHtml(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { erro: e.status ? e.message : "Erro no servidor. Tente de novo." });
  }
});
servidor.listen(PORT, "0.0.0.0", () => console.log(`Site no ar na porta ${PORT} (segmento: ${config().segmento})`));
