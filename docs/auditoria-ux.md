# Auditoria de UX — desktop e mobile (mobile-first)

Varredura completa da superfície de UI. Achados agrupados por tema (mais graves
primeiro). Cada item traz `arquivo:linha`, impacto e correção sugerida.
Severidade: 🔴 alta · 🟠 média · 🟡 baixa.

---

## A. Temas sistêmicos (afetam todas as telas)

### A1. 🔴 Alvos de toque abaixo de 44px em todo o design system
Os primitivos nascem compactos demais para toque (mínimo recomendado 44×44px — Apple HIG / WCAG 2.5.5):

| Primitivo | Classe | Altura | Arquivo |
|---|---|---|---|
| Button default | `h-8` | 32px | `components/ui/button.tsx:24` |
| Button sm | `h-7` | 28px | `button.tsx:27` |
| Button lg | `h-9` | 36px | `button.tsx:28` |
| Button icon | `size-8` | 32px | `button.tsx:29` |
| Input | `h-8` | 32px | `components/ui/input.tsx:11` |
| Select trigger | `h-8`/`h-7` | 32/28px | `components/ui/select.tsx:47` |
| Badge | `h-5` | 20px | `components/ui/badge.tsx:8` |
| Input `file:` | `file:h-6` | 24px | `input.tsx:11` |

**Correção:** escala de toque no mobile (ex.: `h-10 md:h-8` em button/input/select; hit-area mínima `min-h-11` para botões só-ícone). Onde não puder mexer no primitivo, passar `className` nas ações críticas (Aprovar/Reprovar/Solicitar alteração/Sair/login).

### A2. 🔴 `AlertDialog` sem `max-height`/scroll → rodapé inacessível
`components/ui/alert-dialog.tsx:61` não tem `max-height` nem `overflow`. Se título + mídia + descrição longa + footer excederem a viewport (telas baixas, landscape), o conteúdo transborda e **os botões do footer somem sem rolagem**. Atinge o popup de boas-vindas (`approval-board.tsx:620-655`), o gate de salvar (`474-505`) e o guard de sessão.
**Correção:** `max-h-[90dvh] overflow-y-auto` no content.

### A3. 🟠 Sem `viewport-fit=cover` e zero uso de safe-area
`app/layout.tsx` não exporta `viewport` com `viewportFit:"cover"`, então `env(safe-area-inset-*)` nunca vale. Combina com header sticky (`app/page.tsx:42`), diálogos e lightbox sem `env(...)`.
**Correção:** `export const viewport = { themeColor, viewportFit: "cover" }` e aplicar `env(safe-area-inset-*)` no header, footers e lightbox.

### A4. 🟠 Overflow horizontal / falta de `break-words` em conteúdo dinâmico
Como o app instrui o cliente a colar **links de drive** (URLs longas sem espaço), texto e imagens vindos do Notion/usuário estouram a viewport. Três abordagens divergentes para o mesmo risco:
- `components/notion-blocks.tsx:128-138` — imagem de bloco sem `max-w-full h-auto` → rolagem horizontal. 🟠
- `notion-blocks.tsx:41-52, 65-71` — parágrafos e links sem `break-words`. 🟠
- `notion-blocks.tsx:27` — `code` inline não quebra nem rola. 🟡
- `components/ver-ajustes.tsx:99` — `whitespace-pre-line` sem `break-words` → URL longa estoura a página inteira. 🟠
- `ver-ajustes.tsx:106-114` — imagem do ajuste sem `max-w-full`. 🟠
- `components/body-editor.tsx:97` — `overflow-hidden` no editor **corta** conteúdo largo/alças do BlockNote em vez de rolar. 🟠
- `app/layout.tsx:33` — sem `overflow-x-clip` global de segurança no `body`. 🟡
**Correção:** padronizar `break-words`/`overflow-wrap:anywhere` no wrapper de conteúdo; `max-w-full h-auto` nas imagens; `overflow-x-auto` no editor; rede de segurança `overflow-x-clip` no body.

