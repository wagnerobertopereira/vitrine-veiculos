/* Vitrine de vendas multi-segmento (sem frameworks, sem etapa de build).
   O mesmo código serve para veículos, imóveis ou qualquer outro ramo:
   - config.json (ou o painel > Empresa): nome, CNPJ, WhatsApp, cores e o segmento.
   - segmentos/<id>.json: o que se vende (tipos, campos da ficha, filtros, textos).
   Funciona em dois modos:
   - "api": quando o servidor (server.js) está rodando, os dados vêm do bucket.
   - "local": demonstração; dados de data/exemplos-<segmento>.json e alterações salvas só no navegador. */

// ====== Utilidades ======
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => (n || n === 0) && n !== "" ? Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "Consulte";
const num = (n, d = 0) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: d });
const vazio = (v) => v === undefined || v === null || v === "";
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const slugTxt = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const DEMO = new URLSearchParams(location.search).has("demo");
const CH = (k) => `vitrine_${DEMO ? "demo_" : ""}${k}`;
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function formatarCnpj(c) {
  const d = String(c || "").replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d;
}
function cnpjValido(c) {
  const d = String(c || "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dig = (n) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dig(12) === +d[12] && dig(13) === +d[13];
}

// ====== Configuração (empresa + segmento) ======
let CFG = { empresa: {}, cores: {}, segmento: "" }, SEG = null, E = {};
let SEGMENTOS_DISP = [{ id: "veiculos", nome: "Carros e motos" }, { id: "imoveis", nome: "Imóveis" }];
const T = (k) => SEG?.textos?.[k] || "";
const ITEM = () => SEG.item.singular, ITENS = () => SEG.item.plural;
const tipoNome = (t) => SEG.tipos[t]?.nome || cap(ITEM());
const aplica = (c, tipo) => !c.tipos || !tipo || c.tipos.includes(tipo);
const comunsExtras = (tipo) => { const c = SEG.extras?.comuns || []; return Array.isArray(c) ? c : (tipo ? c[tipo] || [] : [...new Set(Object.values(c).flat())]); };
function zapLink(msg) { return `https://wa.me/${String(E.whatsapp || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`; }
const preencher = (tpl, it) => String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => it[k] ?? "");
function zapItem(it) { return zapLink(`Olá! Vi o ${ITEM()} [${it.codigo}] ${it.titulo} no site da ${E.nome} e gostaria de mais informações.`); }
function aplicarTema() {
  const c = { ...SEG.cores, ...CFG.cores };
  const neutros = { fundo: "--bg", fundo2: "--surface-2", linha: "--line", texto: "--fg", textoSuave: "--muted" };
  const css = `--mata:${c.principal};--mata-fg:${c.principalTexto};--terra:${c.destaque};--terra-fg:${c.destaqueTexto};--ouro:${c.realce};` +
    Object.entries(neutros).filter(([k]) => c[k]).map(([k, v]) => `${v}:${c[k]};`).join("");
  const fonte = `--display:"${SEG.fonteTitulo || "Inter"}", system-ui, sans-serif;`;
  let st = $("#tema"); if (!st) { st = document.createElement("style"); st.id = "tema"; document.head.appendChild(st); }
  // Cores da empresa no modo claro; o modo escuro mantém a paleta de contraste do styles.css
  const garagem = CFG.visual === "garagem";
  document.documentElement.dataset.visual = garagem ? "garagem" : "classico";
  if (garagem) {
    // Visual "Garagem": sempre escuro, com a cor de destaque da marca em evidência
    const g = `--bg:#0d0e10;--surface:#16181b;--surface-2:#202328;--fg:#f2f2f0;--muted:#a3a7ad;--line:#2c3036;--mata:${c.destaque};--mata-fg:${c.destaqueTexto};--terra:${c.destaque};--terra-fg:${c.destaqueTexto};--ouro:${c.realce};--display:"Archivo", "Inter", system-ui, sans-serif;color-scheme:dark;`;
    st.textContent = `:root,:root[data-theme]{${g}}`;
  } else st.textContent = `:root{${fonte}} @media (prefers-color-scheme: light){:root:not([data-theme="dark"]){${css}}} :root[data-theme="light"]{${css}}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", garagem ? "#0d0e10" : c.principal);
}

// ====== Formatação dos campos da ficha ======
function area(m2) { if (!m2) return "—"; return m2 >= 10000 ? `${num(m2 / 10000, 2)} ha` : `${num(m2)} m²`; }
function formatar(c, v, curto) {
  if (vazio(v)) return "";
  if (c.tipo === "bool") return v ? (curto ? c.rotulo : "Sim") : "Não";
  if (c.tipo === "select") return c.opcoes?.[v] || v;
  switch (c.formato) {
    case "km": return `${num(v)} km`;
    case "kmdec": return +v === 0 ? "No asfalto" : `${num(v, 1)} km`;
    case "cc": return `${num(v)} cc`;
    case "area": return curto ? area(v) : `${num(v)} m²${v >= 10000 ? ` · ${num(v / 10000, 2)} ha` : ""}`;
    case "m2": return `${num(v)} m²`;
    case "m": return `${num(v, 2)} m`;
    case "quartos": return `${v} quarto${v > 1 ? "s" : ""}`;
    default: return String(v);
  }
}

// ====== Ícones ======
const sv = (d, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  zap: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3Z"/></svg>',
  pin: sv('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', 2),
  carro: sv('<path d="M3 16v-3.5l2-5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5l2 5V16a1 1 0 0 1-1 1h-1M5 17H4a1 1 0 0 1-1-1M3.5 12h17"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/>'),
  moto: sv('<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 10h5l4.5 6.5M14 10l-2-4h-2.5M15 6h3l-1.5 4M9 10l2.5 6.5h-6"/>'),
  casa: sv('<path d="M3 11l9-7 9 7M5 10v11h14V10M10 21v-6h4v6"/>'),
  predio: sv('<path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M8.5 7h3M8.5 11h3M8.5 15h3"/>'),
  terreno: sv('<path d="M3 17l5-6 4 4 3-3 6 5M3 21h18M5 21v-3M9 21v-3M13 21v-3M17 21v-3"/>'),
  chacara: sv('<path d="M7 21v-5M7 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8ZM13 21v-7l4.5-4 4.5 4v7M2 21h20"/>'),
  item: sv('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  op: sv('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7"/>', 2.4),
  left: sv('<path d="M15 5l-7 7 7 7"/>', 2.2),
  right: sv('<path d="M9 5l7 7-7 7"/>', 2.2),
  menu: sv('<path d="M4 7h16M4 12h16M4 17h16"/>', 2),
  ok: sv('<circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6"/>', 2),
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="32" height="32" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>',
};
I.zap = I.zap.replace("1.7.7", "1.7.7");
const icone = (tipo) => I[SEG.tipos[tipo]?.icone] || I.item;
function LOGO() {
  const letra = esc(((E.marcaCurta || E.nome || "?").trim()[0] || "?").toUpperCase());
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="9" fill="var(--mata)"/><rect x="6" y="30" width="28" height="3" rx="1.5" fill="var(--ouro)"/><text x="20" y="26" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="20" fill="var(--mata-fg)">${letra}</text></svg>`;
}
const marca = () => E.logo ? `<a class="brand brand-img" href="#inicio"><img src="${esc(E.logo)}" alt="${esc(E.nome)}"></a>` : `<a class="brand" href="#inicio">${LOGO()}<span><b>${esc(E.marcaCurta || E.nome)}</b><small>${esc(E.marcaLinha || SEG.descricaoCurta)}</small></span></a>`;

// ====== Rotas do catálogo, montadas a partir dos tipos do segmento ======
function rotasCatalogo() {
  const r = { todos: ["", false, `Todos os ${ITENS()}`] };
  for (const [k, t] of Object.entries(SEG.tipos)) r[slugTxt(t.plural)] = [k, false, t.plural];
  if (SEG.oportunidade) r[slugTxt(SEG.oportunidade.rotulo)] = ["", true, SEG.oportunidade.rotulo];
  return r;
}
const rotaTipo = (k) => slugTxt(SEG.tipos[k].plural);
const rotaOp = () => slugTxt(SEG.oportunidade?.rotulo || "ofertas");
const slug = (codigo) => "item-" + String(codigo).toLowerCase();

