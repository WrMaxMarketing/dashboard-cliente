# Auditoria de UI & Design Visual — desktop e mobile (mobile-first)

Varredura de **design visual** (hierarquia, tipografia, cor, espaçamento, elevação,
iconografia, consistência) — complementar à auditoria de UX (interação/acessibilidade)
em `auditoria-ux.md`. Estado avaliado: após as correções de UX.
Severidade: 🔴 alta · 🟠 média · 🟡 baixa.

---

## A. Sistêmico — tokens de design (maior alavancagem, afeta tudo)

### A1. 🔴 Paleta 100% neutra: nenhuma cor de marca
`globals.css:51-116` — todos os tokens são `oklch(… 0 0)` (croma 0 = cinza). `--primary` é só um quase-preto (claro) / quase-branco (dark); `--ring` e `--chart-*` são cinza. CTAs, foco e estados ativos ficam sem identidade — o produto lê como wireframe/shadcn default.
→ Introduzir uma hue de marca WRMAX e derivar `--primary`, `--ring`, `--sidebar-primary` dela. Manter secondary/muted/accent neutros.

### A2. 🔴 Faltam tokens semânticos `success`/`warning`/`info`
`globals.css:7-48` só expõe `--destructive`. Resultado: emerald/amber/red **hard-coded** espalhados (aprovar, avisos, badges, sucesso do admin) — tom, contraste e dark mode imprevisíveis por tela.
→ Criar pares claro/escuro + `-foreground` + versão tonal `/10`, mapear em `@theme inline`, e adicionar variantes correspondentes em `Button`, `Badge` e `Sonner`. Ex.:
`--success: oklch(0.62 0.15 150)` · `--warning: oklch(0.75 0.15 80)` · `--info: oklch(0.60 0.13 240)`.

### A3. 🔴 `font-heading` é usado mas **não existe** — sem escala tipográfica
`card.tsx:41` e `alert-dialog.tsx:126` aplicam `font-heading`, mas `@theme inline` só define `--font-sans`/`--font-mono`. A utilitária não resolve → títulos herdam a sans, sem par tipográfico. O `@layer base` (`globals.css:119-129`) não define escala (h1–h6, tamanho, leading, tracking).
→ Definir `--font-heading` (mesmo que aponte para a sans com peso/tracking próprios) + tokens `--text-*` com line-height/tracking; defaults de heading no `@layer base`. Considerar uma face de display para dar personalidade de marca.

### A4. 🟠 Elevação incoerente: três linguagens de profundidade
Card usa `ring-1 ring-foreground/10` (`card.tsx:15`); Select/Popover usa `shadow-md ring-1` (`select.tsx:72`); AlertDialog usa `ring-1` sem shadow (`alert-dialog.tsx:61`). Não há tokens `--shadow-*`.
→ Criar escala `--shadow-xs..lg` e convenção: card=xs, dropdown=md, dialog=lg. Aplicar nos três.

### A5. 🟠 Sem escala de raio consistente — `rounded` (4px) cru é o intruso
Convivem `rounded-lg` (10px, containers/button/input), `rounded-md` (8px, cards internos/avisos/editor) e `rounded` (4px hard-coded) em thumbnails (`request-change.tsx:224,235`, media-gallery). Cantos concêntricos desalinhados (thumbnail mais "quadrado" que o card).
→ Padronizar: container `rounded-lg`, caixas internas `rounded-md`, thumbnails `rounded-md` (nunca `rounded`). Cards internos do kanban `rounded-lg` dentro de `rounded-lg` → interno vira `rounded-md` (`approval-board.tsx:598`).

### A6. 🟠 Token cromático órfão no dark (resíduo shadcn)
`globals.css:111` — `--sidebar-primary: oklch(0.488 0.243 264.376)` (azul-violeta) só no dark; no claro é neutro. Única cor cromática do sistema, inconsistente entre temas.
→ Alinhar aos dois temas (neutralizar ou apontar para a `--primary` de marca).

### A7. 🟠 Peso da ação destrutiva: sem CTA sólido de perigo
`button.tsx:19-20` — `destructive` é tonal (baixo peso); `AlertDialogAction` sai como `default` (sólido **neutro**). Confirmações críticas (reprovar/excluir) não têm o peso vermelho esperado.
→ Adicionar `destructive-solid` (`bg-destructive text-white hover:bg-destructive/90`) e usá-la no CTA principal de dialogs de perigo. Promover também um `destructive-ghost` (hoje montado à mão em vários lugares).