### A5. 🟠 Affordances e sinal de perigo apenas no `hover:` (invisíveis no toque)
No mobile não há hover, então a sinalização some:
- `approval-board.tsx:287` (Reprovar) e `:498` (Descartar) — cor destrutiva só em `hover:text-destructive`. 🟠
- `components/media-gallery.tsx:98-106` — botão remover fica vermelho só no hover. 🟠
- `request-change.tsx:242,266,277` — remover/concluir/lápis de descrição só mudam no hover; o lápis fica `text-muted-foreground` (apagado) por padrão. 🟠
**Correção:** aplicar cor destrutiva/afordância no estado base e usar `active:`/`focus-visible:`.

### A6. 🟠 `aria-label` inconsistente em botões só-ícone
`zoomable-image.tsx` faz certo (aria-label em todos), mas:
- `media-gallery.tsx:98-106,115-124` — X (remover) e Download só têm `title` (inútil no toque). 🟠
- `request-change.tsx:237-245,261-269` — X e Check só têm `title`. 🟠
- `ver-ajustes.tsx:48-62` — accordion sem `aria-expanded`/`aria-controls`. 🟠
- `mode-toggle.tsx:14,20` — rótulo duplicado (`aria-label` + `sr-only`) e estático. 🟡
**Correção:** `aria-label` explícito em todo botão só-ícone; `aria-expanded` no accordion.

---

## B. Fluxo principal — quadro e detalhe do card

### B1. 🔴 Sem CTA fixo de Aprovar/Reprovar no mobile
`approval-board.tsx:442-458` — o painel de ação é `lg:sticky`, mas no mobile os botões ficam inline **depois do editor inteiro**; `pb-24` só reserva vazio. O cliente precisa rolar todo o conteúdo para decidir.
**Correção:** barra fixa no rodapé no mobile (`fixed bottom-0 inset-x-0 lg:static`) com safe-area.

### B2. 🟠 Botões de decisão < 44px
`approval-board.tsx:275-291` (Aprovar/Reprovar) e `:388-396` (Editar/Solicitar) usam Button default (32px). Largura ok (`[&>button]:w-full`), altura não.
**Correção:** `size="lg"`/`min-h-11` nesses botões.

### B3. 🟠 Breakpoints inconsistentes (md vs lg)
Quadro vira 4 colunas em `md:grid-cols-4` (`:511`) e o accordion é controlado por `md:` (`:523`), mas o detalhe só cria coluna lateral em `lg:grid-cols-[1fr_220px]` (`:334`). Em 768–1024px o quadro já é "desktop" e o detalhe ainda é "mobile".
**Correção:** padronizar o breakpoint (md nos dois, ou lg nos dois).

### B4. 🟠 "Voltar para o quadro" com alvo pequeno
`approval-board.tsx:320-326` — `<button>` só-texto `text-sm`, altura ~20px, principal saída da tela.
**Correção:** `py-2 -mx-2 px-2` ou `Button variant="ghost"` (≥44px).

### B5. 🟠 Galeria de mídia — botões minúsculos e sem rótulo
- `media-gallery.tsx:98-106` — remover (X) `p-1`+`size-4` ≈ 24px, sem `aria-label`, vermelho só no hover. 🔴
- `media-gallery.tsx:115-124` — download só-ícone ≈ 24px, sem `aria-label`. 🟠
- `media-gallery.tsx:140-149` — "Adicionar mídia" `size="sm"` (28px), incoerente com os demais botões de ação. 🟠
- `media-gallery.tsx:113` vs `:93` — truncamento divergente (`truncate` × `line-clamp-2 break-all`); nome sem `title`. 🟡
- `media-gallery.tsx:75` — `group` vestigial (remover é sempre visível); sem spinner por item ao remover. 🟡
- `media-gallery.tsx:131-151` — sem estado vazio no modo editável. 🟡

### B6. 🟠 Lightbox de imagem (`zoomable-image.tsx`)
- `:197-204` — `touchAction:"none"` desativa **pinch-to-zoom** nativo; no mobile sobra só tap 1x↔2x. 🟠
- `:155-183` — botões zoom-/zoom+/fechar `p-2`+`size-5` ≈ 36px, colados (`gap-2`). 🟠
- `:142-209` — portal manual sem focus-trap/autofocus (foco vaza no teclado). 🟠
- `:151-153` — controles sem safe-area (podem ficar sob o notch). 🟡
- `:37-51` — sem fallback de erro/carregamento da imagem. 🟡

