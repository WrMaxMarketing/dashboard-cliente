# Prompt extraído do vídeo de referência (hambúrguer → pizza Forno Paulista)

## O que o vídeo original faz (engenharia reversa)
- **Formato:** vertical 9:16, cerca de 8s, comercial de comida cinematográfico, fundo preto.
- **Abertura:** os ingredientes flutuam "explodidos" em camadas empilhadas na vertical (exploded view), com espaço entre cada camada e levitando devagar.
- **Fogo:** chamas laranja surgem e crescem atrás do produto até tomar o fundo, com faíscas e brasas subindo.
- **Montagem:** as camadas descem uma a uma e se encaixam, de cima para baixo, até formar o produto montado e suculento.
- **Final:** produto montado, centralizado e parado, com o fogo ao fundo e fumaça entrando pelas laterais.
- **Câmera:** fixa, frontal, levemente de baixo (hero shot), em lente de produto de 85mm. Iluminação de recorte quente vinda de trás.

## Prompt (inglês: Veo 3, Kling, Seedance, Higgsfield)

```
Cinematic 9:16 food commercial, 8 seconds, pure black studio background.
An artisan pizza in EXPLODED VIEW: its layers float in mid-air, stacked vertically with clear gaps,
slowly levitating and gently rotating — from top to bottom: fresh green oregano and parsley flakes,
dollops of creamy white burrata, thin rings of glossy red onion, slices of smoked calabresa sausage
and diced ham, a sheet of melted golden mozzarella with drips hanging from its edge,
a layer of bright red tomato sauce, and at the bottom a puffy leopard-spotted Neapolitan crust
with charred blisters.
Orange flames ignite behind the stack and rise until they fill the background, glowing embers and
sparks drifting upward.
Then the layers drop one by one and land on top of each other with a satisfying soft impact,
cheese stretching, until the pizza is fully assembled on a round wooden board, steaming hot.
Final hero shot: the assembled pizza centered, a gloved hand lifting a slice with a long cheese pull,
thick white steam and smoke curling from the sides, flames softly blurred behind.
Locked-off camera, slightly low angle, 85mm product lens, shallow depth of field, warm rim light
from behind, high contrast, hyper-realistic food photography, appetizing, 4K, no text.
```

**Negative prompt:** `text, watermark, logo, burger, bread bun, deformed toppings, plastic look, cartoon, extra fingers`

> A pizza descrita é a mesma do estático da Forno Paulista: borda alta e tostada, calabresa, presunto, cebola roxa, burrata, orégano e salsinha, servida em tábua de madeira com luva preta.

## Versão animada feita aqui (motion procedural + foto real)
`scene.html` + `render.mjs` + `sfx.py` geram o `forno-paulista-cupom.mp4` (10s, 1080×1920, com som):

| Tempo | Cena |
|---|---|
| 0–2,4s | Fogo acende. As 7 camadas sobem e flutuam explodidas. Texto: "Camada por camada." |
| 2,4–3,4s | As camadas despencam e se encaixam, com tremor de câmera a cada impacto |
| 3,4–3,9s | Clarão de calor e match-cut para a **foto real** da pizza da Forno, com fumaça |
| 3,9–5,2s | Entram o logo e "CUPOM DE DESCONTO" letra a letra |
| 5,2s | O cupom **BEMVINDO** bate na tela com tremor e brilho |
| 5,6–10s | Selo 10% OFF girando, CTA "PEÇA AGORA" pulsando e as condições do cupom |

Para editar textos e cores, use o bloco `CFG` em `scene.html`. Para renderizar de novo:

```
node render.mjs video-mudo.mp4
python3 sfx.py
ffmpeg -i video-mudo.mp4 -i sfx.wav -c:v copy -c:a aac -shortest forno-paulista-cupom.mp4
```
