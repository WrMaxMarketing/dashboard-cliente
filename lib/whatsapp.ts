// Envio de mensagem via Evolution API (self-hosted). Config por env:
//   EVOLUTION_API_URL   ex: https://sua-vps:8080
//   EVOLUTION_INSTANCE  nome da instancia
//   EVOLUTION_API_KEY   apikey da instancia
//   WHATSAPP_DESTINO    numero padrao (equipe), usado quando nenhum e informado
//   CLIENTES_WHATSAPP   JSON [{ "cliente": "Tmax", "numero": "5586..." }, ...]
//
// Formato do corpo conforme o curl do endpoint /message/sendText/{instance}.

// Numero de WhatsApp de um cliente, do mapa em CLIENTES_WHATSAPP. null se ausente.
export function numeroDoCliente(cliente: string): string | null {
  const raw = process.env.CLIENTES_WHATSAPP;
  if (!raw) return null;
  try {
    const lista = JSON.parse(raw) as Array<{ cliente?: string; numero?: string }>;
    const alvo = cliente.trim().toLowerCase();
    const found = lista.find((c) => c.cliente?.trim().toLowerCase() === alvo);
    return found?.numero?.trim() || null;
  } catch {
    return null;
  }
}

// Envia `texto`. Sem `numeroDestino`, usa WHATSAPP_DESTINO (equipe).
export async function enviarWhatsApp(
  texto: string,
  numeroDestino?: string
): Promise<void> {
  const url = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const numero = numeroDestino ?? process.env.WHATSAPP_DESTINO;

  if (!url || !instance || !apiKey || !numero) {
    throw new Error("Notificação por WhatsApp não está configurada.");
  }

  const res = await fetch(
    `${url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      // Evolution API v2: "text" no nivel raiz (v1 usava textMessage.text).
      body: JSON.stringify({
        number: numero,
        text: texto,
      }),
    }
  );

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    throw new Error(
      `Falha ao enviar WhatsApp (HTTP ${res.status}). ${detalhe}`.trim()
    );
  }
}