### B7. 🟠 Avisos com cor de erro onde deveria ser atenção
`components/action-notices.tsx:36-49` usa vermelho (`border-red-500/50 bg-red-500/10`) para avisos informativos ("apenas 2 alterações", "fora do horário útil"), enquanto o resto do app usa **âmbar** para atenção (`approval-board.tsx:435`, badges `:354/:362`). Na mesma tela de detalhe convivem caixa vermelha `text-sm` e âmbar `text-xs`.
**Correção:** padronizar em âmbar/warning; reservar vermelho para bloqueio real; unificar tipografia da caixa.

### B8. 🟡 Diálogos do board sem `max-height`/scroll
`approval-board.tsx:620-655` (lista de pendências cresce com nº de etapas) e `:474-505` — herdam o problema A2.

### B9. 🟡 Cores hard-coded fora das variantes
`approval-board.tsx:278` (`bg-emerald-600`) e `create-access-form.tsx:85-88` (`text-emerald-600`) — sucesso sem token semântico.
**Correção:** criar `variant="success"`/token `text-success`.

### B10. 🟠 Editor — barra de ações e overflow
- `body-editor.tsx:106-128` — barra `flex justify-between` sem `flex-wrap`: status + Descartar + Salvar disputam a linha no mobile. 🟠
- `body-editor.tsx:70-77,108` — save só por toast; status "dirty/salvando" sem `aria-live`, sem erro inline persistente. 🟡

### B11. 🟠 Solicitar alteração (`request-change.tsx`)
- `:237-245` — botão remover anexo (X) `-right-2 -top-2 p-1`+`size-3.5` ≈ 22px, colado à borda. 🔴
- `:302-311` — "Adicionar mídia" (ação primária) é o menor botão da tela, `size="sm"` (28px). 🟠
- `:261-269` — "Concluir descrição" (Check) ≈ 32px. 🟠
- `:280-284` — descrição truncada (`truncate`) esconde o link de drive colado. 🟠
- `:324-348` — Cancelar/Enviar em 32px; `Textarea`/inputs sem `maxLength`/contador. 🟡

### B12. 🟠 Ver ajustes (`ver-ajustes.tsx`)
- `:99` / `:106-114` — overflow (ver A4). 🟠
- `:48-62` — accordion sem ARIA (ver A6). 🟠
- `:116-125` — link "Anexo" ≈ 24px. 🟡
- `:73` — erro sem "tentar novamente". 🟡

### B13. 🟡 Notion blocks — conteúdo perdido/ não responsivo
- `notion-blocks.tsx:139-149` — tabelas do Notion caem no `default` e **somem** silenciosamente. 🟡
- `notion-blocks.tsx:72-89` — headings com tamanho fixo (não responsivo). 🟡

---

## C. Autenticação, sessão e admin

### C1. 🔴 Modal de expiração de sessão (bloqueante) com botões de 32px
`components/session-expiry-guard.tsx:121-128` — ESC e clique-fora bloqueados (`:92-93`); a única saída são botões default de 32px.
**Correção:** `h-11 w-full` nos botões do footer.

### C2. 🟠 Guard de sessão — feedback e a11y
- `:104-108` — erro de salvar é `<p>` sem `role="alert"`/`aria-live` (divergente dos forms). 🟠
- `:126` — "Entrar novamente" fica `disabled` sem troca de texto/spinner (o ramo com edição tem "Salvando…"). 🟠
- `:113-120` — "Descartar e sair" (destrutiva) é `ghost`/`muted`, afordância mais fraca que a primária, e perto dela → descarte acidental. 🟠

### C3. 🟠 Criar acesso (`create-access-form.tsx`)
- `:54-61` — senha em `type="text"` sempre visível, sem toggle mostrar/ocultar (exposição em público no mobile). 🟠
- `:91` — botão `disabled` quando falta cliente, sem explicar o motivo (feedback sutil `opacity-50`). 🟠
- `:42-77` — inputs e select em 32px. 🟠
- `:85-88` — sucesso hard-coded (ver B9). 🟡
- `:46,58` — `autoComplete="off"` não confiável em senha (usar `new-password`). 🟡
- inputs não ficam `disabled` durante `pending`. 🟡

