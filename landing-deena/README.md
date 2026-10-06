# Deena · Landing de Monitoramento de CNPJ

Landing page de conversão (objetivo único: **assinatura do plano**) em Node.js + Express, seguindo o briefing "06 · LP CNPJ" (WRMax × Almeida, Pessoa & Caldas) e a apresentação da Deena.

## Rodar

```bash
cd landing-deena
cp .env.example .env   # preencha pixel, VSL, links do gateway
npm install
npm start              # http://localhost:3000
```

Requer Node 18+ (usa `fetch` nativo).

## Estrutura da página (ordem do briefing)

| # | Seção | Onde |
|---|-------|------|
| 01 | Hero com campo **Digite o CNPJ** + **Começar a monitorar** | `#topo` |
| 02 | VSL logo abaixo do hero (`VSL_EMBED_URL`) | `#vsl` |
| 03 | O problema: citação eletrônica em 3 blocos + linha do tempo "sem × com Deena" | `#problema` |
| 04 | Como funciona (CNPJ → monitoramento → alerta → resumo descritivo) + benefícios | `#como-funciona` |
| 05 | Planos em 3 colunas (R$ 200 / 400 / 600). Premium com **Quero conversar com um escritório parceiro** | `#planos` |
| 06 | Para contadores (formulário de parceria) | `#contadores` |
| — | Transparência: o que faz / o que não faz (observações importantes do PDF) | `#transparencia` |
| 07 | FAQ | `#faq` |
| 08 | Checkout: cartão de crédito, consentimento LGPD e termos (modal) | `#m-checkout` |
| 09 | Rodapé do sistema, sem vínculo publicitário com o escritório | `footer` |

### Fluxo de conversão
1. O visitante digita o CNPJ → máscara + validação dos dígitos verificadores.
2. Modal "Preparando o monitoramento" consulta os dados públicos (BrasilAPI) e mostra a razão social. É a microconversão que personaliza a oferta. Se a API falhar, o fluxo segue normalmente.
3. Rola até os planos com o selo "CNPJ pronto para monitorar".
4. Checkout em modal → `POST /api/checkout` grava o pedido e os consentimentos e redireciona ao **link do gateway** do plano (os dados do cartão não passam pelo servidor, então não há escopo PCI).
5. O gateway devolve para `/obrigado?plano=<id>&ref=<pedido>`, que dispara o **Purchase**.

## Eventos (Meta Pixel + `dataLayer`)

| Evento | Quando |
|---|---|
| `ViewContent` | carregamento da landing |
| `CNPJInformado` (custom) | CNPJ válido enviado no hero/CTA final |
| `InitiateCheckout` | abertura do checkout (com `value` e plano) |
| `Purchase` | página `/obrigado` (uma vez por pedido, `eventID` = ref) |
| `ContatoEscritorioParceiro_Clique` / `ContatoEscritorioParceiro` (custom) | clique e opt-in confirmado na ponte sistema → escritório, medidos à parte |
| `Lead` | formulário de contadores |
| `VSL_Play` (custom) | play no vídeo |

## API

| Rota | Função |
|---|---|
| `GET /api/cnpj/:cnpj` | valida e consulta dados públicos (cache em memória) |
| `POST /api/lead` | lead de topo (CNPJ + UTM) |
| `POST /api/checkout` | pedido + consentimentos → URL do gateway |
| `POST /api/contato-parceiro` | opt-in explícito para o escritório parceiro |
| `POST /api/contadores` | lead do programa de contadores |

Tudo é gravado em `data/*.jsonl` (fora do git) e, se `LEAD_WEBHOOK_URL` estiver definido, enviado ao webhook (n8n/Kommo). Sem gateway configurado, o checkout roda em **modo demonstração** e vai direto ao `/obrigado`.

## Compliance aplicado
- Nada de "parecer jurídico": a página fala sempre em **resumo descritivo**.
- O contato com o escritório só acontece com **opt-in** do cliente (checkbox desmarcado por padrão, apenas no Premium).
- Rodapé e seção de transparência deixam claro que a Deena é um sistema, não um escritório de advocacia.
- `termos.html` e `privacidade.html` são **modelos** e precisam ser revisados pelo jurídico.

Veja `SUGESTOES.md` para as recomendações de conversão.
