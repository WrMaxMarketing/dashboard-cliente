// Testa a query real do M2: status + cliente(select), e lista titulo/formato.
// Uso: node --env-file=.env.local scripts/test-query.mjs
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB = process.env.NOTION_DB_CONTEUDO;
const STATUS = process.env.NOTION_STATUS_APROVACAO ?? "Conteúdo para aprovação";
const CLIENTE = process.env.NOTION_CLIENTE_FIXO;

const res = await notion.databases.query({
  database_id: DB,
  filter: {
    and: [
      { property: "Status", status: { equals: STATUS } },
      { property: "Cliente", select: { equals: CLIENTE } },
    ],
  },
  sorts: [{ timestamp: "created_time", direction: "ascending" }],
});

console.log(`\nFiltro: Status="${STATUS}"  +  Cliente="${CLIENTE}"`);
console.log(`Cards encontrados: ${res.results.length}\n`);
for (const page of res.results) {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  const titulo = titleProp?.title?.map((t) => t.plain_text).join("") || "(sem titulo)";
  const formato = page.properties["Formato do conteúdo"]?.status?.name ?? "—";
  console.log(`- [${formato}] ${titulo}`);
}
console.log("");