// ====== Dados ======
const DB = {
  modo: "local", itens: [], token: store.get("vitrine_token", null),
  async carregarConfig() {
    let c = null;
    if (!DEMO) try {
      const r = await fetch("api/config", { headers: { Accept: "application/json" } });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) { c = await r.json(); this.modo = "api"; if (c.segmentos) SEGMENTOS_DISP = c.segmentos; }
    } catch { /* sem servidor */ }
    if (!c) {
      const base = await (await fetch("config.json")).json(), salva = store.get(CH("config"), {});
      c = { segmento: salva.segmento || base.segmento, visual: salva.visual || base.visual || "classico", empresa: { ...base.empresa, ...(salva.empresa || {}) }, cores: { ...(base.cores || {}), ...(salva.cores || {}) } };
    }
    CFG = c; E = c.empresa;
    SEG = await (await fetch(`segmentos/${encodeURIComponent(c.segmento)}.json`)).json();
    aplicarTema();
  },
  async carregar() {
    if (this.modo === "api") try {
      const r = await fetch("api/itens", { headers: { Accept: "application/json", ...(this.token ? { Authorization: "Bearer " + this.token } : {}) } });
      if (r.ok) { this.itens = await r.json(); return; }
    } catch { /* cai para o modo local */ }
    const salvos = store.get(CH("itens_" + SEG.id), null);
    if (salvos) { this.itens = salvos; return; }
    try { this.itens = await (await fetch(`data/exemplos-${SEG.id}.json`)).json(); } catch { this.itens = []; }
  },
  publicos() { return this.itens.filter((i) => i.status !== "oculto"); },
  porCodigo(c) { return this.itens.find((i) => i.codigo.toLowerCase() === String(c).toLowerCase()); },
  async api(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: "Bearer " + this.token } : {}), ...(opts.headers || {}) } });
    if (r.status === 401) { this.token = null; store.set("vitrine_token", null); throw new Error("Sessão expirada. Entre novamente."); }
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || "Não foi possível salvar. Tente de novo.");
    return r.json();
  },
  guardarLocal() { if (!store.set(CH("itens_" + SEG.id), this.itens)) toast("Fotos muito grandes para salvar no navegador. No site publicado elas vão para o servidor."); },
  async salvar(it, codigoOriginal) {
    if (this.modo === "api") {
      const salvo = await this.api(codigoOriginal ? `api/itens/${encodeURIComponent(codigoOriginal)}` : "api/itens", { method: codigoOriginal ? "PUT" : "POST", body: JSON.stringify(it) });
      const i = this.itens.findIndex((x) => x.codigo === (codigoOriginal || salvo.codigo));
      if (i >= 0) this.itens[i] = salvo; else this.itens.unshift(salvo);
      return salvo;
    }
    const i = this.itens.findIndex((x) => x.codigo === codigoOriginal);
    if (i >= 0) this.itens[i] = it; else this.itens.unshift(it);
    this.guardarLocal(); return it;
  },
  async excluir(codigo) {
    if (this.modo === "api") await this.api(`api/itens/${encodeURIComponent(codigo)}`, { method: "DELETE" });
    this.itens = this.itens.filter((x) => x.codigo !== codigo);
    if (this.modo === "local") this.guardarLocal();
  },
  async enviarLead(lead) {
    lead.criado_em = new Date().toISOString();
    if (this.modo === "api") return this.api("api/leads", { method: "POST", body: JSON.stringify(lead) });
    const l = store.get(CH("leads"), []); l.unshift(lead); store.set(CH("leads"), l); return lead;
  },
  async leads() { return this.modo === "api" ? this.api("api/leads") : store.get(CH("leads"), []); },
  async salvarConfig(nova) {
    if (this.modo === "api") return this.api("api/config", { method: "PUT", body: JSON.stringify(nova) });
    store.set(CH("config"), nova); return nova;
  },
  async login(senha) { const r = await this.api("api/login", { method: "POST", body: JSON.stringify({ senha }) }); this.token = r.token; store.set("vitrine_token", r.token); await this.carregar(); },
  async subirFoto(dataUrl) { return this.modo === "api" ? (await this.api("api/fotos", { method: "POST", body: JSON.stringify({ dataUrl }) })).url : dataUrl; },
  proximoCodigo(tipo, oportunidade) {
    const pre = oportunidade && SEG.oportunidade?.prefixo ? SEG.oportunidade.prefixo : SEG.tipos[tipo]?.prefixo || "IT";
    const n = this.itens.filter((i) => i.codigo.startsWith(pre + "-")).map((i) => parseInt(i.codigo.split("-")[1], 10) || 0);
    return `${pre}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(2, "0")}`;
  },
};