### C4. 🟠 Logins cliente e admin (`login-form.tsx`, `admin-login.tsx`)
- CTA de submit e inputs em 32px (`login-form.tsx:18-44`, `admin-login.tsx:18-31`). 🟠
- `login-form.tsx:37-41` — erro inserido entre campos e botão causa **layout shift** no momento do toque. 🟡
- feedback de loading só troca texto (sem spinner); inputs não desabilitam no `pending`. 🟡
- `login/page.tsx` está correto para mobile (`min-h-dvh`, `max-w-sm`, `px-4`) — sem overflow. ✅

### C5. 🟠 Header e topo (`app/page.tsx` + `mode-toggle.tsx`)
- `page.tsx:42` — header `sticky top-0` sem `pt`/safe-area (encosta no notch). 🟠
- `page.tsx:52,58` — ModeToggle + "Sair" (`size="sm"`, 28px) colados com `gap-1` → sair acidental. 🟠
- `mode-toggle.tsx:11-16` — `size="icon"` (32px) em `absolute right-3 top-3` — alvo pequeno colado na borda. 🟠
- `page.tsx:48` — sub-rótulo `text-[0.65rem]` (~10px) uppercase + tracking largo: legibilidade ruim. 🟡

### C6. 🟡 Admin (`app/admin/page.tsx`)
- `:59-68` — "Sair" `size="sm"` (28px), `ghost`+`muted` (baixo contraste). 🟠
- `:57-68` — ModeToggle + Sair com `gap-1`. 🟠
- `:73` — card `max-w-md` × logins `max-w-sm` (larguras divergentes entre telas irmãs). 🟡
- admin usa `sm:` para padding/tipografia; logins são estáticos → abordagem responsiva inconsistente. 🟡

---

## D. Dark mode / contraste (`app/globals.css`)

- `:101-102` — bordas de input/card a 10–15% de branco: quase invisíveis em brilho alto (difícil ver onde tocar). 🟠
- `:97` — `--muted-foreground` (L≈0.708): placeholders/legendas em contraste limítrofe; validar ≥4.5:1. 🟠
- `:103` — `--ring` no dark (0.556): indicador de foco fraco (WCAG 2.4.7). 🟠
- `alert-dialog.tsx:39` — overlay `bg-black/10` claro demais: diálogo "flutua" sem foco no modo claro. 🟠
- `:119-129` — `@layer base` sem tipografia base (tamanho/line-height): escala 100% dependente de utilitários inline. 🟡

---

## E. Primitivos — inconsistências de sistema de design

- `button.tsx:12 vs 19-20` — `default` sólido × `destructive` tonal translúcido: par Aprovar/Reprovar com pesos visuais muito diferentes (reprovar parece "fantasma"). 🟠
- `select.tsx:47` — trigger `text-sm` (14px) × input `text-base` (16px) no mobile: incoerência de fonte entre campos lado a lado. 🟠
- `select.tsx:115` — `SelectItem py-1` (~28px): opções apertadas no toque. 🟠
- `select.tsx:63-64` — `position="item-aligned"` pode cobrir o trigger no mobile (`popper` é mais previsível). 🟡
- `badge.tsx:8,19-21` — variantes interativas (`ghost`/`link`) num elemento de 20px: alvo pequeno se usado como chip clicável. 🟠
- `alert-dialog.tsx:61` — `max-w-xs` (320px) + `w-full` sem gutter: encosta nas bordas em ~320px e fica estreito em telas maiores. Considerar bottom-sheet no mobile. 🟠
- `card.tsx:15` — `--card-spacing` 16px justo em telas ~320px. 🟡
- `button.tsx:12` — hover `bg-primary/80` fraco no dark (usar `color-mix` como o `secondary`). 🟡

---

## Pontos já corretos (não mexer)
- Inputs e textarea usam `text-base` (16px) no mobile → **sem zoom automático no iOS**. ✅
- `login/page.tsx` usa `min-h-dvh` (respeita a barra do navegador móvel). ✅
- `zoomable-image` tem `role="button"`, `tabIndex`, `onKeyDown` e `aria-label` nos controles. ✅
- `request-change` tem loading, validação de vazio, limite de 20 MB com orientação de drive. ✅
- `notion-blocks` — `pre` com `overflow-x-auto`, `rel="noopener"`, emoji `aria-hidden`. ✅
- `ver-ajustes` — estados de loading/erro/vazio presentes e coerentes. ✅