### A8. 🟡 Estados de formulário e micro-tokens
- `textarea.tsx:10` sem os modificadores `dark:aria-invalid:*` que o `input.tsx:11` tem → erro mais fraco no dark. 🟠
- `transition-colors` (input/select) × `transition-all` (button) — foco/borda animam diferente. 🟡
- `button.tsx:12` hover `/80` (salto grande) × secondary `color-mix 5%`; sem escurecer no `active:`. 🟡
- `--muted-foreground` claro `oklch(0.556)` no limite AA (~4.5:1). 🟡
- `--card-spacing` é local no Card; dialog usa `p-4` cru → densidade sem token único. 🟡
- Overlay `bg-black/40` hard-coded (não token por tema). 🟡
- `skeleton.tsx:7` raio fixo `rounded-md` + `animate-pulse` (sem shimmer). 🟡
- `charts 1-5` todos cinza (indistinguíveis se houver dataviz). 🟡

---

## B. Cor & semântica

### B1. 🔴 Colisão amber / orange / yellow para "atenção"
Três matizes quentes quase idênticos disputam a mesma semântica: `amber-500` (Alteração solicitada, avisos, hint, glow da coluna, dialog de boas-vindas), `orange-500` (badge "N ajustes"), `yellow-500` (formato carrossel). Amber e orange são vizinhos → lado a lado (`approval-board.tsx:357-373`) leem como "a mesma cor" e anulam a distinção. Carrossel precisa de `text-yellow-800` (vs `-700` dos outros) porque o amarelo é claro demais — sinal de escolha problemática.
→ Reservar UM matiz por significado (amber = atenção/status; success = emerald). "Ajustes" não é urgente → cinza/neutro. Formato carrossel → matiz frio (ex.: violet) para não competir com atenção.

### B2. 🟠 Shade dark do âmbar inconsistente + alphas de badge divergentes
`dark:text-amber-400` (badges) × `dark:text-amber-300` (caixas de aviso) × `text-amber-600` (ícone do dialog, `:643`) × `text-amber-700` (badges). Bordas ora `/50` ora `/60`, fundos ora `/15` ora `/20` (`formatoBadgeClass` `:68-81`).
→ Fixar escala única: `border /50`, `bg /15`, `text -700 / dark -300` — para todos.

### B3. 🟠 `emerald` de "aprovar/sucesso" hard-coded fora do sistema
`approval-board.tsx:279` (`bg-emerald-600`) e `create-access-form.tsx:105` (`text-emerald-600 dark:text-emerald-500`) injetam verde numa identidade monocromática, sem par claro/escuro pensado, enquanto erro usa token (`text-destructive`).
→ Após A2, criar `variant="success"` no Button e `text-success`, espelhando o `destructive`.

### B4. 🟠 `glow` âmbar da coluna em destaque destoa do sistema plano
`approval-board.tsx:584-586` — `shadow-[0_0_14px_-2px_rgba(251,191,36,0.6)]` é o único brilho do app, alpha 0.6 forte, RGBA fixa; borda `border-amber-400/70` (shade/alpha diferentes dos badges).
→ Suavizar (alpha ~0.3–0.4, spread menor), derivar de token, alinhar borda a `/50`.

### B5. 🟡 Popup "arquivo grande" em vermelho para um aviso de contorno
`request-change.tsx:356-358` usa vermelho para "acima de 20 MB, use link de drive" — é orientação/bloqueio-brando, não erro destrutivo; eleva a gravidade percebida acima do aviso âmbar principal.
→ Considerar âmbar; reservar vermelho para falha real de envio.

