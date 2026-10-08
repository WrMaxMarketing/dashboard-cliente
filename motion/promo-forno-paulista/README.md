# Promo Forno Paulista — Segunda e Quarta (motion)

Versão em motion design da arte "Promoção Segunda e Quarta" (Calabresa Especial e
Frango Especial, Tamanho G, R$ 45,90), feita com [HyperFrames](https://hyperframes.heygen.com)
em Node.js.

- Formato: 1080×1920 (Reels/Stories/TikTok), 15 s, 30 fps
- Fontes da arte original, embutidas localmente: Montserrat (PROMOÇÃO / PEÇA AGORA),
  Marcellus (SEGUNDA E QUARTA / nomes das pizzas), Oswald (Tamanho G / preço),
  Quicksand (ingredientes)
- Pizzas, logo e folhas recortados da arte original (`assets/src/original.png`)

## Roteiro

| Tempo       | Cena                                                                 |
| ----------- | -------------------------------------------------------------------- |
| 0 – 2.4 s   | Logo cai, "PROMOÇÃO" entra letra a letra, selo "PIZZA G POR R$45,90" |
| 2.2 – 6.7 s | Calabresa Especial: pizza gira para dentro, card desliza, preço rola |
| 3.4 – 10.9 s| Botão "PEÇA AGORA" fixo, pulsando com brilho                         |
| 6.5 – 11 s  | Frango Especial (espelhado)                                          |
| 10.8 – 15 s | Final: as duas pizzas, preço gigante, botão "PEÇA AGORA" com toque   |

## Comandos

```bash
npm run dev          # Studio do HyperFrames (editar visualmente)
npm run check        # lint + layout + motion + contraste
npm run render       # gera renders/promo-forno-paulista.mp4

# Versão interativa (player com "PEÇA AGORA" clicável e navegação por sabor)
ORDER_URL="https://link-do-pedido" npm run interactive   # http://localhost:4173
```

Requisitos: Node.js >= 22 e FFmpeg.
