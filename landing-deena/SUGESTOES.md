# Sugestões para aumentar a conversão (Deena · LP CNPJ)

## 1. Validar antes de subir (pendências)
- [ ] **Cancelamento e fidelidade**: a página diz "cancele quando quiser" e "sem multa". Confirmar com a Deena.
- [ ] **Franquia de 10 processos** em todos os planos: o PDF só deixa isso explícito no Essencial. Confirmar.
- [ ] **Textos sobre o Domicílio Judicial Eletrônico** (prazo de confirmação, multa, leitura tácita): revisar com os sócios do escritório.
- [ ] CNPJ, razão social e e-mail do DPO no rodapé e na política de privacidade.
- [ ] Gateway: criar um link de assinatura recorrente por plano (Asaas, Pagar.me, Mercado Pago ou Stripe) e definir a URL de retorno `/obrigado?plano=<id>&ref=<ref>`.
- [ ] Gravar o VSL (A5) e definir `VSL_EMBED_URL`.

## 2. Oferta e preço
1. **Âncora no Premium**: ele já aparece destacado e vem primeiro no mobile. Testar um selo "Mais escolhido" no Estratégico para empurrar o ticket médio.
2. **Plano anual com desconto** (ex.: 2 meses grátis). Aumenta o LTV e reduz o churn.
3. **Garantia de 7 dias** (o CDC já dá esse direito em compra online). Mostrar como selo perto do botão costuma reduzir a objeção.
4. **Bônus de entrada**: "varredura retroativa dos últimos 90 dias" no 1º mês. Gera valor percebido imediato, mesmo que nenhum processo novo apareça.
5. **Preço por dia** ("menos de R$ 7 por dia") já está aplicado. Testar a comparação com o custo de uma condenação à revelia.

## 3. Copy: variações de headline para teste A/B
- A (atual): "Saiba de um processo contra sua empresa antes da citação oficial."
- B: "Sua empresa pode já estar sendo processada. Descubra hoje, não no prazo final."
- C: "A citação agora chega por e-mail do tribunal. Quem está olhando a caixa da sua empresa?"
- D (dor financeira): "Evite bloqueio de conta por um processo que você nem sabia que existia."

## 4. Funil e recuperação
- **Lead do CNPJ**: o CNPJ informado no hero já é gravado em `/api/lead`. Ligar ao n8n para:
  - remarketing por WhatsApp e e-mail em até 1 hora para quem informou o CNPJ e não pagou;
  - público personalizado no Meta com o evento `CNPJInformado` sem `Purchase`.
- **Exit intent no desktop**: um popup com "Quer receber um relatório gratuito do seu CNPJ?" para captar e-mail.
- **Botão de WhatsApp flutuante** (já existe a variável `WHATSAPP_NUMERO`) para quem tem dúvida antes de pagar.

## 5. Prova e confiança
- Depoimentos de empresários ou contadores (com autorização) entre os planos e o FAQ.
- Números reais quando houver: "X CNPJs monitorados" e "Y alertas enviados".
- Um print real (anonimizado) de um alerta no WhatsApp, no lugar do painel ilustrativo do hero.
- Selos: site seguro (SSL), LGPD e o gateway de pagamento.

## 6. Público contadores (Lucas)
- Página própria `/contadores` com tabela por volume (ex.: 20, 50 ou 150 CNPJs) e modelo de revenda ou comissão.
- Material de apoio pronto para o contador repassar aos clientes (PDF e post).

## 7. Mídia (Meta Ads)
- Otimizar a campanha para `InitiateCheckout` até ter cerca de 50 `Purchase` por semana, e depois passar para `Purchase`.
- Criativos por dor: (1) citação eletrônica não aberta, (2) bloqueio de conta, (3) contador que protege a carteira.
- Medir `ContatoEscritorioParceiro` como conversão secundária. É ela que mede a ponte sistema → escritório.
- Implementar a **Conversions API** (servidor) além do pixel, deduplicando pelo `eventID` do pedido, que já vai no `Purchase`.

## 8. Compliance (manter)
- Nunca usar "parecer", "consultoria" ou "advogado responde" na copy do sistema.
- Não usar o nome nem a marca do escritório em anúncios da Deena: o contato parte do cliente (opt-in).
