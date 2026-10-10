# Forno Paulista — Oferta Especial do Dia: combo Terça e Quinta (motion)

Versão em motion design da arte "Oferta Especial do Dia — Terça e Quinta" (Calabresa Especial Tamanho G +
Coca-Cola 600ml por R$ 60,90), feita com [HyperFrames](https://hyperframes.heygen.com)
em Node.js.

- Formato: 1080×1920 (Reels/Stories/TikTok), 15 s, 30 fps
- Fontes da arte original, embutidas localmente: Montserrat (OFERTA ESPECIAL / PEÇA AGORA),
  Marcellus (TERÇA E QUINTA / nomes), Oswald (Tamanho G / preço), Quicksand (ingredientes)
- Garrafa a partir do PNG enviado (`assets/src/coca-png-original.png`): fundo removido,
  plástico do gargalo translúcido, cor aquecida e reflexo vermelho na borda para casar com
  a luz da cena, sombra direcional + sombra de contato e brilho animado. Pizza, logo e
  folhas reaproveitados de `../promo-forno-paulista`

## Roteiro

| Tempo        | Cena                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| 0 – 2.9 s    | Pizza em destaque abre o vídeo (raios + "Calabresa Especial · Tamanho G"),|
|              | "OFERTA ESPECIAL" letra a letra, selo "DO DIA" + "TERÇA E QUINTA";        |
|              | a pizza voa até o lugar dela no card                                      |
| 2.4 – 11 s   | Card do combo: Coca cai quicando com sombra e solta bolhas,               |
|              | "+" gira, ingredientes, preço rola até R$ 60,90, etiqueta "COMBO"         |
| 3.4 – 10.9 s | Botão "PEÇA AGORA" fixo, pulsando com brilho                              |
| 10.8 – 15 s  | Final: pizza + Coca, "O COMBO SAI POR", preço gigante, toque no botão     |

## Comandos

```bash
npm run dev          # Studio do HyperFrames (editar visualmente)
npm run check        # lint + layout + motion + contraste
npm run render       # gera renders/promo-terca-quinta.mp4

# Versão interativa (player com "PEÇA AGORA" clicável e navegação por trecho)
ORDER_URL="https://link-do-pedido" npm run interactive   # http://localhost:4173
```

Requisitos: Node.js >= 22 e FFmpeg.
