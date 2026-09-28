// VALIDACAO (descartavel): testa a File Upload API do Notion e, principalmente,
// se ao reescrever a propriedade "Files & media" os arquivos JA hospedados no
// Notion sao preservados. Cria uma pagina de teste e arquiva no final.
//
// Uso: node --env-file=.env.local scripts/test-files-upload.mjs
const token = process.env.NOTION_TOKEN;
const db = process.env.NOTION_DB_CONTEUDO;
const V = "2022-06-28";
const PROP_FILES = "Files & media";

if (!token || !db) {
  console.error("Faltam NOTION_TOKEN / NOTION_DB_CONTEUDO");
  process.exit(1);
}

// PNG 1x1 transparente.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

async function api(path, init = {}) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": V,
      ...(init.json ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    body: init.json ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function uploadArquivo(nome) {
  const create = await api("file_uploads", { method: "POST", json: {} });
  if (!create.ok) throw new Error("create upload: " + JSON.stringify(create.data));
  const { id, upload_url } = create.data;

  const form = new FormData();
  form.append("file", new Blob([PNG], { type: "image/png" }), nome);
  const send = await api(`file_uploads/${id}/send`, { method: "POST", body: form });
  if (!send.ok) throw new Error("send: " + JSON.stringify(send.data));
  console.log(`  upload "${nome}" -> id=${id} status=${send.data.status}`);
  return id;
}

async function setFiles(pageId, files, rotulo) {
  const r = await api(`pages/${pageId}`, {
    method: "PATCH",
    json: { properties: { [PROP_FILES]: { files } } },
  });
  console.log(`  [${rotulo}] PATCH ok=${r.ok} status=${r.status}`);
  if (!r.ok) console.log("    erro:", JSON.stringify(r.data?.message ?? r.data));
  return r.ok;
}

async function listarFiles(pageId) {
  const r = await api(`pages/${pageId}`, { method: "GET" });
  const files = r.data?.properties?.[PROP_FILES]?.files ?? [];
  return files.map((f) => `${f.name}(${f.type})`);
}

(async () => {
  // 1) cria pagina de teste
  console.log("Criando pagina de teste...");
  const page = await api("pages", {
    method: "POST",
    json: {
      parent: { database_id: db },
      properties: {
        Nome: { title: [{ text: { content: "__TESTE UPLOAD (apagar)" } }] },
      },
    },
  });
  if (!page.ok) {
    console.error("Falha ao criar pagina:", JSON.stringify(page.data));
    process.exit(1);
  }
  const pageId = page.data.id;
  console.log("pageId:", pageId);

  try {
    // 2) anexa A
    console.log("\nAnexando A.png...");
    const idA = await uploadArquivo("A.png");
    await setFiles(pageId, [{ type: "file_upload", file_upload: { id: idA }, name: "A.png" }], "anexa A");
    console.log("  files agora:", await listarFiles(pageId));

    // 3) captura A como o GET devolve (type "file")
    const get = await api(`pages/${pageId}`, { method: "GET" });
    const fileA = get.data.properties[PROP_FILES].files[0];
    console.log("  fileA (como vem do GET):", JSON.stringify(fileA).slice(0, 120) + "...");

    // 4) anexa B preservando A — TENTATIVA 1: reenviar o objeto type "file"
    console.log("\nTENTATIVA 1: PATCH [fileA(type file) + B(file_upload)]");
    const idB = await uploadArquivo("B.png");
    const ok1 = await setFiles(
      pageId,
      [fileA, { type: "file_upload", file_upload: { id: idB }, name: "B.png" }],
      "preserva via type:file"
    );
    console.log("  files agora:", await listarFiles(pageId));

    // 5) TENTATIVA 2: reusar o id de upload do A
    console.log("\nTENTATIVA 2: PATCH [A(file_upload id reutilizado) + C(file_upload)]");
    const idC = await uploadArquivo("C.png");
    const ok2 = await setFiles(
      pageId,
      [
        { type: "file_upload", file_upload: { id: idA }, name: "A.png" },
        { type: "file_upload", file_upload: { id: idC }, name: "C.png" },
      ],
      "preserva via id reutilizado"
    );
    console.log("  files agora:", await listarFiles(pageId));

    console.log("\n=== RESUMO ===");
    console.log("Tentativa 1 (reenviar type:file):", ok1 ? "PATCH aceito" : "REJEITADO");
    console.log("Tentativa 2 (reusar upload id):", ok2 ? "PATCH aceito" : "REJEITADO");
  } finally {
    // 6) arquiva a pagina de teste
    console.log("\nArquivando pagina de teste...");
    const arch = await api(`pages/${pageId}`, { method: "PATCH", json: { archived: true } });
    console.log("  arquivada ok=", arch.ok);
  }
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
