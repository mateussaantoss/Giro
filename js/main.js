(function () {
  "use strict";

  var WHATS_APP_NUMBER = "5500000000000";
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var header = document.getElementById("header");
  var nav = document.getElementById("nav");
  var navToggle = document.getElementById("navToggle");
  var progressEl = document.getElementById("scrollProgress");

  function onScroll() {
    if (header) {
      header.classList.toggle("scrolled", window.scrollY > 10);
    }
    if (progressEl) {
      var docEl = document.documentElement;
      var max = docEl.scrollHeight - window.innerHeight;
      progressEl.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      navToggle.classList.toggle("open", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
      document.body.classList.toggle("menu-open", open);
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Abrir menu");
        document.body.classList.remove("menu-open");
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Abrir menu");
        document.body.classList.remove("menu-open");
        navToggle.focus();
      }
    });
  }

  var revealEls = document.querySelectorAll(".card, .step, .faq-item, .flow");
  if (!reducedMotion && "IntersectionObserver" in window) {
    revealEls.forEach(function (el) {
      el.classList.add("reveal");
    });
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  var counters = document.querySelectorAll("[data-count]");
  if (!reducedMotion && "IntersectionObserver" in window && counters.length) {
    var counterObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          counterObserver.unobserve(el);
          var target = parseInt(el.getAttribute("data-count"), 10) || 0;
          var duration = 1400;
          var startTime = null;
          function tick(ts) {
            if (!startTime) startTime = ts;
            var progress = Math.min((ts - startTime) / duration, 1);
            progress = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(target * progress);
            if (progress < 1) {
              requestAnimationFrame(tick);
            }
          }
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach(function (el) {
      counterObserver.observe(el);
    });
  }

  var faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach(function (item) {
    var button = item.querySelector(".faq-q");
    button.addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      faqItems.forEach(function (other) {
        other.classList.remove("open");
        var otherBtn = other.querySelector(".faq-q");
        otherBtn.setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("open");
        button.setAttribute("aria-expanded", "true");
      }
    });
  });

  var billingButtons = document.querySelectorAll(".billing-option");
  var billing = "monthly";
  billingButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      billing = btn.getAttribute("data-billing");
      billingButtons.forEach(function (other) {
        other.classList.toggle("billing-active", other === btn);
        other.setAttribute("aria-pressed", other === btn ? "true" : "false");
      });
      document.querySelectorAll(".price-value").forEach(function (price) {
        price.textContent = billing === "yearly"
          ? price.getAttribute("data-yearly")
          : price.getAttribute("data-monthly");
      });
      document.querySelectorAll(".price-yearly-note").forEach(function (note) {
        var total = note.getAttribute("data-yearly-total");
        note.hidden = billing === "monthly" || !total;
      });
    });
  });

  var selectedPlan = "";
  document.querySelectorAll(".pricing-cta").forEach(function (cta) {
    cta.addEventListener("click", function () {
      selectedPlan = cta.getAttribute("data-plano") || "";
    });
  });

  var sections = document.querySelectorAll("main section[id]");
  var navLinks = document.querySelectorAll(".nav-link");
  var navLinkMap = {};
  navLinks.forEach(function (link) {
    var href = link.getAttribute("href");
    if (href && href.charAt(0) === "#") {
      navLinkMap[href.slice(1)] = link;
    }
  });

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            navLinks.forEach(function (l) {
              l.classList.remove("active");
            });
            var link = navLinkMap[entry.target.id];
            if (link) {
              link.classList.add("active");
            }
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach(function (s) {
      if (navLinkMap[s.id]) {
        spy.observe(s);
      }
    });
  }

  var form = document.getElementById("contactForm");
  var msgEl = document.getElementById("formMsg");
  var successEl = document.getElementById("formSuccess");
  var successWa = document.getElementById("successWa");
  var backBtn = document.getElementById("successBack");
  var whatsInput = document.getElementById("fWhats");

  function maskPhone(value) {
    var digits = value.replace(/\D/g, "").slice(0, 11);
    var out = digits;
    if (digits.length > 2) {
      out = "(" + digits.slice(0, 2) + ") " + digits.slice(2);
    }
    if (digits.length > 7) {
      out = out.slice(0, 10) + "-" + out.slice(10);
    }
    return out;
  }

  if (whatsInput) {
    whatsInput.addEventListener("input", function () {
      whatsInput.value = maskPhone(whatsInput.value);
    });
  }

  function field(id) {
    return document.getElementById(id);
  }

  function setError(input, errEl, message) {
    var wrapper = input.closest(".field");
    if (wrapper) {
      wrapper.classList.add("error");
    }
    if (errEl) {
      errEl.textContent = message;
    }
  }

  function clearError(input, errEl) {
    var wrapper = input.closest(".field");
    if (wrapper) {
      wrapper.classList.remove("error");
    }
    if (errEl) {
      errEl.textContent = "";
    }
  }

  function showMsg(type, text) {
    if (!msgEl) return;
    msgEl.className = "form-msg " + type;
    msgEl.textContent = text;
    msgEl.hidden = false;
  }

  function hideMsg() {
    if (msgEl) {
      msgEl.hidden = true;
      msgEl.className = "form-msg";
      msgEl.textContent = "";
    }
  }

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate() {
    var valid = true;
    var firstInvalid = null;

    var inputs = [
      { id: "fNome", err: "errNome", min: 2, msg: "Informe seu nome." },
      { id: "fOficina", err: "errOficina", min: 2, msg: "Informe o nome da oficina." },
      { id: "fWhats", err: "errWhats", min: 10, msg: "Informe um WhatsApp válido com DDD." },
      { id: "fEmail", err: "errEmail", min: 5, msg: "Informe um e-mail válido.", email: true },
      { id: "fCidade", err: "errCidade", min: 3, msg: "Informe cidade e estado." },
      { id: "fTamanho", err: "errTamanho", min: 1, msg: "Selecione o tamanho da oficina." },
      { id: "fMsg", err: "errMsg", min: 10, msg: "Escreva uma mensagem com pelo menos 10 caracteres." }
    ];

    inputs.forEach(function (item) {
      var input = field(item.id);
      var errEl = field(item.err);
      if (!input) return;

      var value = input.value.trim();
      if (item.id === "fWhats") {
        value = value.replace(/\D/g, "");
      }

      var isInvalid = false;
      var errorMsg = "";

      if (value.length < item.min) {
        isInvalid = true;
        errorMsg = item.msg;
      } else if (item.email && !emailRe.test(value)) {
        isInvalid = true;
        errorMsg = "Informe um e-mail válido.";
      }

      if (isInvalid) {
        valid = false;
        setError(input, errEl, errorMsg);
        if (!firstInvalid) {
          firstInvalid = input;
        }
      } else {
        clearError(input, errEl);
      }
    });

    return { valid: valid, firstInvalid: firstInvalid };
  }

  function buildWhatsAppMessage() {
    var nome = field("fNome").value.trim();
    var oficina = field("fOficina").value.trim();
    var whats = field("fWhats").value.replace(/\D/g, "");
    var email = field("fEmail").value.trim();
    var cidade = field("fCidade").value.trim();
    var tamanho = field("fTamanho") ? field("fTamanho").value : "Não informado";
    var msg = field("fMsg").value.trim();

    return (
      "Olá! Sou *" + nome + "* da oficina *" + oficina + "* (" + cidade + ")." +
      "\nQuero conhecer o Giro e agendar uma demonstração." +
      (selectedPlan ? "\n\nPlano de interesse: *" + selectedPlan + "*" : "") +
      "\n\nWhatsApp: " + whats +
      "\nE-mail: " + email +
      "\nTamanho da oficina: " + tamanho +
      "\n\nMensagem: " + msg
    );
  }

  function collectLeadPayload() {
    return {
      nome: field("fNome").value.trim(),
      oficina: field("fOficina").value.trim(),
      whats: field("fWhats").value.replace(/\D/g, ""),
      email: field("fEmail").value.trim(),
      cidade: field("fCidade").value.trim(),
      tamanho: field("fTamanho") ? field("fTamanho").value : "Não informado",
      plano: selectedPlan,
      origem: "landing",
      mensagem: field("fMsg").value.trim()
    };
  }

  function sendLead(payload) {
    return fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hideMsg();

      var result = validate();

      if (!result.valid) {
        showMsg("error", "Confira os campos destacados para continuar.");
        if (result.firstInvalid) {
          result.firstInvalid.focus();
        }
        return;
      }

      sendLead(collectLeadPayload()).catch(function () {
        return null;
      });

      var message = buildWhatsAppMessage();
      var url = "https://wa.me/" + WHATS_APP_NUMBER + "?text=" + encodeURIComponent(message);
      successWa.href = url;
      form.hidden = true;
      successEl.hidden = false;
      successEl.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
    });

    form.querySelectorAll("input, select, textarea").forEach(function (input) {
      input.addEventListener("input", function () {
        var errEl = field("err" + input.id.charAt(1).toUpperCase() + input.id.slice(2));
        if (errEl && errEl.textContent) {
          clearError(input, errEl);
          if (!form.querySelector(".field.error")) {
            hideMsg();
          }
        }
      });
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", function () {
      successEl.hidden = true;
      form.hidden = false;
      form.reset();
      hideMsg();
      form.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
    });
  }

  var pointerFine = window.matchMedia("(pointer: fine)").matches;

  var themeToggle = document.getElementById("themeToggle");
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (themeMeta) {
      themeMeta.setAttribute("content", theme === "light" ? "#f1f3ee" : "#0b0f14");
    }
  }
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
      try { localStorage.setItem("giro-theme", next); } catch (_) {}
    });
  }

  document.querySelectorAll(".app-tab[data-tab]").forEach(function (tab) {
    tab.addEventListener("click", function () {
      var key = tab.getAttribute("data-tab");
      document.querySelectorAll(".app-tab[data-tab]").forEach(function (t) {
        var isActive = t === tab;
        t.classList.toggle("app-tab-active", isActive);
        t.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      document.querySelectorAll(".panel[data-panel]").forEach(function (p) {
        p.classList.toggle("panel-active", p.getAttribute("data-panel") === key);
      });
    });
  });

  function refreshKanbanStats() {
    var counts = { aguardando: 0, emAndamento: 0, prontos: 0 };
    document.querySelectorAll(".hero-kanban .kanban-col").forEach(function (col) {
      var n = col.querySelectorAll(".vehicle-card").length;
      var c = parseInt(col.getAttribute("data-col") || "0", 10);
      if (c === 0) counts.aguardando += n;
      else if (c === 3) counts.prontos += n;
      else counts.emAndamento += n;
    });
    [
      { stat: "aguardando", value: counts.aguardando },
      { stat: "em-andamento", value: counts.emAndamento },
      { stat: "prontos", value: counts.prontos }
    ].forEach(function (item) {
      var el = document.querySelector('.mini-stat-value[data-stat="' + item.stat + '"]');
      if (el) el.textContent = item.value;
    });
  }

  var NEXT_TAG = {
    1: { cls: "tag-blue", text: "Diagnóstico" },
    2: { cls: "tag-green", text: "Em serviço" },
    3: { cls: "tag-check", text: "Entregar" }
  };

  document.querySelectorAll(".hero-kanban .kanban-col").forEach(function (col) {
    col.addEventListener("click", function (e) {
      var card = e.target.closest(".vehicle-card");
      if (!card || card.parentNode !== col) return;
      var idx = parseInt(col.getAttribute("data-col") || "0", 10);
      if (idx >= 3) {
        card.classList.remove("is-shake");
        void card.offsetWidth;
        card.classList.add("is-shake");
        return;
      }
      var next = document.querySelector('.hero-kanban .kanban-col[data-col="' + (idx + 1) + '"]');
      if (!next) return;
      var info = NEXT_TAG[idx + 1];
      var tag = card.querySelector(".vc-tag");
      if (tag && info) {
        tag.className = "vc-tag " + info.cls;
        tag.textContent = info.text;
      }
      card.classList.remove("is-pop");
      next.appendChild(card);
      void card.offsetWidth;
      card.classList.add("is-pop");
      refreshKanbanStats();
    });
  });

  if (document.querySelectorAll(".hero-kanban .kanban-col").length) {
    refreshKanbanStats();
  }

  var appWindow = document.querySelector(".app-window");
  var heroVisual = document.querySelector(".hero-visual");
  if (appWindow && heroVisual && pointerFine && !reducedMotion) {
    heroVisual.addEventListener("mousemove", function (e) {
      var r = heroVisual.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      appWindow.style.transform =
        "perspective(900px) rotateX(" + (-y * 5).toFixed(1) + "deg) rotateY(" + (x * 6).toFixed(1) + "deg)";
    });
    heroVisual.addEventListener("mouseleave", function () {
      appWindow.style.transform = "";
    });
  }

  var cursorGlow = document.querySelector(".cursor-glow");
  if (cursorGlow && pointerFine && !reducedMotion) {
    document.body.classList.add("has-pointer");
    document.addEventListener("mousemove", function (e) {
      cursorGlow.style.transform = "translate3d(" + e.clientX + "px," + e.clientY + "px,0)";
    }, { passive: true });
  }

  document.querySelectorAll(".pricing-card, .contact-card").forEach(function (card) {
    if (!pointerFine || reducedMotion) return;
    card.addEventListener("mousemove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--spot-x", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
      card.style.setProperty("--spot-y", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
    });
  });
})();
