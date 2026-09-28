// Introspecta o database do Notion para descobrir nomes/tipos exatos das
// propriedades e os valores de status/select — sem precisar chutar.
//
// Uso (Node 20.6+):  node --env-file=.env.local scripts/inspect-db.mjs
import { Client } from "@notionhq/client";

const token = process.env.NOTION_TOKEN;
const dbId = process.env.NOTION_DB_CONTEUDO;

if (!token || !dbId) {
  console.error("Faltam NOTION_TOKEN e/ou NOTION_DB_CONTEUDO no .env.local");
  process.exit(1);
}

const notion = new Client({ auth: token });

const db = await notion.databases.retrieve({ database_id: dbId });

console.log("\n=== DATABASE ===");
console.log("titulo:", db.title?.map((t) => t.plain_text).join("") || "(sem)");

console.log("\n=== PROPRIEDADES ===");
for (const [nome, prop] of Object.entries(db.properties)) {
  let extra = "";
  if (prop.type === "status") {
    extra = " -> opcoes: " + prop.status.options.map((o) => o.name).join(" | ");
  } else if (prop.type === "select") {
    extra = " -> opcoes: " + prop.select.options.map((o) => o.name).join(" | ");
  }
  console.log(`- "${nome}"  (${prop.type})${extra}`);
}

console.log("\n=== AMOSTRA (ate 3 cards) ===");
const sample = await notion.databases.query({ database_id: dbId, page_size: 3 });
for (const page of sample.results) {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  const titulo = titleProp?.title?.map((t) => t.plain_text).join("") || "(sem titulo)";
  console.log(`- ${titulo}`);
}
console.log("\nOk.\n");
