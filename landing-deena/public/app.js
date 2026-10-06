(() => {
  const CFG = window.DEENA_CONFIG || { planos: {} };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const digits = (v) => String(v || "").replace(/\D/g, "");
  const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } },
  };

  const state = { cnpj: store.get("deena_cnpj") || "", plano: "premium", parceiro: false };

  // ---------- UTM ----------
  const params = new URLSearchParams(location.search);
  const utm = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
    if (params.get(k)) utm[k] = params.get(k);
  }
  if (Object.keys(utm).length) store.set("deena_utm", JSON.stringify(utm));
  const getUtm = () => { try { return JSON.parse(store.get("deena_utm") || "null"); } catch { return null; } };

  // ---------- Meta Pixel ----------
  if (CFG.pixelId) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    fbq("init", CFG.pixelId);
    fbq("track", "PageView");
  }
  const track = (evento, dados = {}, custom = false) => {
    if (window.fbq) fbq(custom ? "trackCustom" : "track", evento, dados);
    (window.dataLayer = window.dataLayer || []).push({ event: evento, ...dados });
  };
  track("ViewContent", { content_name: "Landing Monitoramento CNPJ", content_category: "assinatura" });

  // ---------- CNPJ ----------
  const maskCNPJ = (v) => {
    const d = digits(v).slice(0, 14);
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/\/(\d{4})(\d)/, "/$1-$2");
  };
  const maskTel = (v) => {
    const d = digits(v).slice(0, 11);
    if (d.length <= 2) return d.replace(/^(\d{0,2})/, "($1");
    if (d.length <= 6) return d.replace(/^(\d{2})(\d+)/, "($1) $2");
    if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
    return d.replace(/^(\d{2})(\d{5})(\d+)/, "($1) $2-$3");
  };
  const cnpjValido = (v) => {
    const c = digits(v);
    if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
    const dv = (base) => {
      let soma = 0, peso = base.length - 7;
      for (const n of base) { soma += Number(n) * peso--; if (peso < 2) peso = 9; }
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = dv(c.slice(0, 12));
    return c.endsWith(`${d1}${dv(c.slice(0, 12) + d1)}`);
  };

  $$('input[name="cnpj"], [data-mask="cnpj"]').forEach((i) => i.addEventListener("input", () => (i.value = maskCNPJ(i.value))));
  $$('[data-mask="tel"]').forEach((i) => i.addEventListener("input", () => (i.value = maskTel(i.value))));
  if (state.cnpj) $$('input[name="cnpj"]').forEach((i) => (i.value = maskCNPJ(state.cnpj)));

  const setCnpj = (c) => {
    state.cnpj = c;
    store.set("deena_cnpj", c);
    $$('input[name="cnpj"]').forEach((i) => (i.value = maskCNPJ(c)));
    $("#cnpj-chip-val").textContent = maskCNPJ(c);
    $("#cnpj-chip").classList.add("show");
  };
  if (state.cnpj && cnpjValido(state.cnpj)) setCnpj(state.cnpj);
  $("#cnpj-chip-edit").addEventListener("click", () => {
    $("#cnpj-hero").focus();
    $("#cnpj-hero").select();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ---------- modais ----------
  let lastFocus = null;
  const openModal = (id) => {
    lastFocus = document.activeElement;
    const m = $(id);
    m.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(() => { const f = $("input:not([type=checkbox]), button:not(.x)", m); if (f) f.focus(); }, 60);
  };
  const closeModal = (m) => {
    m.classList.remove("open");
    if (!$(".modal.open")) document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  };
  $$(".modal").forEach((m) => {
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-close]")) closeModal(m); });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$(".modal.open").forEach(closeModal); });

  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.erro || "Não foi possível enviar. Tente novamente.");
    return data;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- hero / CTA final: CNPJ -> varredura -> planos ----------
  $$("[data-cnpj-form]").forEach((form) => {
    const msg = form.nextElementSibling;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const c = digits(form.cnpj.value);
      if (!cnpjValido(c)) {
        msg.textContent = c.length ? "Esse CNPJ não parece válido. Confira os números." : "Digite o CNPJ da sua empresa.";
        form.cnpj.focus();
        return;
      }
      msg.textContent = "";
      setCnpj(c);
      track("CNPJInformado", { origem: form.dataset.cnpjForm }, true);
      post("/api/lead", { cnpj: c, origem: form.dataset.cnpjForm, utm: getUtm() }).catch(() => {});
      runScan(c);
    });
  });

  async function runScan(c) {
    $("#scan-cnpj").textContent = maskCNPJ(c);
    $("#scan-company").classList.remove("show");
    const go = $("#scan-go");
    go.disabled = true;
    const steps = $$(".scan-list li");
    steps.forEach((li) => { li.className = ""; $(".st", li).innerHTML = ""; });
    openModal("#m-scan");

    const done = (li) => { li.className = "done"; $(".st", li).innerHTML = '<svg width="13" height="13"><use href="#i-check"/></svg>'; };
    steps[0].className = "run"; await wait(650); done(steps[0]);
    steps[1].className = "run";
    const [info] = await Promise.all([
      fetch(`/api/cnpj/${c}`).then((r) => r.json()).catch(() => null),
      wait(900),
    ]);
    if (info && info.encontrado && info.razaoSocial) {
      $("#scan-razao").textContent = info.nomeFantasia || info.razaoSocial;
      $("#scan-meta").textContent = [info.nomeFantasia ? info.razaoSocial : null, info.situacao && `Situação: ${info.situacao}`, info.municipio && `${info.municipio}/${info.uf}`].filter(Boolean).join(" · ");
      $("#scan-company").classList.add("show");
    }
    done(steps[1]);
    steps[2].className = "run"; await wait(750); done(steps[2]);
    go.disabled = false;
    go.focus();
  }
  $("#scan-go").addEventListener("click", () => {
    closeModal($("#m-scan"));
    $("#planos").scrollIntoView({ behavior: "smooth" });
  });

  // ---------- checkout ----------
  const coForm = $("#form-checkout");
  const selectPlan = (id) => {
    const p = CFG.planos[id];
    if (!p) return;
    state.plano = id;
    $("#co-plan").textContent = p.nome;
    $("#co-price").textContent = brl(p.preco);
    $$("[data-switch]").forEach((b) => b.classList.toggle("on", b.dataset.switch === id));
    $("#co-partner-wrap").hidden = id !== "premium";
    if (id !== "premium") coForm.contatoParceiro.checked = false;
  };
  const openCheckout = (id, origem) => {
    selectPlan(id);
    if (state.cnpj) coForm.cnpj.value = maskCNPJ(state.cnpj);
    coForm.contatoParceiro.checked = id === "premium" && state.parceiro;
    $(".msg", coForm).textContent = "";
    openModal("#m-checkout");
    const p = CFG.planos[id];
    track("InitiateCheckout", { content_name: p.nome, value: p.preco, currency: "BRL", origem });
  };
  $$("[data-plan]").forEach((b) => b.addEventListener("click", () => { state.parceiro = false; openCheckout(b.dataset.plan, "card"); }));
  $$("[data-switch]").forEach((b) => b.addEventListener("click", () => selectPlan(b.dataset.switch)));

  coForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $(".msg", coForm);
    const btn = $('button[type="submit"]', coForm);
    const f = coForm;
    if (!cnpjValido(f.cnpj.value)) { msg.className = "msg err"; msg.textContent = "Confira o CNPJ."; f.cnpj.focus(); return; }
    btn.disabled = true;
    msg.className = "msg";
    msg.textContent = "Gerando seu pedido…";
    try {
      const r = await post("/api/checkout", {
        plano: state.plano,
        cnpj: digits(f.cnpj.value),
        nome: f.nome.value,
        email: f.email.value,
        whatsapp: digits(f.whatsapp.value),
        contatoParceiro: f.contatoParceiro.checked,
        lgpd: f.lgpd.checked,
        termos: f.termos.checked,
        utm: getUtm(),
      });
      setCnpj(digits(f.cnpj.value));
      store.set("deena_pedido", JSON.stringify({ plano: state.plano, ref: r.pedido }));
      msg.textContent = "Redirecionando para o pagamento seguro…";
      location.href = r.redirect;
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = err.message;
      btn.disabled = false;
    }
  });

  // ---------- escritório parceiro (evento separado, opt-in) ----------
  const ptForm = $("#form-partner");
  $$("[data-partner]").forEach((b) => b.addEventListener("click", () => {
    track("ContatoEscritorioParceiro_Clique", { origem: b.dataset.partner }, true);
    $(".msg", ptForm).textContent = "";
    openModal("#m-partner");
  }));
  ptForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $(".msg", ptForm);
    if (!ptForm.consentimento.checked) { msg.className = "msg err"; msg.textContent = "Marque a autorização para seguirmos."; return; }
    try {
      await post("/api/contato-parceiro", { consentimento: true, cnpj: state.cnpj, origem: "plano-premium" });
      track("ContatoEscritorioParceiro", { plano: "premium" }, true);
      state.parceiro = true;
      closeModal($("#m-partner"));
      openCheckout("premium", "parceiro");
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = err.message;
    }
  });

  // ---------- contadores ----------
  const accForm = $("#form-contadores");
  accForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $(".msg", accForm);
    const btn = $('button[type="submit"]', accForm);
    btn.disabled = true;
    try {
      await post("/api/contadores", {
        nome: accForm.nome.value, escritorio: accForm.escritorio.value, email: accForm.email.value,
        whatsapp: digits(accForm.whatsapp.value), carteira: accForm.carteira.value, lgpd: accForm.lgpd.checked,
      });
      track("Lead", { content_name: "Parceria Contadores" });
      msg.className = "msg ok";
      msg.textContent = "Recebido! Nossa equipe retorna em até 1 dia útil.";
      accForm.reset();
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- VSL ----------
  $("#vsl .play").addEventListener("click", () => {
    track("VSL_Play", {}, true);
    if (!CFG.vslUrl) {
      $("#vsl .cap").innerHTML = "<b>Vídeo em produção.</b>Configure VSL_EMBED_URL no servidor para exibir o VSL.";
      return;
    }
    const u = new URL(CFG.vslUrl);
    u.searchParams.set("autoplay", "1");
    $("#vsl").innerHTML = `<iframe src="${u}" title="Vídeo Deena" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  });

  // ---------- reveal + barra fixa ----------
  const io = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }), { threshold: 0.12 });
  $$(".reveal").forEach((el) => io.observe(el));

  const sticky = $("#sticky-cta");
  const heroForm = $(".hero .cnpj-form");
  const plans = $("#planos");
  let heroVisible = true, plansVisible = false;
  const upd = () => sticky.classList.toggle("show", !heroVisible && !plansVisible);
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; upd(); }).observe(heroForm);
  new IntersectionObserver(([en]) => { plansVisible = en.isIntersecting; upd(); }, { threshold: 0.05 }).observe(plans);

  // feed ilustrativo rotativo no hero
  const exemplos = [
    ["Nova ação distribuída", "Reclamação trabalhista · Vara do Trabalho · Valor da causa R$ 32.900,00"],
    ["Nova ação distribuída", "Execução de título · Vara Cível · Valor da causa R$ 15.750,00"],
    ["Nova ação distribuída", "Ação de cobrança · 2ª Vara Cível · Valor da causa R$ 48.300,00"],
  ];
  let k = 0;
  setInterval(() => {
    const it = $("#feed .alert-item");
    if (!it || document.hidden) return;
    k = (k + 1) % exemplos.length;
    const clone = it.cloneNode(true);
    $("b", clone).textContent = exemplos[k][0];
    $("p", clone).textContent = exemplos[k][1];
    it.replaceWith(clone);
  }, 4200);

  $("#ano").textContent = new Date().getFullYear();
})();
