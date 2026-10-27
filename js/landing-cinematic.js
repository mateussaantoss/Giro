/* Scroll is the playhead. No wheel interception, artificial scroll or runtime dependencies. */
(function () {
  "use strict";
  var root = document.querySelector(".giro-landing");
  if (!root) return;
  var preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mobile = window.matchMedia("(max-width: 760px)");
  var scenes = Array.from(root.querySelectorAll("[data-scene]"));
  var hero = root.querySelector(".hero-content");
  var photo = root.querySelector(".hero-photo");
  var wordmark = root.querySelector(".hero-wordmark");
  var clarityRows = Array.from(root.querySelectorAll(".clarity-item"));
  var clarityTops = [];
  var heroPin = window.matchMedia("(min-width: 900px) and (min-height: 760px)");
  var screen = root.querySelector(".platform-preview");
  var platformScreen = root.querySelector(".platform-screen");
  var motionEnabled = false;
  var frame = 0;
  var geometry = [];
  var clamp = function (value) { return Math.max(0, Math.min(1, value)); };
  var interval = function (value, start, end) { return clamp((value - start) / (end - start)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var setTransform = function (el, value) { el.style.transform = value; };

  function measure() {
    geometry = scenes.map(function (scene) {
      return { top: scene.getBoundingClientRect().top + window.scrollY, height: scene.offsetHeight };
    });
    clarityTops = clarityRows.map(function (row) { return row.getBoundingClientRect().top + window.scrollY; });
    schedule();
  }

  function render() {
    frame = 0;
    if (!motionEnabled) return;
    var y = window.scrollY;
    var vh = window.innerHeight;
    scenes.forEach(function (scene, i) {
      var rect = geometry[i];
      if (!rect || y + vh < rect.top || y > rect.top + rect.height) return;
      var p = clamp((y - rect.top) / Math.max(1, rect.height - vh));
      scene.style.setProperty("--scene-progress", p.toFixed(4));
      switch (scene.dataset.scene) {
        case "hero":
          var heroProgress = heroPin.matches ? p : clamp((y - rect.top) / rect.height);
          setTransform(photo, "translate3d(" + (-heroProgress * 2) + "%," + (heroProgress * 3) + "%,0) scale(" + (1 + heroProgress * (heroPin.matches ? .22 : .1)) + ")");
          if (heroPin.matches) {
            setTransform(hero, "translate3d(0," + (-p * 75) + "px,0)");
            hero.style.opacity = 1 - interval(p, .12, .65);
            hero.style.visibility = p > .7 ? "hidden" : "visible";
            hero.inert = p > .7;
            wordmark.style.opacity = interval(p, .4, .85);
            setTransform(wordmark, "translate3d(0," + lerp(25, 0, p) + "px,0) scale(" + lerp(.88, 1, p) + ")");
          } else {
            hero.style.transform = "";
            hero.style.opacity = "1";
            hero.style.visibility = "visible";
            hero.inert = false;
            wordmark.style.opacity = "0";
          }
          break;
        case "clarity":
          clarityRows.forEach(function (row, n) {
            var focus = clamp((y + vh * .85 - clarityTops[n]) / (vh * .5));
            row.style.setProperty("--row-progress", focus.toFixed(4));
          });
          break;
        case "product":
          // One continuous product reveal; the content never swaps or disappears.
          var viewProgress = clamp((y + vh - rect.top) / (vh + rect.height));
          var approach = interval(viewProgress, .04, .65);
          setTransform(screen, "perspective(2000px) translate3d(0," + lerp(45, -5, approach) + "px,0) rotateX(" + (mobile.matches ? 0 : lerp(7, 0, approach)) + "deg) scale(" + lerp(.92, 1, approach) + ")");
          break;
        case "benefits":
          var travel = clamp((y + vh - rect.top) / (vh + rect.height));
          setTransform(scene.querySelector("img"), "scale(1.12) translate3d(0," + lerp(-4, 4, travel) + "%,0)");
          scene.querySelectorAll(".benefit-lines p").forEach(function (line, n) {
            var reveal = interval(travel, .12 + n * .08, .4 + n * .08);
            line.style.opacity = .75 + reveal * .25;
            setTransform(line, "translate3d(" + (10 * (1 - reveal)) + "px,0,0)");
          });
          break;
        case "final":
          var approach = clamp((y + vh - rect.top) / (vh + rect.height));
          setTransform(scene.querySelector("img"), "scale(" + lerp(1.03, 1.2, approach) + ")");
          break;
      }
    });
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(render); }
  function configure() {
    motionEnabled = !preference.matches;
    root.classList.toggle("motion-enabled", motionEnabled);
    scenes.forEach(function (scene) {
      scene.removeAttribute("style");
      scene.querySelectorAll("[style]").forEach(function (el) { el.removeAttribute("style"); });
    });
    hero.inert = false;
    measure();
  }
  document.querySelectorAll("[data-billing]").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll(".billing-description").forEach(function (description) {
        description.textContent = button.dataset.billing === "yearly" ? "Equivalente mensal no plano anual" : "Cobrado mensalmente";
      });
    });
  });
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", function () {
    var next = !preference.matches;
    if (next !== motionEnabled) configure();
    else measure();
  }, { passive: true });
  window.addEventListener("pageshow", measure);
  window.addEventListener("load", measure, { once: true });
  preference.addEventListener("change", configure);
  mobile.addEventListener("change", configure);
  heroPin.addEventListener("change", configure);
  if ("ResizeObserver" in window) { var observer = new ResizeObserver(measure); scenes.forEach(function (scene) { observer.observe(scene); }); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  configure();

  // One pointer frame for the entire landing, with local light on the hovered surface.
  var pointerPreference = window.matchMedia("(hover: hover) and (pointer: fine)");
  var aura = document.createElement("div");
  aura.className = "pointer-aura";
  aura.setAttribute("aria-hidden", "true");
  root.appendChild(aura);
  var glowSelectors = ".cinema-button,.btn,.pricing-card,.contact-card,.platform-screen,.faq-q,.text-link,.nav-login";
  root.querySelectorAll(glowSelectors).forEach(function (el) { el.classList.add("pointer-surface"); });
  var pointerFrame = 0;
  var point = { x: 0, y: 0, target: null };
  var lastSurface = null;
  function resetPointer() {
    aura.style.opacity = "0";
    root.style.setProperty("--pointer-unit-x", "0");
    root.style.setProperty("--pointer-unit-y", "0");
    platformScreen.style.setProperty("--tilt-x", "0deg");
    platformScreen.style.setProperty("--tilt-y", "0deg");
    if (lastSurface) { lastSurface.style.removeProperty("--magnet-x"); lastSurface.style.removeProperty("--magnet-y"); }
    lastSurface = null;
  }
  function pointerMode() {
    root.classList.toggle("has-cinematic-pointer", pointerPreference.matches && !preference.matches);
    resetPointer();
  }
  root.addEventListener("pointermove", function (event) {
    if (!pointerPreference.matches || preference.matches || event.pointerType === "touch") return;
    point.x = event.clientX;
    point.y = event.clientY;
    point.target = event.target;
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(function () {
      pointerFrame = 0;
      aura.style.opacity = "1";
      aura.style.transform = "translate3d(" + point.x + "px," + point.y + "px,0)";
      root.style.setProperty("--pointer-unit-x", (point.x / window.innerWidth - .5).toFixed(3));
      root.style.setProperty("--pointer-unit-y", (point.y / window.innerHeight - .5).toFixed(3));
      var surface = point.target.closest(".pointer-surface");
      if (lastSurface && lastSurface !== surface) { lastSurface.style.removeProperty("--magnet-x"); lastSurface.style.removeProperty("--magnet-y"); }
      lastSurface = surface;
      if (surface) {
        var bounds = surface.getBoundingClientRect();
        var x = point.x - bounds.left;
        var y = point.y - bounds.top;
        surface.style.setProperty("--glow-x", x + "px");
        surface.style.setProperty("--glow-y", y + "px");
        if (surface.matches(".cinema-button")) {
          surface.style.setProperty("--magnet-x", ((x / bounds.width - .5) * 10) + "px");
          surface.style.setProperty("--magnet-y", ((y / bounds.height - .5) * 8) + "px");
        }
      }
      if (point.target.closest(".platform-screen")) {
        var r = screen.getBoundingClientRect();
        platformScreen.style.setProperty("--tilt-x", ((.5 - (point.y - r.top) / r.height) * 3).toFixed(2) + "deg");
        platformScreen.style.setProperty("--tilt-y", (((point.x - r.left) / r.width - .5) * 4).toFixed(2) + "deg");
      } else {
        platformScreen.style.setProperty("--tilt-x", "0deg");
        platformScreen.style.setProperty("--tilt-y", "0deg");
      }
    });
  }, { passive: true });
  root.addEventListener("pointerleave", resetPointer);
  preference.addEventListener("change", pointerMode);
  pointerPreference.addEventListener("change", pointerMode);
  pointerMode();
})();