### B6. 🟡 `themeColor` do dark não deriva do token
`layout.tsx:25-28` — `#242424` ≠ `--card` dark real (`oklch(0.205)` ≈ #262626); costura visível no topo (barra de status × header translúcido).
→ Alinhar ao valor real do `--card`/`--background`.

---

## C. Hierarquia & tipografia

### C1. 🔴 Inversão do wordmark entre login e header do app
`login/page.tsx:19-22` — wordmark = eyebrow pequeno/apagado, "Aprovação de Conteúdos" = título. `page.tsx:45-50` — os papéis **invertem**: "WRMAX MARKETING & IA" vira título e "Aprovação de Conteúdos" vira eyebrow. Leitura de marca inconsistente na transição login→app.
→ Fixar um padrão nos dois: recomendo wordmark sempre eyebrow + nome do produto como título.

### C2. 🟠 Eyebrow do wordmark com tamanhos diferentes entre telas irmãs
`login/page.tsx:19` (`text-sm`=14px) × `page.tsx:48` / `admin/page.tsx:53` (`text-[0.7rem]`≈11px). Mesmo elemento, escalas diferentes.
→ Um único token de eyebrow (`text-xs uppercase tracking-[0.2em] text-muted-foreground`) reutilizado.

### C3. 🟠 "Salvar alterações" (ação primária) é `variant="outline"` — hierarquia fraca
`body-editor.tsx:121-127` — a ação principal (salvar antes de aprovar) não é preenchida; o irmão `request-change.tsx:340` trata "Enviar" como `default` preenchido. No mobile viram dois botões cinza lado a lado sem âncora.
→ Quando `dirty`, "Salvar alterações" = `variant="default"` (ou success); Descartar segue ghost.

### C4. 🟠 Indicador "não salvo" em cinza (muted), sem cor de atenção
`body-editor.tsx:107-109` — `● Alterações não salvas` fica todo `text-muted-foreground`, mesmo cinza do estado neutro; o `●` é glifo hard-coded no texto.
→ Quando `dirty`, âmbar (`text-amber-600 dark:text-amber-400`) + dot real (`bg-amber-500`).

### C5. 🟠 Eyebrows internos com tracking/peso inconsistentes
`approval-board.tsx:424/465` ("Mídias"/"Sua decisão" = `tracking-[0.18em]`, peso normal) × `:559` (rótulo de coluna = `font-semibold tracking-[0.12em]`). Mesmo papel, estilos diferentes.
→ Uma classe utilitária única de eyebrow.

### C6. 🟡 Tamanho de título de card sem regra
`admin/page.tsx:71` `CardTitle` herda `text-base` × cards de login usam `text-xl` (`login/page.tsx:22`). Dois tamanhos de "título de card" sem hierarquia clara.

### C7. 🟡 Blocos do Notion (código morto, mas se reusar)
`notion-blocks.tsx`: inline code `text-primary` (colorido) × bloco `text-foreground/90` (neutro), nenhum com `font-mono` (`:27` vs `:120-125`); callout ≡ bloco de código visualmente (`:96-104` vs `:120-125`, sem acento/cor); ritmo de `mt` dos headings não progride (h1=h2=`mt-2`); corpo `text-[0.95rem]` arbitrário; parágrafo vazio `h-3` soma com `space-y-3` (vão duplo); checkbox nativo (`:108`); casing/`ImageOff` para "Anexo" (ícone de "imagem quebrada" onde há link válido — usar `Paperclip`).

---

## D. Componentes duplicados — extrair para travar consistência

### D1. 🟠 Caixa de aviso âmbar reinventada em 3 lugares
`approval-board.tsx:441-447` (hint, `border-dashed /40`, `text-xs`, `PencilLine size-3.5`) × `action-notices.tsx:38-39` (`border /50` sólido, `text-sm font-medium`, `AlertTriangle size-4`, `dark:amber-300`) — mesmo padrão, borda/peso/tamanho/ícone/shade diferentes.
→ Extrair `<Notice tone="warning|info|success">` com escala única.

### D2. 🟠 Icon-button reinventado com linguagens diferentes
No mesmo card da galeria: remover = `rounded-full p-2.5` (pílula) × baixar = `rounded p-2` (quadrado) (`media-gallery.tsx:97-106` vs `117-126`). No editor de descrição: check/lápis feitos à mão `rounded-md` colados a um `Input` `rounded-lg` (`request-change.tsx:263-287`). Opacity disabled 40 (`zoomable-image`) × 50 (resto).
→ Um único icon-button (`Button size="icon-sm"`), mesmo raio/padding/opacity.

### D3. 🟠 Headers e cards de auth duplicados e divergentes
Header do app (`page.tsx:42`, sticky + blur, `max-w-5xl`) × header do admin (`admin/page.tsx:47`, opaco, não-sticky, `max-w-3xl`). Cards de login/admin quase idênticos mas copiados.
→ Extrair `<AppHeader>` e `<AuthCard>` (eyebrow + title + description + slot).

---

## E. Layout & composição

### E1. 🟠 Admin: header largo × conteúdo estreito desalinhados
`admin/page.tsx:48` header `max-w-3xl` × `:73` conteúdo `max-w-md` centralizado. A borda do título não alinha com a do card — layout parece inacabado.
→ Mesma `max-w` para header e conteúdo, ou alinhar o card à esquerda no mesmo container.

### E2. 🟠 Header do admin sem a elevação do app
`admin/page.tsx:47` `border-b bg-card` opaco, sem sticky/blur × app translúcido sticky. Material inconsistente entre superfícies irmãs.
→ Mesmo recipe (idealmente componente único, ver D3).

### E3. 🟠 Empty state fora do padrão de Card
`page.tsx:79` "Conta sem cliente associado" usa `rounded-lg border bg-muted/40` × Card do sistema `rounded-xl … ring-1 ring-foreground/10` (`card.tsx:15`). Cantos e borda destoam. Idem `approval-board.tsx` "Tudo em dia" e o glifo `✦` (`:302`) — único floreio, caractere solto em vez de ícone lucide.
→ Usar `<Card>`; trocar `✦` por ícone lucide (`Sparkles`/`CheckCircle2`).

### E4. 🟡 Galeria: vídeo letterboxed × imagem cropada; nome duplicado; grade trava em 3
`media-gallery.tsx:88` (`object-contain bg-black`) × `:81` (`object-cover`) → ritmo quebrado na grade quadrada. Nome do arquivo aparece 2× no tile de arquivo (`:93` e `:113`). `sm:grid-cols-3` nunca cresce (`:71`) → tiles grandes demais no detalhe largo (`lg:grid-cols-4`).

### E5. 🟡 `bg-muted/40` × `bg-muted/30` em containers irmãos
`request-change.tsx:174` (`/40`) × `ver-ajustes.tsx:47` (`/30`) — mesma função (caixa de seção). Unificar em `/40`.

---

## F. Micro-inconsistências (baixas, mas somam)

- `approval-board.tsx:399` `mr-1.5` + gap do botão redundante; media-gallery `:154` usa `mr-1` (divergente). → remover `mr-*`, deixar o `gap`.
- Badges: uns omitem `text-xs`, outros repetem; vários forçam `font-semibold` sobre o `font-medium` do componente (`approval-board.tsx:347-372` vs `612-624`). → padronizar.
- `ver-ajustes.tsx:48-64` cabeçalho de accordion sem `hover:bg`/`active:` (único interativo grande sem feedback). → `hover:bg-muted/60 rounded-lg`.
- `ver-ajustes.tsx:100-102` caption `uppercase tracking-wide` órfã (nenhum outro caption é caixa-alta).
- `ver-ajustes.tsx:106-119` tira de thumbnails `w-auto` em flex-wrap → fileira "dente de serra". → `aspect-square object-cover`.
- `request-change.tsx:201-207` Textarea protagonista sem `min-h` → nasce curta. → `min-h-24`.
- `create-access-form.tsx:68-73` botão "olho" sem `focus-visible`/`rounded`. → recipe de foco do sistema.
- `action-notices.tsx:42-61` dois avisos âmbar idênticos empilhados (mesmo ícone) → diferenciar (`Clock` para horário, `AlertTriangle` para a regra).
- `select.tsx:72` string de classe mal formatada (manutenção); `SelectTrigger` base `w-fit` (mobile quase sempre quer `w-full`).
- `zoomable-image.tsx` `bg-white/10` nos controles sobre imagem clara — considerar `/15` + `ring-1 ring-white/20`.
- Sem favicon/apple-touch/manifest (`layout.tsx:17-20`) — branding fraco no "adicionar à tela".

---

## Recomendações de maior alavancagem (ordem sugerida)
1. **Introduzir cor de marca** (`--primary`/`--ring`/`--sidebar-primary`) — maior retorno percebido; hoje parece wireframe. (A1, A6)
2. **Tokens semânticos `success`/`warning`/`info`** (+ variantes em Button/Badge/Sonner) e resolver a **colisão amber/orange/yellow**. (A2, B1, B2, B3)
3. **Escala tipográfica real**: criar `--font-heading` (usado sem existir) + tokens `--text-*` + defaults de heading. (A3, C1, C6)
4. **Escala de sombra/elevação** única em card/select/dialog. (A4)
5. **Extrair `<Notice>`, icon-button, `<AppHeader>`, `<AuthCard>`** — elimina de uma vez a maioria das divergências entre irmãos. (D1–D3, E1–E3)
6. **Hierarquia**: wordmark consistente, "Salvar" preenchido, "não salvo" em âmbar, `destructive-solid`. (C1, C3, C4, A7)
7. **Padronizar raios** (fim do `rounded` 4px) e badges (shade/alpha únicos). (A5, B2, F)
