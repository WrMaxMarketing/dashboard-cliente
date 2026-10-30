# Landing · Grupo exclusivo Dr. Romilto Pacheco

Uma página com duas seções (laudas), servida por um servidor Node.js sem dependências:

1. **Lauda 01 · Apresentação**: quem é o Dr. Romilto (formação, atuação, ensino, registros CRM/RQE).
2. **Lauda 02 · Grupo exclusivo**: convite para o grupo de bastidores (centro cirúrgico, hemodinâmica, plantões, vida fora do hospital), com botão de entrada.

## Rodar

```bash
cd landing-romilto
GROUP_URL="https://chat.whatsapp.com/SEU-LINK" npm start
```

Abra http://localhost:3000. Variáveis de ambiente:

| Variável    | Padrão    | Uso                                     |
|-------------|-----------|-----------------------------------------|
| `GROUP_URL` | `#entrar` | Link do grupo (WhatsApp, Telegram etc.) |
| `PORT`      | `3000`    | Porta do servidor                       |

Sem `GROUP_URL`, o botão mostra "Link do grupo em breve".

## Estrutura

```
server.js            servidor HTTP (estáticos, injeção do GROUP_URL, Range para vídeo)
public/index.html    as duas laudas
public/styles.css    estilo (preto cinematográfico, dourado, HUD de câmera)
public/assets/       fotos e vídeo do Drive do cliente, já otimizados
```

## Imagens (Drive do cliente)

- `retrato-cerebro.jpg`, `bastidor-centro-cirurgico.jpg`, `bastidor-plantao.jpg`: GRAVAÇÕES 2026 / PENDRIVE · FOTOS EM CAMPO
- `sala-hemodinamica.jpg`: VÍDEOS EDITADOS (capa recortada, sem o texto sobreposto)
- `familia-davi.jpg`: DIA DOS PAIS
- `paramentacao.mp4`: CIRURGIAS 1909 / Cirurgia 1809 (apenas os 2 s iniciais, sem paciente em quadro)

Compliance CFM 2.336/2023: nenhum paciente aparece ou é identificado, não há superlativos nem promessa de resultado, e os registros CRM/RQE estão no rodapé.