// Reduz a foto antes de enviar (máx. 1600 px, JPEG)
function lerFoto(file, max = 1600) {
  return new Promise((res, rej) => {
    const fr = new FileReader(); fr.onerror = rej;
    fr.onload = () => {
      const img = new Image(); img.onerror = rej;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// ====== Componentes ======
const fotoPadrao = () => SEG.imagemPadrao || SEG.heroImagem;
const local = (it) => `${esc(it.cidade || E.cidade || "")}${SEG.usaBairro && it.bairro ? " · " + esc(it.bairro) : ""}`;
function card(it) {
  const foto = it.fotos?.[0] || fotoPadrao();
  const specs = SEG.campos.filter((c) => c.card && aplica(c, it.tipo)).map((c) => formatar(c, it[c.k], true)).filter(Boolean).slice(0, 4);
  return `<a class="card" href="#${slug(it.codigo)}">
    <div class="ph"><img src="${esc(foto)}" alt="${esc(it.titulo)}" loading="lazy">
      <div class="badges"><span class="badge">${esc(tipoNome(it.tipo))}</span>${it.oportunidade ? `<span class="badge op">${esc(SEG.oportunidade?.rotulo?.replace(/s$/, "") || "Oferta")}</span>` : ""}${it.status === "reservado" ? '<span class="badge res">Reservado</span>' : ""}${it.status === "vendido" ? '<span class="badge vend">Vendido</span>' : ""}</div>
      <span class="code">${esc(it.codigo)}</span></div>
    <div class="body">
      ${local(it) ? `<span class="loc">${I.pin}${local(it)}</span>` : ""}
      <h3>${esc(it.titulo)}</h3>
      <div class="specs">${specs.map((s) => `<span>${esc(s)}</span>`).join("")}</div>
      <div class="price"><b>${brl(it.preco)}</b>${it.preco_anterior ? `<s>${brl(it.preco_anterior)}</s>` : ""}</div>
    </div></a>`;
}

function header(rota) {
  const on = (r) => (rota === r ? ' class="on"' : "");
  const demo = DEMO && rota !== "admin" ? `<div style="background:var(--terra);color:var(--terra-fg);text-align:center;font-size:14px;padding:8px 16px">Versão de demonstração. <a href="#admin" style="color:inherit;font-weight:600;text-decoration:underline">Teste o painel: cadastre ${esc(ITENS())} e troque nome, CNPJ e segmento →</a></div>` : "";
  return `${demo}<header class="topbar"><div class="wrap">
    ${marca()}
    <nav class="nav" id="nav">
      <a href="#inicio"${on("inicio")}>Início</a>
      ${Object.keys(SEG.tipos).map((k) => `<a href="#${rotaTipo(k)}"${on(rotaTipo(k))}>${esc(SEG.tipos[k].plural)}</a>`).join("")}
      ${SEG.oportunidade ? `<a href="#${rotaOp()}"${on(rotaOp())}>${esc(SEG.oportunidade.rotulo)}</a>` : ""}
      <a href="#anuncie"${on("anuncie")}>${esc(T("navAnuncie") || "Anuncie")}</a>
    </nav>
    <a class="btn btn-zap btn-sm" href="${zapLink(`Olá! Gostaria de mais informações sobre os ${ITENS()} da ${E.nome}.`)}" target="_blank" rel="noopener">${I.zap}WhatsApp</a>
    <button class="menu-btn" id="menuBtn" aria-label="Abrir menu" aria-expanded="false">${I.menu}</button>
  </div></header>`;
}

function footer() {
  const legal = [E.razaoSocial, E.cnpj && `CNPJ ${formatarCnpj(E.cnpj)}`, E.registro].filter(Boolean).map(esc).join(" · ");
  return `<footer><div class="wrap">
    <div class="cols">
      <div style="display:grid;gap:12px">${marca()}
        <p style="max-width:40ch;font-size:.92rem">${esc(T("rodape"))}</p></div>
      <div><h4>${esc(cap(ITENS()))}</h4>${Object.keys(SEG.tipos).map((k) => `<a href="#${rotaTipo(k)}">${esc(SEG.tipos[k].plural)}</a>`).join("")}${SEG.oportunidade ? `<a href="#${rotaOp()}">${esc(SEG.oportunidade.rotulo)}</a>` : ""}</div>
      <div><h4>Contato</h4><a href="${zapLink(`Olá! Vim pelo site da ${E.nome}.`)}" target="_blank" rel="noopener">WhatsApp ${esc(E.whatsappExibicao)}</a>${[E.email, E.endereco, [E.cidade, E.uf].filter(Boolean).join(" - "), E.horario].filter(Boolean).map((x) => `<span style="display:block;padding:3px 0">${esc(x)}</span>`).join("")}<a href="#anuncie">${esc(T("anuncieTitulo"))}</a></div>
    </div>
    <div class="legal"><span>© ${new Date().getFullYear()} ${esc(E.nome)}${legal ? " · " + legal : ""}</span><a href="#admin" style="display:inline;padding:0">Área do administrador</a></div>
  </div></footer>`;
}

// Campo de filtro genérico (usado na busca rápida e no catálogo)
function opcoesFiltro(c) {
  if (c.filtroOpcoes) return c.filtroOpcoes.map(([v, t]) => [String(v), t]);
  if (c.opcoes) return Object.entries(c.opcoes);
  return [...new Set(DB.publicos().map((i) => i[c.k]).filter((v) => !vazio(v)))].sort().map((v) => [String(v), String(v)]);
}
function campoFiltro(c, id, valor) {
  if (c.filtro === "check") return `<label class="check"><input type="checkbox" id="${id}" data-fk="${c.k}" ${valor ? "checked" : ""}> ${esc(c.rotulo)}</label>`;
  const ops = opcoesFiltro(c); if (!ops.length) return "";
  return `<div class="field"><label for="${id}">${esc(c.filtroRotulo || c.rotulo)}</label><select class="input" id="${id}" data-fk="${c.k}"><option value="">${c.filtro === "select" ? "Todos" : "Qualquer"}</option>${ops.map(([v, t]) => `<option value="${esc(v)}" ${String(valor ?? "") === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
}

// ====== Páginas ======
function paginaInicioGaragem() {
  const pub = DB.publicos().filter((i) => i.status !== "vendido");
  const destaques = pub.filter((i) => i.destaque).slice(0, 7);
  const comFoto = (i) => i.fotos?.[0] && !/\.svg$/i.test(i.fotos[0]);
  const capa = destaques.find((i) => i.capa && comFoto(i)) || destaques.find(comFoto);
  const fundo = capa ? capa.fotos[0] : SEG.heroImagem;
  const cont = (f) => pub.filter(f).length;
  const marcas = [...new Set(pub.map((i) => i.marca).filter(Boolean))].sort((x, y) => cont((i) => i.marca === y) - cont((i) => i.marca === x));
  const rapidos = (SEG.buscaRapida || []).map((k) => SEG.campos.find((c) => c.k === k)).filter(Boolean).slice(0, 2);
  const pontos = T("infoPontos") || [];
  const [prim, ...resto] = destaques;
  return `
  <section class="g-hero">
    <img class="g-hero-bg" src="${esc(fundo)}" alt="">
    <div class="wrap">
      <div class="g-hero-txt">
        <span class="g-tag">${esc(T("heroEyebrow"))}${E.cidade ? " · " + esc(E.cidade) : ""}</span>
        <h1>${esc(T("heroTitulo"))}</h1>
        <p class="lead">${esc(T("heroLead"))}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-terra" href="#todos">Ver estoque completo</a><a class="btn g-btn-line" href="#anuncie">${esc(T("parceiroBotao") || "Avaliar meu veículo")}</a></div>
      </div>
      ${capa ? `<a class="g-capa" href="#${slug(capa.codigo)}"><span>Destaque da semana</span><b>${esc(capa.titulo)}</b><em>${brl(capa.preco)}</em></a>` : ""}
    </div>
  </section>
  <div class="wrap"><form class="quick g-quick" id="buscaRapida">
    <div class="field"><label for="qTipo">Tipo</label><select class="input" id="qTipo"><option value="">Todos</option>${Object.entries(SEG.tipos).map(([k, t]) => `<option value="${k}">${esc(t.plural)}</option>`).join("")}</select></div>
    ${rapidos.map((c) => campoFiltro(c, "q_" + c.k, "")).join("")}
    <div class="field"><label for="qPreco">Até</label><select class="input" id="qPreco"><option value="">Qualquer valor</option>${(SEG.faixasPreco || []).map((v) => `<option value="${v}">${brl(v)}</option>`).join("")}</select></div>
    <button class="btn btn-terra" type="submit" style="align-self:end">Buscar</button>
  </form></div>

  <section class="section"><div class="wrap">
    <div class="g-nums">
      ${Object.entries(SEG.tipos).map(([k, t]) => `<a href="#${rotaTipo(k)}"><b>${cont((i) => i.tipo === k)}</b><span>${esc(t.plural)} no estoque</span></a>`).join("")}
      ${SEG.oportunidade ? `<a href="#${rotaOp()}"><b>${cont((i) => i.oportunidade)}</b><span>${esc(SEG.oportunidade.rotulo)} · ${esc(SEG.oportunidade.texto)}</span></a>` : ""}
    </div>
    ${marcas.length ? `<div class="g-marcas" aria-label="Marcas no estoque">${marcas.map((m) => `<button type="button" data-marca="${esc(m)}">${esc(m)}</button>`).join("")}</div>` : ""}
  </div></section>

  <section class="section" style="padding-top:0"><div class="wrap">
    <div class="section-head"><div><span class="eyebrow">Selecionados</span><h2>Destaques do estoque</h2></div><a class="btn btn-ghost" href="#todos">Todos os ${pub.length} ${esc(ITENS())} →</a></div>
    ${prim ? `<div class="g-vitrine">${card(prim).replace('class="card"', 'class="card g-grande"')}${resto.map(card).join("")}</div>` : `<p class="muted">Nenhum ${esc(ITEM())} em destaque ainda.</p>`}
  </div></section>

  ${T("infoTitulo") ? `<section class="section g-faixa"><div class="wrap">
    <div style="display:grid;gap:12px;max-width:62ch"><span class="eyebrow">${esc(T("infoEyebrow"))}</span><h2>${esc(T("infoTitulo"))}</h2><p>${esc(T("infoTexto"))}</p></div>
    <ol class="g-passos">${pontos.map(([b, t]) => `<li><b>${esc(b)}</b><span>${esc(t)}</span></li>`).join("")}</ol>
  </div></section>` : ""}

  <section class="section"><div class="wrap">
    <div class="g-troca">
      <div style="display:grid;gap:12px"><span class="eyebrow">${esc(T("parceiroEyebrow"))}</span><h2>${esc(T("parceiroTitulo"))}</h2><p>${esc(T("parceiroTexto"))}</p></div>
      <ul>${(T("parceiroBeneficios") || []).map((x) => `<li>${I.check}<span>${esc(x)}</span></li>`).join("")}</ul>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn g-btn-escuro" href="#anuncie">${esc(T("parceiroBotao"))}</a><a class="btn g-btn-escuro-line" href="${zapLink(`Olá! Quero avaliar meu veículo com a ${E.nome}.`)}" target="_blank" rel="noopener">Falar no WhatsApp</a></div>
    </div>
  </div></section>`;
}

function paginaInicio() {
  if (CFG.visual === "garagem") return paginaInicioGaragem();
  const destaques = DB.publicos().filter((i) => i.destaque && i.status !== "vendido").slice(0, 6);
  const cont = (f) => DB.publicos().filter((i) => i.status !== "vendido" && f(i)).length;
  const rapidos = (SEG.buscaRapida || []).map((k) => SEG.campos.find((c) => c.k === k)).filter(Boolean).slice(0, 2);
  const pontos = T("infoPontos") || [];
  return `
  <section class="hero">
    <img class="hero-bg" src="${esc(SEG.heroImagem)}" alt="">
    <div class="wrap">
      <div style="display:grid;gap:14px">
        <span class="eyebrow">${esc(T("heroEyebrow"))}${E.cidade ? " · " + esc(E.cidade) : ""}</span>
        <h1>${esc(T("heroTitulo"))}</h1>
        <p class="lead">${esc(T("heroLead"))}</p>
      </div>
      <div class="cats">
        ${Object.entries(SEG.tipos).map(([k, t]) => `<a class="cat" href="#${rotaTipo(k)}">${icone(k)}<b>${esc(t.plural)}</b><span>${cont((i) => i.tipo === k)} disponíveis</span></a>`).join("")}
        ${SEG.oportunidade ? `<a class="cat op" href="#${rotaOp()}">${I.op}<b>${esc(SEG.oportunidade.rotulo)}</b><span>${esc(SEG.oportunidade.texto)}</span></a>` : ""}
      </div>
      <form class="quick" id="buscaRapida">
        <div class="field"><label for="qTipo">Tipo</label><select class="input" id="qTipo"><option value="">Todos</option>${Object.entries(SEG.tipos).map(([k, t]) => `<option value="${k}">${esc(t.plural)}</option>`).join("")}</select></div>
        ${rapidos.map((c) => campoFiltro(c, "q_" + c.k, "")).join("")}
        <div class="field"><label for="qPreco">Até</label><select class="input" id="qPreco"><option value="">Qualquer valor</option>${(SEG.faixasPreco || []).map((v) => `<option value="${v}">${brl(v)}</option>`).join("")}</select></div>
        <button class="btn btn-terra" type="submit" style="align-self:end">Buscar ${esc(ITENS())}</button>
      </form>
    </div>
  </section>

  <section class="section"><div class="wrap">
    <div class="section-head"><div><span class="eyebrow">Selecionados</span><h2>${esc(cap(ITENS()))} em destaque</h2></div><a class="btn btn-ghost" href="#todos">Ver todos os ${DB.publicos().length} ${esc(ITENS())}</a></div>
    <div class="grid">${destaques.map(card).join("") || `<p class="muted">Nenhum ${esc(ITEM())} em destaque ainda.</p>`}</div>
  </div></section>

  ${T("infoTitulo") ? `<section class="section natureza"><div class="wrap">
    <div class="natureza-top" style="margin-bottom:0">
      <div style="display:grid;gap:14px"><span class="eyebrow">${esc(T("infoEyebrow"))}</span><h2>${esc(T("infoTitulo"))}</h2><p>${esc(T("infoTexto"))}</p></div>
      <div class="pontos">${pontos.map(([b, s]) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join("")}</div>
    </div>
  </div></section>` : ""}

  <section class="section"><div class="wrap">
    <div class="parceiro">
      <div style="display:grid;gap:14px">
        <span class="eyebrow">${esc(T("parceiroEyebrow"))}</span>
        <h2>${esc(T("parceiroTitulo"))}</h2>
        <p class="muted">${esc(T("parceiroTexto"))}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-terra" href="#anuncie">${esc(T("parceiroBotao"))}</a><a class="btn btn-ghost" href="${zapLink(`Olá! Quero ser parceiro(a) da ${E.nome}.`)}" target="_blank" rel="noopener">Quero ser parceiro</a></div>
      </div>
      <ul>${(T("parceiroBeneficios") || []).map((b) => `<li>${I.check}<span>${esc(b)}</span></li>`).join("")}</ul>
    </div>
  </div></section>`;
}

// Estado dos filtros (não vai no endereço)
const F = { tipo: "", oportunidade: false, cidade: "", precoMin: "", precoMax: "", busca: "", ordem: "destaque", c: {} };
function resetF() { Object.assign(F, { tipo: "", oportunidade: false, cidade: "", precoMin: "", precoMax: "", busca: "", ordem: "destaque", c: {} }); }
function passaCampo(it, c, v) {
  if (vazio(v) || v === false) return true;
  if (!aplica(c, it.tipo)) return false;
  const x = it[c.k];
  if (c.filtro === "check") return !!x;
  if (c.filtro === "min") return !vazio(x) && +x >= +v;
  if (c.filtro === "max") return !vazio(x) && +x <= +v;
  return String(x ?? "") === String(v);
}
function filtrar() {
  const l = DB.publicos().filter((i) =>
    (!F.tipo || i.tipo === F.tipo) && (!F.oportunidade || i.oportunidade) && (!F.cidade || i.cidade === F.cidade) &&
    (!F.precoMin || (i.preco || 0) >= +F.precoMin) && (!F.precoMax || (i.preco || 0) <= +F.precoMax) &&
    SEG.campos.every((c) => passaCampo(i, c, F.c[c.k])) && (SEG.condicoes || []).every((c) => !F.c[c.k] || i[c.k]) &&
    (!F.busca || [i.codigo, i.titulo, i.bairro, i.cidade, ...SEG.campos.filter((c) => c.tipo === "texto").map((c) => i[c.k])].join(" ").toLowerCase().includes(F.busca.toLowerCase())));
  const ordens = ordensDisp();
  return l.sort(ordens[F.ordem]?.[1] || ordens.destaque[1]);
}
function ordensDisp() {
  const st = (i) => (i.status === "vendido" ? 2 : i.status === "reservado" ? 1 : 0);
  const o = { destaque: ["Destaques primeiro", (a, b) => st(a) - st(b) || (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0)], menor: ["Menor preço", (a, b) => (a.preco || 0) - (b.preco || 0)], maior: ["Maior preço", (a, b) => (b.preco || 0) - (a.preco || 0)] };
  for (const c of SEG.campos) if (c.ordem) o[c.k] = [c.ordem.rotulo, (a, b) => ((+a[c.k] || 0) - (+b[c.k] || 0)) * c.ordem.dir || st(a) - st(b)];
  return o;
}
function paginaCatalogo(titulo) {
  const cidades = [...new Set(DB.publicos().map((i) => i.cidade).filter(Boolean))].sort();
  const chip = (v, t) => `<button type="button" class="chip${F.tipo === v ? " on" : ""}" data-tipo="${v}">${esc(t)}</button>`;
  const campos = SEG.campos.filter((c) => c.filtro && aplica(c, F.tipo));
  return `<section class="section" style="padding-top:36px"><div class="wrap">
    <div class="section-head"><div><span class="eyebrow">Estoque</span><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${esc(titulo)}</h1></div></div>
    <div class="catalogo">
      <aside class="filtros${innerWidth < 900 ? " closed" : ""}" id="filtros">
        <div class="filtros-head"><h3>Filtros</h3><button class="btn btn-ghost btn-sm" type="button" id="toggleFiltros">${innerWidth < 900 ? "Mostrar" : "Limpar"}</button></div>
        <div class="field"><label>Tipo</label><div class="chips">${chip("", "Todos")}${Object.entries(SEG.tipos).map(([k, t]) => chip(k, t.plural)).join("")}</div></div>
        ${SEG.oportunidade ? `<label class="check"><input type="checkbox" id="fOp" ${F.oportunidade ? "checked" : ""}> Só ${esc(SEG.oportunidade.rotulo.toLowerCase())}</label>` : ""}
        <div class="field"><label for="fBusca">Código ou palavra</label><input class="input" id="fBusca" placeholder="Código ou palavra-chave" value="${esc(F.busca)}"></div>
        ${cidades.length > 1 ? `<div class="field"><label for="fCidade">Cidade</label><select class="input" id="fCidade"><option value="">Todas</option>${cidades.map((c) => `<option ${F.cidade === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>` : ""}
        <div class="field"><label>Preço (R$)</label><div class="row2"><input class="input" id="fPMin" inputmode="numeric" placeholder="Mín." value="${esc(F.precoMin)}"><input class="input" id="fPMax" inputmode="numeric" placeholder="Máx." value="${esc(F.precoMax)}"></div></div>
        ${campos.filter((c) => c.filtro !== "check").map((c) => campoFiltro(c, "f_" + c.k, F.c[c.k])).join("")}
        ${campos.filter((c) => c.filtro === "check").map((c) => campoFiltro(c, "f_" + c.k, F.c[c.k])).join("")}
        ${(SEG.condicoes || []).map((c) => `<label class="check"><input type="checkbox" data-cond="${c.k}" ${F.c[c.k] ? "checked" : ""}> ${esc(c.rotulo)}</label>`).join("")}
      </aside>
      <div style="min-width:0">
        <div class="toolbar"><span class="muted" id="contagem"></span>
          <select class="input" id="fOrdem" aria-label="Ordenar">${Object.entries(ordensDisp()).map(([k, [t]]) => `<option value="${k}" ${F.ordem === k ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="grid" id="lista"></div>
      </div>
    </div>
  </div></section>`;
}
function atualizarLista() {
  const l = filtrar(); const n = l.length;
  $("#contagem").textContent = `${n} ${n === 1 ? ITEM() + " encontrado" : ITENS() + " encontrados"}`;
  $("#lista").innerHTML = l.map(card).join("") || `<div class="vazio" style="grid-column:1/-1"><h3>Nenhum ${esc(ITEM())} com esses filtros</h3><p class="muted">Tente ampliar a faixa de preço ou fale com a gente: chegam ${esc(ITENS())} novos toda semana.</p><a class="btn btn-zap" href="${zapLink(`Olá! Procuro um ${ITEM()} e não encontrei no site. Podem me ajudar?`)}" target="_blank" rel="noopener">${I.zap}Pedir pelo WhatsApp</a></div>`;
}
function ligarCatalogo() {
  const f = $("#filtros");
  const ler = () => {
    F.oportunidade = !!$("#fOp")?.checked; F.busca = $("#fBusca").value.trim(); F.cidade = $("#fCidade")?.value || "";
    F.precoMin = $("#fPMin").value.replace(/\D/g, ""); F.precoMax = $("#fPMax").value.replace(/\D/g, ""); F.ordem = $("#fOrdem").value;
    f.querySelectorAll("[data-fk]").forEach((el) => { F.c[el.dataset.fk] = el.type === "checkbox" ? el.checked : el.value; });
    f.querySelectorAll("[data-cond]").forEach((el) => { F.c[el.dataset.cond] = el.checked; });
    atualizarLista();
  };
  f.addEventListener("input", ler); f.addEventListener("change", ler); $("#fOrdem").addEventListener("change", ler);
  f.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tipo]");
    if (b) { F.tipo = b.dataset.tipo; const aberto = !f.classList.contains("closed"); render(); if (aberto && innerWidth < 900) { $("#filtros").classList.remove("closed"); $("#toggleFiltros").textContent = "Esconder"; } }
  });
  $("#toggleFiltros").addEventListener("click", (e) => {
    if (innerWidth < 900) { const c = f.classList.toggle("closed"); e.target.textContent = c ? "Mostrar" : "Esconder"; }
    else { resetF(); render(); }
  });
  atualizarLista();
}

function mapaSVG() {
  return `<svg viewBox="0 0 800 350" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect width="800" height="350" fill="var(--surface-2)"/>
    ${[60, 110, 160, 210, 260].map((r, k) => `<ellipse cx="${250 + k * 20}" cy="${150 + k * 8}" rx="${r * 1.6}" ry="${r * .7}" fill="none" stroke="var(--line)" stroke-width="1.5"/>`).join("")}
    <path d="M0 260 C 150 230, 260 300, 400 250 S 650 190, 800 230" fill="none" stroke="var(--muted)" stroke-width="4" opacity=".45"/>
    <circle cx="460" cy="160" r="70" fill="var(--terra)" opacity=".18"/><circle cx="460" cy="160" r="70" fill="none" stroke="var(--terra)" stroke-width="2" stroke-dasharray="6 6"/>
    <circle cx="460" cy="160" r="7" fill="var(--terra)"/>
  </svg>`;
}
function paginaItem(codigo) {
  const it = DB.porCodigo(codigo);
  if (!it) return `<section class="section"><div class="wrap vazio"><h2>${esc(cap(ITEM()))} não encontrado</h2><p class="muted">Ele pode ter sido vendido ou retirado do site.</p><a class="btn btn-primary" href="#todos">Ver ${esc(ITENS())} disponíveis</a></div></section>`;
  const fotos = it.fotos?.length ? it.fotos : [fotoPadrao()];
  const ficha = [["Código", it.codigo], ["Tipo", tipoNome(it.tipo)],
    ...SEG.campos.filter((c) => aplica(c, it.tipo) && !vazio(it[c.k])).map((c) => [c.rotulo.replace(/ \((m|mínimo)\)$/, ""), formatar(c, it[c.k])])];
  const extras = it[SEG.extras?.k] || [];
  const mostraMapa = SEG.mostrarMapa && !vazio(it.lat) && !vazio(it.lng);
  const parecidos = DB.publicos().filter((i) => i.codigo !== it.codigo && i.tipo === it.tipo && i.status !== "vendido").slice(0, 3);
  return `<section class="section" style="padding-top:24px"><div class="wrap">
    <a class="voltar" href="#todos">${I.left.replace("<svg", '<svg width="16" height="16"')}Voltar para o estoque</a>
    <div class="galeria">
      <div class="main"><img id="fotoMain" src="${esc(fotos[0])}" alt="${esc(it.titulo)}">
        ${fotos.length > 1 ? `<button class="nav-foto prev" data-foto="-1" aria-label="Foto anterior">${I.left}</button><button class="nav-foto next" data-foto="1" aria-label="Próxima foto">${I.right}</button>` : ""}
        <span class="ilustr" id="fotoCred" ${fotos[0].endsWith(".svg") ? "" : "hidden"}>Imagem ilustrativa</span></div>
      <div class="thumbs">${fotos.slice(0, 4).map((f, k) => `<button data-idx="${k}" class="${k === 0 ? "on" : ""}" aria-label="Foto ${k + 1}"><img src="${esc(f)}" alt="" loading="lazy"></button>`).join("")}</div>
    </div>
    <div class="detalhe">
      <div>
        <div style="display:grid;gap:10px">
          <div class="badges" style="position:static"><span class="badge" style="background:var(--surface-2)">${esc(tipoNome(it.tipo))}</span>${it.oportunidade ? `<span class="badge op">${esc(SEG.oportunidade?.rotulo || "Oferta")}</span>` : ""}<span class="pill ${esc(it.status)}">${esc(SEG.status?.[it.status] || "")}</span></div>
          <h1 style="font-size:clamp(1.7rem,3.6vw,2.5rem)">${esc(it.titulo)}</h1>
          ${it.cidade || E.cidade ? `<span class="loc muted" style="display:flex;gap:6px;align-items:center">${I.pin.replace("<svg", '<svg width="16" height="16"')}${SEG.usaBairro && it.bairro ? esc(it.bairro) + ", " : ""}${esc(it.cidade || E.cidade || "")}${E.uf ? " - " + esc(E.uf) : ""}</span>` : ""}
        </div>
        ${it.descricao ? `<p style="font-size:1.05rem;max-width:65ch">${esc(it.descricao)}</p>` : ""}
        <div style="display:grid;gap:12px"><h2 style="font-size:1.4rem">Ficha técnica</h2><dl class="ficha" style="margin:0">${ficha.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></div>
        ${extras.length ? `<div style="display:grid;gap:12px"><h2 style="font-size:1.4rem">${esc(SEG.extras.rotulo)}</h2><div class="tags">${extras.map((l) => `<span class="tag">${I.check}${esc(l)}</span>`).join("")}</div></div>` : ""}
        ${it.video_url ? `<div style="display:grid;gap:12px"><h2 style="font-size:1.4rem">Vídeo</h2><a class="btn btn-ghost" href="${esc(it.video_url)}" target="_blank" rel="noopener">Assistir ao vídeo</a></div>` : ""}
        ${mostraMapa ? `<div style="display:grid;gap:12px"><h2 style="font-size:1.4rem">Localização aproximada</h2>
          <div class="mapa">${mapaSVG()}<div class="info"><span>Região de ${esc(it.bairro || it.cidade)}. ${esc(T("notaDetalhe"))}</span><a class="btn btn-primary btn-sm" href="https://www.google.com/maps/search/?api=1&query=${(+it.lat).toFixed(2)},${(+it.lng).toFixed(2)}" target="_blank" rel="noopener">Ver região no mapa</a></div></div></div>` : ""}
      </div>
      <aside class="lateral">
        <span class="eyebrow">Valor</span>
        <div class="price" style="border:0;padding:0;margin:0"><b>${brl(it.preco)}</b>${it.preco_anterior ? `<s>${brl(it.preco_anterior)}</s>` : ""}</div>
        <div class="cond">
          ${(SEG.condicoes || []).map((c) => `<div><span class="muted">${esc(c.rotulo)}</span><b>${it[c.k] ? "Sim" : "Não"}</b></div>`).join("")}
          <div><span class="muted">Código</span><b>${esc(it.codigo)}</b></div>
        </div>
        <a class="btn btn-zap" href="${zapItem(it)}" target="_blank" rel="noopener">${I.zap}${esc(T("acaoPrincipal") || "Quero saber mais")}</a>
        ${T("acaoSecundaria") ? `<a class="btn btn-ghost" href="${zapLink(preencher(T("msgAcaoSecundaria"), it))}" target="_blank" rel="noopener">${esc(T("acaoSecundaria"))}</a>` : ""}
        <p class="muted" style="font-size:.82rem">A mensagem já vai com o código <b>${esc(it.codigo)}</b>. ${mostraMapa ? "" : esc(T("notaDetalhe"))}</p>
      </aside>
    </div>
    ${parecidos.length ? `<div style="margin-top:56px;display:grid;gap:20px"><h2>Outros ${esc(ITENS())} parecidos</h2><div class="grid">${parecidos.map(card).join("")}</div></div>` : ""}
  </div></section>`;
}
function ligarItem(codigo) {
  const it = DB.porCodigo(codigo); if (!it) return;
  const fotos = it.fotos?.length ? it.fotos : [fotoPadrao()]; let idx = 0;
  const mostrar = (k) => { idx = (k + fotos.length) % fotos.length; $("#fotoMain").src = fotos[idx]; $("#fotoCred").hidden = !fotos[idx].endsWith(".svg"); document.querySelectorAll(".thumbs button").forEach((b) => b.classList.toggle("on", +b.dataset.idx === idx)); };
  document.querySelector(".galeria").addEventListener("click", (e) => {
    const t = e.target.closest("[data-idx]"); if (t) return mostrar(+t.dataset.idx);
    const n = e.target.closest("[data-foto]"); if (n) mostrar(idx + +n.dataset.foto);
  });
  const zf = $("#zapFloat"); if (zf) zf.href = zapItem(it);
}

// Campo de formulário genérico a partir da definição do segmento
function campoForm(c, valor, pre) {
  const id = pre + c.k;
  if (c.tipo === "bool") return `<label class="check"><input type="checkbox" id="${id}" data-campo="${c.k}" ${valor ? "checked" : ""}> ${esc(c.rotulo)}</label>`;
  if (c.tipo === "select") return `<div class="field"><label for="${id}">${esc(c.rotulo)}</label><select class="input" id="${id}" data-campo="${c.k}"><option value="">—</option>${Object.entries(c.opcoes).map(([o, t]) => `<option value="${o}" ${valor === o ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
  const lista = c.lista ? `<datalist id="dl_${id}">${c.lista.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>` : "";
  return `<div class="field"><label for="${id}">${esc(c.rotulo)}${c.formato === "km" ? " (km)" : c.formato === "cc" ? " (cc)" : ["area", "m2"].includes(c.formato) ? " (m²)" : c.formato === "kmdec" ? " (km)" : ""}</label><input class="input" id="${id}" data-campo="${c.k}" data-num="${c.tipo === "numero" ? 1 : ""}" ${c.tipo === "numero" ? 'inputmode="decimal"' : ""} ${c.lista ? `list="dl_${id}"` : ""} value="${esc(valor ?? "")}" placeholder="${esc(c.placeholder || "")}">${lista}</div>`;
}
function lerCampos(raiz) {
  const o = {};
  raiz.querySelectorAll("[data-campo]").forEach((el) => {
    if (el.type === "checkbox") o[el.dataset.campo] = el.checked;
    else if (el.dataset.num) { const v = el.value.trim().replace(/\./g, "").replace(",", "."); o[el.dataset.campo] = v === "" ? "" : Number(v); }
    else o[el.dataset.campo] = el.value.trim();
  });
  return o;
}

// ---- Anuncie / venda o seu: formulário em 3 etapas ----
const A = { etapa: 1, dados: {}, fotos: [] };
function paginaAnuncie() {
  const d = A.dados; const v = (k) => esc(d[k] || "");
  const etapas = `<div class="steps" aria-label="Etapa ${A.etapa} de 3">${[1, 2, 3].map((n) => `<span class="${n <= A.etapa ? "on" : ""}"></span>`).join("")}</div>`;
  const tipoSel = d.tipo || Object.keys(SEG.tipos)[0];
  const extras = (SEG.anuncieCampos || []).map((k) => SEG.campos.find((c) => c.k === k)).filter((c) => c && aplica(c, tipoSel));
  let corpo = "";
  if (A.etapa === 1) corpo = `<h2 style="font-size:1.5rem">Seus dados</h2>
    <div class="form-grid">
      <div class="field full"><label for="aNome">Nome completo</label><input class="input" id="aNome" required value="${v("nome")}"></div>
      <div class="field"><label for="aZap">WhatsApp</label><input class="input" id="aZap" required inputmode="tel" placeholder="(00) 9 0000-0000" value="${v("whatsapp")}"></div>
      <div class="field"><label for="aEmail">E-mail (opcional)</label><input class="input" id="aEmail" type="email" value="${v("email")}"></div>
      <div class="field full"><label for="aPerfil">Você é</label><select class="input" id="aPerfil">${(T("anunciePerfis") || ["Proprietário(a)"]).map((o) => `<option ${d.perfil === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>
    </div>`;
  if (A.etapa === 2) corpo = `<h2 style="font-size:1.5rem">Sobre o ${esc(ITEM())}</h2>
    <div class="form-grid" id="aCampos">
      <div class="field"><label for="aTipo">Tipo</label><select class="input" id="aTipo">${Object.entries(SEG.tipos).map(([k, t]) => `<option value="${k}" ${tipoSel === k ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select></div>
      <div class="field"><label for="aCidade">Cidade</label><input class="input" id="aCidade" required value="${v("cidade") || esc(E.cidade || "")}"></div>
      ${extras.map((c) => campoForm(c, d[c.k], "a_")).join("")}
      <div class="field"><label for="aPreco">Valor pedido (R$)</label><input class="input" id="aPreco" inputmode="numeric" value="${v("preco")}"></div>
      <div class="field full"><label for="aDesc">${esc(T("anuncieDescricao") || "Descrição")}</label><textarea class="input" id="aDesc">${v("descricao")}</textarea></div>
    </div>`;
  if (A.etapa === 3) corpo = `<h2 style="font-size:1.5rem">Fotos</h2>
    <p class="muted">${esc(T("anuncieFotos"))} Fotos na horizontal ficam melhores.</p>
    <label class="drop" for="aFotos">${I.upload}<b>Escolher fotos</b><span class="muted" style="font-size:.85rem">JPG ou PNG, até 15 fotos</span></label>
    <input type="file" id="aFotos" accept="image/*" multiple hidden>
    <div class="previews" id="aPrev">${A.fotos.map((f, k) => `<figure><img src="${f}" alt="Foto ${k + 1}"><button type="button" data-rm="${k}" aria-label="Remover foto">×</button></figure>`).join("")}</div>`;
  if (A.etapa === 4) {
    const resumo = [tipoNome(d.tipo), ...extras.map((c) => formatar(c, d[c.k], true)).filter(Boolean), d.cidade && `em ${d.cidade}`, d.preco ? brl(d.preco) : "valor a combinar"].filter(Boolean).join(", ");
    return `<section class="section"><div class="wrap"><div class="form-card"><div class="sucesso">${I.ok}<h2>Recebemos seu ${esc(ITEM())}</h2><p class="muted" style="max-width:48ch">Obrigado, ${esc(d.nome?.split(" ")[0] || "")}! Vamos analisar os dados e falar com você pelo WhatsApp ${esc(d.whatsapp)}.</p>
    <a class="btn btn-zap" href="${zapLink(`Olá! Acabei de cadastrar um ${ITEM()} no site da ${E.nome}: ${resumo}. Meu nome é ${d.nome}.`)}" target="_blank" rel="noopener">${I.zap}Avisar também pelo WhatsApp</a>
    <a class="btn btn-ghost" href="#inicio" id="novoAnuncio">Voltar ao início</a></div></div></div></section>`;
  }
  return `<section class="section" style="padding-top:36px"><div class="wrap">
    <div style="text-align:center;display:grid;gap:10px;margin-bottom:28px;justify-items:center"><span class="eyebrow">${esc(T("parceiroEyebrow"))}</span><h1 style="font-size:clamp(1.8rem,4vw,2.6rem)">${esc(T("anuncieTitulo"))}</h1><p class="muted" style="max-width:56ch">${esc(T("anuncieTexto"))}</p></div>
    <form class="form-card" id="formAnuncie" novalidate>${etapas}${corpo}
      <p class="muted" id="aErro" role="alert" style="color:var(--terra)"></p>
      <div class="form-actions">${A.etapa > 1 ? '<button type="button" class="btn btn-ghost" id="aVoltar">Voltar</button>' : "<span></span>"}<button class="btn btn-terra" type="submit">${A.etapa < 3 ? "Continuar" : "Enviar"}</button></div>
    </form></div></section>`;
}
function ligarAnuncie() {
  const form = $("#formAnuncie"); if (!form) { const n = $("#novoAnuncio"); if (n) n.addEventListener("click", () => { A.etapa = 1; A.dados = {}; A.fotos = []; }); return; }
  const guardar = () => {
    const g = (id) => $(id)?.value.trim();
    if (A.etapa === 1) Object.assign(A.dados, { nome: g("#aNome"), whatsapp: g("#aZap"), email: g("#aEmail"), perfil: g("#aPerfil") });
    if (A.etapa === 2) Object.assign(A.dados, { tipo: g("#aTipo"), cidade: g("#aCidade"), preco: g("#aPreco").replace(/\D/g, ""), descricao: g("#aDesc") }, lerCampos($("#aCampos")));
  };
  $("#aTipo")?.addEventListener("change", () => { guardar(); render(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); guardar();
    const erro = (m) => { $("#aErro").textContent = m; };
    if (A.etapa === 1 && (!A.dados.nome || (A.dados.whatsapp || "").replace(/\D/g, "").length < 10)) return erro("Preencha seu nome e um WhatsApp com DDD.");
    if (A.etapa === 2 && !A.dados.cidade) return erro("Informe a cidade.");
    if (A.etapa === 3) {
      if (!A.fotos.length) return erro("Adicione pelo menos uma foto.");
      try {
        const fotos = DB.modo === "api" ? await Promise.all(A.fotos.map((f) => DB.subirFoto(f))) : A.fotos.slice(0, 4);
        await DB.enviarLead({ origem: "anuncie", ...A.dados, fotos });
      } catch (err) { return erro(err.message); }
    }
    A.etapa++; render(); scrollTo(0, 0);
  });
  $("#aVoltar")?.addEventListener("click", () => { guardar(); A.etapa--; render(); });
  $("#aFotos")?.addEventListener("change", async (e) => {
    for (const f of [...e.target.files].slice(0, 15 - A.fotos.length)) { try { A.fotos.push(await lerFoto(f, 1280)); } catch { toast("Não consegui ler uma das fotos."); } }
    render();
  });
  $("#aPrev")?.addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { A.fotos.splice(+b.dataset.rm, 1); render(); } });
}

// ---- Painel do administrador ----
const ADM = { aba: "itens", editando: null, fotos: [] };
function paginaAdmin() {
  if (DB.modo === "api" && !DB.token) return `<section class="section"><div class="wrap"><form class="form-card" id="login" style="max-width:420px"><h2>Área do administrador</h2><div class="field"><label for="senha">Senha</label><input class="input" id="senha" type="password" autocomplete="current-password" required></div><p id="lErro" role="alert" style="color:var(--terra)"></p><button class="btn btn-primary">Entrar</button></form></div></section>`;
  const linhas = DB.itens.map((i) => `<tr>
    <td><img src="${esc(i.fotos?.[0] || fotoPadrao())}" alt=""></td>
    <td><b>${esc(i.codigo)}</b></td><td style="min-width:220px">${esc(i.titulo)}<br><span class="muted" style="font-size:.82rem">${esc(tipoNome(i.tipo))}${i.cidade ? " · " + esc(i.cidade) : ""}${i.oportunidade ? " · " + esc(SEG.oportunidade?.rotulo || "") : ""}${i.destaque ? " · Destaque" : ""}</span></td>
    <td class="num">${brl(i.preco)}</td><td><span class="pill ${esc(i.status)}">${esc(SEG.status?.[i.status] || i.status)}</span></td>
    <td><div class="acoes"><button class="btn btn-ghost btn-sm" data-edit="${esc(i.codigo)}">Editar</button><a class="btn btn-ghost btn-sm" href="#${slug(i.codigo)}">Ver</a></div></td></tr>`).join("");
  let conteudo = "";
  if (ADM.aba === "itens") conteudo = `<div class="tabela-wrap"><table><thead><tr><th>Foto</th><th>Código</th><th>${esc(cap(ITEM()))}</th><th>Preço</th><th>Situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  else if (ADM.aba === "leads") conteudo = '<div class="leads" id="leads"><p class="muted">Carregando…</p></div>';
  else conteudo = formEmpresa();
  return `<section class="section" style="padding-top:36px"><div class="wrap">
    <div class="admin-bar"><div><span class="eyebrow">Painel</span><h1 style="font-size:2rem">Administração</h1></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-terra" id="novo">+ Cadastrar ${esc(ITEM())}</button>${DB.modo === "api" ? '<button class="btn btn-ghost" id="sair">Sair</button>' : ""}</div></div>
    ${DB.modo === "local" ? '<p class="aviso" style="margin-bottom:18px"><b>Modo demonstração.</b> O que você salvar aqui fica só neste navegador. ' + (DEMO ? "Pode cadastrar, editar, trocar a empresa e o segmento à vontade: nada muda no site de verdade." : "No site publicado, o painel pede senha e salva no servidor.") + "</p>" : ""}
    <div class="tabs"><button class="chip ${ADM.aba === "itens" ? "on" : ""}" data-aba="itens">${esc(cap(ITENS()))} (${DB.itens.length})</button><button class="chip ${ADM.aba === "leads" ? "on" : ""}" data-aba="leads">Recebidos pelo "${esc(T("anuncieTitulo"))}"</button><button class="chip ${ADM.aba === "empresa" ? "on" : ""}" data-aba="empresa">Empresa e segmento</button></div>
    ${conteudo}
  </div></section><div id="modal"></div>`;
}

function formEmpresa() {
  const v = (k) => esc(E[k] ?? "");
  const cores = { ...SEG.cores, ...CFG.cores };
  const f = (k, rot, extra = "", cls = "") => `<div class="field ${cls}"><label for="e_${k}">${rot}</label><input class="input" id="e_${k}" data-emp="${k}" value="${k === "cnpj" ? esc(formatarCnpj(E.cnpj)) : v(k)}" ${extra}></div>`;
  const cor = (k, rot) => `<div class="field"><label for="c_${k}">${rot}</label><input class="input" type="color" id="c_${k}" data-cor="${k}" value="${esc(cores[k] || "#000000")}" style="height:44px;padding:4px"></div>`;
  return `<form class="form-card" id="formEmpresa" novalidate style="max-width:none">
    <p class="muted">Tudo que identifica a empresa no site sai daqui. Para usar o sistema em outro negócio, troque o nome, o CNPJ e o segmento e salve.</p>
    <div class="form-grid">
      <div class="field full"><label for="e_segmento">Segmento (o que a empresa vende)</label><select class="input" id="e_segmento">${SEGMENTOS_DISP.map((s) => `<option value="${esc(s.id)}" ${s.id === CFG.segmento ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}</select></div>
      <div class="field full"><label for="e_visual">Visual do site</label><select class="input" id="e_visual">${[["classico", "Clássico: claro, com faixas e ilustrações"], ["garagem", "Garagem: escuro, foto grande e cor de destaque forte"]].map(([k, t]) => `<option value="${k}" ${(CFG.visual || "classico") === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field full"><label>Logotipo</label><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <span id="logoPrev" style="background:#16181b;border-radius:8px;padding:6px;min-height:56px;display:grid;place-items:center">${E.logo ? `<img src="${esc(E.logo)}" alt="" style="height:44px;width:auto">` : '<span class="muted" style="padding:0 10px;font-size:.85rem">Sem logo (usa a letra)</span>'}</span>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">Enviar logo<input type="file" id="logoArq" accept="image/png,image/jpeg,image/webp" hidden></label>
        <button type="button" class="btn btn-ghost btn-sm" id="logoTirar">Tirar logo</button>
        <input type="hidden" data-emp="logo" id="e_logo" value="${v("logo")}"></div></div>
      ${f("nome", "Nome da empresa", "required", "full")}
      ${f("cnpj", "CNPJ", 'inputmode="numeric" placeholder="00.000.000/0000-00"')}
      ${f("razaoSocial", "Razão social")}
      ${f("marcaCurta", "Nome no logotipo", 'placeholder="Ex.: Topper"')}
      ${f("marcaLinha", "Linha abaixo do logotipo", 'placeholder="Ex.: Veículos · Sul de Minas"')}
      ${f("whatsapp", "WhatsApp (só números, com 55 e DDD)", 'inputmode="numeric" placeholder="5535999999999"')}
      ${f("whatsappExibicao", "WhatsApp como aparece no site", 'placeholder="(35) 9 9999-9999"')}
      ${f("email", "E-mail", 'type="email"')}
      ${f("registro", "Registro profissional (opcional)", 'placeholder="Ex.: CRECI, inscrição estadual"')}
      ${f("endereco", "Endereço", "", "full")}
      ${f("cidade", "Cidade")}
      ${f("uf", "UF", 'maxlength="2"')}
      ${f("horario", "Horário de atendimento", "", "full")}
      <div class="field full"><label>Cores da marca</label><div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">${cor("principal", "Principal")}${cor("principalTexto", "Texto sobre a principal")}${cor("destaque", "Botões e destaques")}${cor("realce", "Realce")}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="coresPadrao" style="justify-self:start">Usar as cores padrão do segmento</button></div>
    </div>
    <p id="eErro" role="alert" style="color:var(--terra)"></p>
    <div class="form-actions"><span class="muted" style="font-size:.85rem">Ao trocar de segmento, os anúncios do outro segmento ficam guardados e voltam se você voltar.</span><button class="btn btn-primary" type="submit">Salvar empresa</button></div>
  </form>`;
}
function ligarEmpresa() {
  const f = $("#formEmpresa"); if (!f) return;
  let semCores = false;
  $("#logoTirar").addEventListener("click", () => { $("#e_logo").value = ""; $("#logoPrev").innerHTML = '<span class="muted" style="padding:0 10px;font-size:.85rem">Sem logo (usa a letra)</span>'; });
  $("#logoArq").addEventListener("change", (e) => {
    const arq = e.target.files[0]; if (!arq) return;
    if (arq.size > 3e6) return toast("Logo muito grande. Use uma imagem de até 3 MB.");
    const fr = new FileReader();
    fr.onload = async () => {
      try { const url = await DB.subirFoto(fr.result); $("#e_logo").value = url; $("#logoPrev").innerHTML = `<img src="${esc(url)}" alt="" style="height:44px;width:auto">`; }
      catch (err) { toast(err.message || "Não foi possível enviar o logo."); }
    };
    fr.readAsDataURL(arq);
  });
  $("#e_cnpj").addEventListener("blur", (e) => { e.target.value = formatarCnpj(e.target.value); });
  $("#coresPadrao").addEventListener("click", async () => {
    const seg = await (await fetch(`segmentos/${encodeURIComponent($("#e_segmento").value)}.json`)).json();
    f.querySelectorAll("[data-cor]").forEach((el) => { el.value = seg.cores[el.dataset.cor] || el.value; }); semCores = true;
  });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const empresa = {}; f.querySelectorAll("[data-emp]").forEach((el) => { empresa[el.dataset.emp] = el.value.trim(); });
    empresa.cnpj = empresa.cnpj.replace(/\D/g, ""); empresa.whatsapp = empresa.whatsapp.replace(/\D/g, ""); empresa.uf = empresa.uf.toUpperCase();
    const erro = (m) => { $("#eErro").textContent = m; };
    if (!empresa.nome) return erro("Informe o nome da empresa.");
    if (empresa.cnpj && !cnpjValido(empresa.cnpj)) return erro("Esse CNPJ não é válido. Confira os números.");
    if (empresa.whatsapp && empresa.whatsapp.length < 12) return erro("WhatsApp: use 55 + DDD + número, só os dígitos.");
    const segmento = $("#e_segmento").value, visual = $("#e_visual").value;
    const cores = {};
    if (!semCores && segmento === CFG.segmento) f.querySelectorAll("[data-cor]").forEach((el) => { if (el.value.toLowerCase() !== String(SEG.cores[el.dataset.cor] || "").toLowerCase()) cores[el.dataset.cor] = el.value; });
    try { await DB.salvarConfig({ segmento, visual, empresa, cores }); toast("Empresa salva."); setTimeout(() => location.reload(), 400); }
    catch (err) { erro(err.message); }
  });
}

function formItem(it) {
  const v = (k) => esc(it[k] ?? "");
  const sel = (k, opts) => Object.entries(opts).map(([o, t]) => `<option value="${o}" ${it[k] === o ? "selected" : ""}>${esc(t)}</option>`).join("");
  const ck = (k) => (it[k] ? "checked" : "");
  const ex = SEG.extras, comuns = ex ? comunsExtras(it.tipo) : [];
  const extrasOutros = ex ? (it[ex.k] || []).filter((l) => !comuns.includes(l)).join(", ") : "";
  const campos = SEG.campos.filter((c) => aplica(c, it.tipo));
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Cadastro"><form class="form-card" id="formItem" novalidate>
    <div class="modal-head"><h2 style="font-size:1.5rem">${ADM.editando ? "Editar " + esc(ADM.editando) : "Novo " + esc(ITEM())}</h2><button type="button" class="btn btn-ghost btn-sm" data-fechar>Fechar</button></div>
    <div class="form-grid">
      <div class="field"><label for="mTipo">Tipo</label><select class="input" id="mTipo">${sel("tipo", Object.fromEntries(Object.entries(SEG.tipos).map(([k, t]) => [k, t.nome])))}</select></div>
      <div class="field"><label for="mCod">Código</label><input class="input" id="mCod" value="${v("codigo")}" placeholder="Gerado automaticamente"></div>
      <div class="field full"><label for="mTitulo">Título do anúncio</label><input class="input" id="mTitulo" required value="${v("titulo")}" placeholder="${esc(SEG.tituloExemplo || "")}"></div>
      <div class="field"><label for="mCidade">Cidade</label><input class="input" id="mCidade" value="${v("cidade") || esc(E.cidade || "")}"></div>
      ${SEG.usaBairro ? `<div class="field"><label for="mBairro">Bairro / região</label><input class="input" id="mBairro" value="${v("bairro")}"></div>` : ""}
      <div class="field"><label for="mPreco">Preço (R$)</label><input class="input" id="mPreco" inputmode="numeric" value="${v("preco")}"></div>
      <div class="field"><label for="mPrecoAnt">Preço anterior (se baixou)</label><input class="input" id="mPrecoAnt" inputmode="numeric" value="${v("preco_anterior")}"></div>
    </div>
    <div class="form-grid" id="mCampos">
      ${campos.filter((c) => c.tipo !== "bool").map((c) => campoForm(c, it[c.k], "m_")).join("")}
      <div class="full" style="display:flex;gap:18px;flex-wrap:wrap">${campos.filter((c) => c.tipo === "bool").map((c) => campoForm(c, it[c.k], "m_")).join("")}</div>
    </div>
    <div class="form-grid">
      <div class="field"><label for="mStatus">Situação</label><select class="input" id="mStatus">${sel("status", { ...SEG.status, oculto: "Oculto (não aparece)" })}</select></div>
      ${SEG.mostrarMapa ? `<div class="field"><label for="mLat">Latitude aproximada</label><input class="input" id="mLat" inputmode="decimal" value="${v("lat")}"></div><div class="field"><label for="mLng">Longitude aproximada</label><input class="input" id="mLng" inputmode="decimal" value="${v("lng")}"></div>` : ""}
      ${ex ? `<div class="field full"><label>${esc(ex.rotulo)}</label><div class="chips">${comuns.map((l) => `<label class="check chip"><input type="checkbox" name="extra" value="${esc(l)}" ${(it[ex.k] || []).includes(l) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>
        <input class="input" id="mExtra" value="${esc(extrasOutros)}" placeholder="Outros, separados por vírgula"></div>` : ""}
      <div class="field full"><label for="mDesc">Descrição</label><textarea class="input" id="mDesc">${v("descricao")}</textarea></div>
      <div class="field full"><label for="mVideo">Link do vídeo (YouTube, Instagram)</label><input class="input" id="mVideo" value="${v("video_url")}"></div>
      <div class="full" style="display:flex;gap:18px;flex-wrap:wrap">
        <label class="check"><input type="checkbox" id="mDest" ${ck("destaque")}> Destaque na página inicial</label>
        ${SEG.oportunidade ? `<label class="check"><input type="checkbox" id="mOp" ${ck("oportunidade")}> ${esc(SEG.oportunidade.rotulo.replace(/s$/, ""))} (${esc(SEG.oportunidade.texto.toLowerCase())})</label>` : ""}
        ${(SEG.condicoes || []).map((c) => `<label class="check"><input type="checkbox" data-condf="${c.k}" ${ck(c.k)}> ${esc(c.rotulo)}</label>`).join("")}
      </div>
      <div class="field full"><label>Fotos (a primeira é a capa)</label>
        <label class="drop" for="mFotos">${I.upload}<b>Adicionar fotos</b></label><input type="file" id="mFotos" accept="image/*" multiple hidden>
        <div class="previews" id="mPrev">${ADM.fotos.map((f, k) => `<figure><img src="${esc(f)}" alt="Foto ${k + 1}"><button type="button" data-mrm="${k}" aria-label="Remover foto">×</button>${k ? `<button type="button" data-capa="${k}" aria-label="Usar como capa" style="left:4px;right:auto">★</button>` : ""}</figure>`).join("")}</div></div>
      <div class="field full"><label for="mResp">Responsável (interno, não aparece no site)</label><input class="input" id="mResp" value="${v("responsavel")}"></div>
    </div>
    <p id="mErro" role="alert" style="color:var(--terra)"></p>
    <div class="form-actions">${ADM.editando ? `<button type="button" class="btn btn-ghost" id="excluir" style="color:var(--terra)">Excluir ${esc(ITEM())}</button>` : "<span></span>"}<button class="btn btn-primary" type="submit">Salvar ${esc(ITEM())}</button></div>
    <div id="confirma" hidden class="aviso">Excluir ${esc(ADM.editando || "")} de vez? <button type="button" class="btn btn-terra btn-sm" id="confirmaSim">Sim, excluir</button> <button type="button" class="btn btn-ghost btn-sm" id="confirmaNao">Cancelar</button></div>
  </form></div>`;
}
function abrirForm(codigo) {
  ADM.editando = codigo || null;
  const it = codigo ? structuredClone(DB.porCodigo(codigo)) : { tipo: Object.keys(SEG.tipos)[0], status: "disponivel", cidade: E.cidade || "" };
  ADM.fotos = [...(it.fotos || [])]; ADM.base = it;
  desenharForm();
}
function desenharForm() {
  const m = $("#modal"); const rolagem = m.querySelector(".modal")?.scrollTop || 0;
  m.innerHTML = formItem(ADM.base); m.querySelector(".modal").scrollTop = rolagem;
  const f = $("#formItem");
  const coletar = () => {
    const g = (id) => ($(id)?.value || "").trim(); const n = (id) => (g(id) === "" ? "" : Number(g(id).replace(/\./g, "").replace(",", ".")));
    const ex = SEG.extras;
    const extras = ex ? [...f.querySelectorAll('[name="extra"]:checked')].map((c) => c.value).concat(g("#mExtra").split(",").map((s) => s.trim()).filter(Boolean)) : [];
    const cond = {}; f.querySelectorAll("[data-condf]").forEach((el) => { cond[el.dataset.condf] = el.checked; });
    return { ...ADM.base, ...lerCampos($("#mCampos")), ...cond, tipo: g("#mTipo"), codigo: g("#mCod").toUpperCase(), titulo: g("#mTitulo"), cidade: g("#mCidade"), bairro: g("#mBairro"),
      preco: n("#mPreco"), preco_anterior: n("#mPrecoAnt"), status: g("#mStatus"), lat: n("#mLat"), lng: n("#mLng"), ...(ex ? { [ex.k]: extras } : {}),
      descricao: g("#mDesc"), video_url: g("#mVideo"), destaque: $("#mDest").checked, oportunidade: !!$("#mOp")?.checked,
      responsavel: g("#mResp"), fotos: ADM.fotos, exemplo: false };
  };
  $("#mTipo").addEventListener("change", () => { ADM.base = coletar(); desenharForm(); });
  f.addEventListener("click", async (e) => {
    if (e.target.closest("[data-fechar]")) { m.innerHTML = ""; return; }
    const rm = e.target.closest("[data-mrm]"); if (rm) { ADM.base = coletar(); ADM.fotos.splice(+rm.dataset.mrm, 1); ADM.base.fotos = ADM.fotos; return desenharForm(); }
    const cp = e.target.closest("[data-capa]"); if (cp) { ADM.base = coletar(); const [x] = ADM.fotos.splice(+cp.dataset.capa, 1); ADM.fotos.unshift(x); ADM.base.fotos = ADM.fotos; return desenharForm(); }
    if (e.target.id === "excluir") $("#confirma").hidden = false;
    if (e.target.id === "confirmaNao") $("#confirma").hidden = true;
    if (e.target.id === "confirmaSim") { try { await DB.excluir(ADM.editando); m.innerHTML = ""; toast("Excluído."); render(); } catch (err) { $("#mErro").textContent = err.message; } }
  });
  $("#mFotos").addEventListener("change", async (e) => {
    ADM.base = coletar();
    for (const file of e.target.files) { try { ADM.fotos.push(await DB.subirFoto(await lerFoto(file))); } catch (err) { toast(err.message || "Não consegui ler uma das fotos."); } }
    ADM.base.fotos = ADM.fotos; desenharForm();
  });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const it = coletar();
    if (!it.titulo) return ($("#mErro").textContent = "Preencha pelo menos o título.");
    if (!it.codigo) it.codigo = DB.proximoCodigo(it.tipo, it.oportunidade);
    if (it.codigo !== ADM.editando && DB.porCodigo(it.codigo)) return ($("#mErro").textContent = `Já existe um anúncio com o código ${it.codigo}.`);
    try { await DB.salvar(it, ADM.editando); m.innerHTML = ""; toast(`${cap(ITEM())} ${it.codigo} salvo.`); render(); }
    catch (err) { $("#mErro").textContent = err.message; }
  });
}
async function ligarAdmin() {
  const lg = $("#login");
  if (lg) return lg.addEventListener("submit", async (e) => { e.preventDefault(); try { await DB.login($("#senha").value); render(); } catch (err) { $("#lErro").textContent = err.message === "Sessão expirada. Entre novamente." ? "Senha incorreta." : err.message; } });
  $("#novo").addEventListener("click", () => abrirForm(null));
  $("#sair")?.addEventListener("click", () => { DB.token = null; store.set("vitrine_token", null); render(); });
  document.querySelector(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-aba]"); if (b) { ADM.aba = b.dataset.aba; render(); } });
  document.querySelector("main").addEventListener("click", (e) => { const b = e.target.closest("[data-edit]"); if (b) abrirForm(b.dataset.edit); });
  ligarEmpresa();
  if (ADM.aba === "leads") {
    try {
      const l = await DB.leads();
      const campos = (SEG.anuncieCampos || []).map((k) => SEG.campos.find((c) => c.k === k)).filter(Boolean);
      $("#leads").innerHTML = l.length ? l.map((x) => `<div class="lead-card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(x.nome)} · ${esc(x.perfil || "")}</b><span class="muted" style="font-size:.85rem">${new Date(x.criado_em).toLocaleString("pt-BR")}</span></div>
        <span>${[tipoNome(x.tipo), x.cidade && "em " + x.cidade, ...campos.filter((c) => aplica(c, x.tipo)).map((c) => !vazio(x[c.k]) && `${c.rotulo}: ${formatar(c, x[c.k])}`), x.preco ? brl(x.preco) : "valor a combinar"].filter(Boolean).map(esc).join(" · ")}</span>
        <p class="muted">${esc(x.descricao || "")}</p>
        ${x.fotos?.length ? `<div class="previews">${x.fotos.map((f) => `<figure><img src="${esc(f)}" alt=""></figure>`).join("")}</div>` : ""}
        <div><a class="btn btn-zap btn-sm" href="https://wa.me/55${esc(String(x.whatsapp || "").replace(/\D/g, "").replace(/^55/, ""))}" target="_blank" rel="noopener">${I.zap}Responder ${esc(x.whatsapp)}</a></div></div>`).join("") : `<p class="muted">Nada recebido ainda. Quando alguém preencher a página "${esc(T("anuncieTitulo"))}", aparece aqui.</p>`;
    } catch (err) { $("#leads").innerHTML = `<p>${esc(err.message)}</p>`; }
  }
}

// ====== Roteador (endereços com #) ======
let rotaAnterior = null;
function render() {
  const rota = (location.hash.slice(1) || "inicio").toLowerCase();
  const ROTAS = rotasCatalogo();
  let html = "", depois = () => {};
  if (ROTAS[rota]) {
    const [tipo, op, titulo] = ROTAS[rota];
    if (rota !== rotaAnterior) { const keep = { cidade: F.cidade, precoMax: F.precoMax, c: { ...F.c } }; resetF(); Object.assign(F, keep); F.tipo = tipo; F.oportunidade = op; }
    html = paginaCatalogo(F.tipo !== tipo ? (F.tipo ? SEG.tipos[F.tipo].plural : `Todos os ${ITENS()}`) : titulo); depois = ligarCatalogo;
  } else if (rota.startsWith("item-")) { const c = rota.slice(5); html = paginaItem(c); depois = () => ligarItem(c); }
  else if (rota === "anuncie") { html = paginaAnuncie(); depois = ligarAnuncie; }
  else if (rota === "admin") { html = paginaAdmin(); depois = ligarAdmin; }
  else {
    html = paginaInicio();
    depois = () => {
      $("#buscaRapida").addEventListener("submit", (e) => {
        e.preventDefault(); resetF(); F.tipo = $("#qTipo").value; F.precoMax = $("#qPreco").value;
        e.target.querySelectorAll("[data-fk]").forEach((el) => { F.c[el.dataset.fk] = el.value; });
        rotaAnterior = "todos"; location.hash = "todos";
      });
      document.querySelectorAll("[data-marca]").forEach((b) => b.addEventListener("click", () => { resetF(); F.c.marca = b.dataset.marca; rotaAnterior = "todos"; location.hash = "todos"; }));
    };
  }
  $("#app").innerHTML = header(rota) + `<main>${html}</main>` + footer() +
    `<a class="zap-float" id="zapFloat" href="${zapLink(`Olá! Vim pelo site da ${E.nome} e gostaria de mais informações.`)}" target="_blank" rel="noopener" aria-label="Falar no WhatsApp">${I.zap}</a>`;
  $("#menuBtn").addEventListener("click", (e) => { const o = $("#nav").classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", o); });
  depois();
  if (rota !== rotaAnterior) scrollTo(0, 0);
  rotaAnterior = rota;
  const it = rota.startsWith("item-") && DB.porCodigo(rota.slice(5));
  document.title = it ? `${it.titulo} | ${E.nome}` : `${E.nome} | ${SEG.descricaoCurta}${E.cidade ? " em " + E.cidade : ""}`;
}

window.addEventListener("hashchange", render);
DB.carregarConfig().then(() => DB.carregar()).then(render).catch((e) => {
  console.error(e); $("#app").innerHTML = '<p style="padding:40px 16px;text-align:center">Não foi possível carregar o site. Recarregue a página.</p>';
});
