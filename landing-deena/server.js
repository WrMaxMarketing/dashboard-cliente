import express from "express";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carrega .env simples (sem dependência extra)
const envFile = path.join(__dirname, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, "data");

export const PLANOS = {
  essencial: { id: "essencial", nome: "Essencial", preco: 200 },
  estrategico: { id: "estrategico", nome: "Estratégico", preco: 400 },
  premium: { id: "premium", nome: "Premium", preco: 600 },
};

// ---------- utilidades ----------
export function limparCNPJ(v = "") {
  return String(v).replace(/\D/g, "");
}

export function cnpjValido(v) {
  const c = limparCNPJ(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base) => {
    let soma = 0;
    let peso = base.length - 7;
    for (const n of base) {
      soma += Number(n) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ""));
const texto = (v, max = 160) => String(v ?? "").trim().slice(0, max);

async function registrar(tipo, payload) {
  const registro = { id: crypto.randomUUID(), tipo, criadoEm: new Date().toISOString(), ...payload };
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(path.join(DATA_DIR, `${tipo}.jsonl`), JSON.stringify(registro) + "\n");
  if (process.env.LEAD_WEBHOOK_URL) {
    fetch(process.env.LEAD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registro),
    }).catch((err) => console.error("[webhook]", err.message));
  }
  return registro;
}

// Rate limit simples em memória (por IP + rota)
const hits = new Map();
function limitar(max, janelaMs) {
  return (req, res, next) => {
    const chave = `${req.ip}:${req.path}`;
    const agora = Date.now();
    const lista = (hits.get(chave) || []).filter((t) => agora - t < janelaMs);
    lista.push(agora);
    hits.set(chave, lista);
    if (lista.length > max) return res.status(429).json({ erro: "Muitas tentativas. Aguarde um instante." });
    next();
  };
}

// Cache de consultas de CNPJ (dados públicos da Receita via BrasilAPI)
const cacheCNPJ = new Map();
async function consultarCNPJ(cnpj) {
  if (cacheCNPJ.has(cnpj)) return cacheCNPJ.get(cnpj);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const d = await r.json();
    const info = {
      razaoSocial: d.razao_social || null,
      nomeFantasia: d.nome_fantasia || null,
      situacao: d.descricao_situacao_cadastral || null,
      municipio: d.municipio || null,
      uf: d.uf || null,
      porte: d.porte || d.descricao_porte || null,
      abertura: d.data_inicio_atividade || null,
    };
    cacheCNPJ.set(cnpj, info);
    return info;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- app ----------
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "20kb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// Configuração pública consumida pelo front (pixel, VSL, WhatsApp)
app.get("/config.js", (_req, res) => {
  const cfg = {
    pixelId: process.env.META_PIXEL_ID || "",
    vslUrl: process.env.VSL_EMBED_URL || "",
    whatsapp: limparCNPJ(process.env.WHATSAPP_NUMERO || ""),
    planos: PLANOS,
  };
  res.type("application/javascript").send(`window.DEENA_CONFIG=${JSON.stringify(cfg)};`);
});

app.get("/api/cnpj/:cnpj", limitar(20, 60_000), async (req, res) => {
  const cnpj = limparCNPJ(req.params.cnpj);
  if (!cnpjValido(cnpj)) return res.status(400).json({ erro: "CNPJ inválido. Confira os números." });
  const info = await consultarCNPJ(cnpj);
  res.json({ cnpj, encontrado: Boolean(info), ...(info || {}) });
});

// Lead de topo: CNPJ informado no hero
app.post("/api/lead", limitar(10, 60_000), async (req, res) => {
  const cnpj = limparCNPJ(req.body?.cnpj);
  if (!cnpjValido(cnpj)) return res.status(400).json({ erro: "CNPJ inválido." });
  await registrar("leads", { cnpj, origem: texto(req.body?.origem, 60), utm: req.body?.utm || null });
  res.json({ ok: true });
});

// Checkout: grava pedido + consentimentos e devolve o link do gateway
app.post("/api/checkout", limitar(6, 60_000), async (req, res) => {
  const b = req.body || {};
  const plano = PLANOS[b.plano];
  const cnpj = limparCNPJ(b.cnpj);
  const erros = [];
  if (!plano) erros.push("Escolha um plano.");
  if (!cnpjValido(cnpj)) erros.push("CNPJ inválido.");
  if (texto(b.nome).length < 3) erros.push("Informe seu nome completo.");
  if (!emailValido(b.email)) erros.push("Informe um e-mail válido.");
  if (limparCNPJ(b.whatsapp).length < 10) erros.push("Informe um WhatsApp com DDD.");
  if (b.lgpd !== true) erros.push("É preciso autorizar o tratamento de dados (LGPD).");
  if (b.termos !== true) erros.push("É preciso aceitar os Termos de Uso.");
  if (erros.length) return res.status(400).json({ erro: erros.join(" ") });

  const pedido = await registrar("pedidos", {
    plano: plano.id,
    valor: plano.preco,
    cnpj,
    nome: texto(b.nome),
    email: texto(b.email).toLowerCase(),
    whatsapp: limparCNPJ(b.whatsapp),
    consentimentos: {
      lgpd: true,
      termos: true,
      // Opt-in explícito: só o cliente decide falar com um escritório parceiro
      contatoEscritorioParceiro: plano.id === "premium" && b.contatoParceiro === true,
      versaoTermos: "2026-10",
    },
    utm: b.utm || null,
  });

  const base = process.env[`CHECKOUT_URL_${plano.id.toUpperCase()}`];
  let redirect;
  if (base) {
    const u = new URL(base);
    u.searchParams.set("ref", pedido.id);
    u.searchParams.set("email", pedido.email);
    redirect = u.toString();
  } else {
    // Sem gateway configurado (ambiente de testes): segue direto para a página de obrigado
    redirect = `/obrigado?plano=${plano.id}&ref=${pedido.id}&demo=1`;
  }
  res.json({ ok: true, pedido: pedido.id, redirect });
});

// Opt-in do cliente para falar com um escritório parceiro (evento separado)
app.post("/api/contato-parceiro", limitar(6, 60_000), async (req, res) => {
  const b = req.body || {};
  if (b.consentimento !== true) return res.status(400).json({ erro: "Consentimento obrigatório." });
  await registrar("contato-parceiro", {
    cnpj: limparCNPJ(b.cnpj) || null,
    pedido: texto(b.pedido, 60) || null,
    origem: texto(b.origem, 60),
  });
  res.json({ ok: true });
});

// Programa para contadores
app.post("/api/contadores", limitar(6, 60_000), async (req, res) => {
  const b = req.body || {};
  if (texto(b.nome).length < 3 || !emailValido(b.email) || limparCNPJ(b.whatsapp).length < 10 || b.lgpd !== true) {
    return res.status(400).json({ erro: "Preencha nome, e-mail, WhatsApp e autorize o contato." });
  }
  await registrar("contadores", {
    nome: texto(b.nome),
    escritorio: texto(b.escritorio),
    email: texto(b.email).toLowerCase(),
    whatsapp: limparCNPJ(b.whatsapp),
    carteira: texto(b.carteira, 30),
  });
  res.json({ ok: true });
});

// Páginas limpas (/obrigado, /termos, /privacidade)
for (const pagina of ["obrigado", "termos", "privacidade"]) {
  app.get(`/${pagina}`, async (_req, res) => {
    res.type("html").send(await readFile(path.join(__dirname, "public", `${pagina}.html`), "utf8"));
  });
}

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], maxAge: "1h" }));

app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, "public", "index.html")));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Deena · landing rodando em http://localhost:${PORT}`));
}

export default app;
