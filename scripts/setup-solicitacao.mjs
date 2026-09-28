// Garante (idempotente) a propriedade de data usada pelo aviso de "alteração
// solicitada" (badge de 24h no quadro). Reusa "🔁 Nº de Ajustes" para a contagem.
//
// Uso (Node 20.6+):  node --env-file=.env.local scripts/setup-solicitacao.mjs
import { Client } from "@notionhq/client";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_CONTEUDO;
if (!token || !dbId) {
  console.error("Faltam NOTION_TOKEN e/ou NOTION_DB_CONTEUDO no .env.local");
  process.exit(1);
}

const PROP_SOLICITACAO = "Solicitação de alteração"; // date
const PROP_AJUSTES = "🔁 Nº de Ajustes"; // number (já existe)

const notion = new Client({ auth: token });
const db = await notion.databases.retrieve({ database_id: dbId });

if (!db.properties[PROP_AJUSTES]) {
  console.error(`AVISO: propriedade "${PROP_AJUSTES}" não encontrada no banco.`);
}

if (db.properties[PROP_SOLICITACAO]) {
  console.log(`OK: "${PROP_SOLICITACAO}" já existe (${db.properties[PROP_SOLICITACAO].type}).`);
} else {
  await notion.databases.update({
    database_id: dbId,
    properties: { [PROP_SOLICITACAO]: { date: {} } },
  });
  console.log(`Criada propriedade de data "${PROP_SOLICITACAO}".`);
}
console.log("Ok.");
