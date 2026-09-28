// Cria um usuario-cliente no Supabase (uso do ADMIN, com service role).
// O `cliente` e o valor do select "Cliente" do Notion (ex.: "Tmax") e fica
// gravado em app_metadata.cliente — que so o service role consegue alterar.
//
// Uso:
//   node --env-file=.env.local scripts/create-client-user.mjs <email> <senha> "<Cliente>"
//   node --env-file=.env.local scripts/create-client-user.mjs --list   (lista os clientes validos)
import { createClient } from "@supabase/supabase-js";
import { Client as Notion } from "@notionhq/client";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const notionToken = process.env.NOTION_TOKEN;
const notionDb = process.env.NOTION_DB_CONTEUDO;

// Busca os valores validos do select "Cliente" no Notion (ou null se falhar).
async function getClientesValidos() {
  if (!notionToken || !notionDb) return null;
  try {
    const notion = new Notion({ auth: notionToken });
    const db = await notion.databases.retrieve({ database_id: notionDb });
    const prop = db.properties["Cliente"];
    if (prop?.type !== "select") return null;
    return prop.select.options.map((o) => o.name);
  } catch {
    return null;
  }
}

if (!url || !serviceKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);

// Modo lista: mostra os clientes validos e sai.
if (args[0] === "--list") {
  const validos = await getClientesValidos();
  if (!validos) {
    console.error("Nao consegui ler o select 'Cliente' do Notion (cheque NOTION_TOKEN/NOTION_DB_CONTEUDO).");
    process.exit(1);
  }
  console.log("\nClientes validos (select 'Cliente' do Notion):");
  validos.forEach((c) => console.log("  -", c));
  console.log("");
  process.exit(0);
}

const [email, password, cliente] = args;

if (!email || !password || !cliente) {
  console.error('Uso: node --env-file=.env.local scripts/create-client-user.mjs <email> <senha> "<Cliente>"');
  console.error('     node --env-file=.env.local scripts/create-client-user.mjs --list');
  process.exit(1);
}

// Valida o cliente contra os valores reais do Notion (evita typo silencioso).
const validos = await getClientesValidos();
if (validos && !validos.includes(cliente)) {
  console.error(`\n"${cliente}" nao existe no select 'Cliente' do Notion.`);
  console.error("Clientes validos:");
  validos.forEach((c) => console.error("  -", c));
  console.error("");
  process.exit(1);
}
if (!validos) {
  console.warn("Aviso: nao consegui validar o cliente no Notion; criando mesmo assim.");
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // ja ativo, sem precisar confirmar email
  app_metadata: { cliente },
});

if (error) {
  console.error("Erro ao criar usuario:", error.message);
  process.exit(1);
}

console.log(`\nUsuario criado:`);
console.log(`  email:   ${data.user.email}`);
console.log(`  cliente: ${data.user.app_metadata?.cliente}`);
console.log(`  id:      ${data.user.id}\n`);
