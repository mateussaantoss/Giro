"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");

test("landing links have real local targets and preserve application access", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique");
  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(target), target);
  assert.ok(html.includes('href="/app/"'));
  assert.ok(html.includes('href="/app/#/login"'));
  assert.ok(html.includes('data-plano="Pro"'));
});

test("landing assets exist, are bounded WebP files, and use genuine empty-state captures", () => {
  for (const name of ["automotive", "workshop", "patio", "clientes", "estoque"]) {
    const data = fs.readFileSync(path.join(root, "assets/images/landing-" + name + ".webp"));
    assert.equal(data.toString("ascii", 8, 12), "WEBP");
    assert.ok(data.length < 300000, name + " should be optimized");
  }
  assert.ok(html.includes("INTERFACE REAL · SEM CADASTROS"));
  assert.ok(!html.includes("data-count"), "no unverified success counters");
});

test("public lead form retains its original field and transport contract", () => {
  for (const id of ["contactForm", "fNome", "fOficina", "fWhats", "fEmail", "fEstado", "fCidade", "fMsg", "formMsg", "formSuccess", "successBack"]) assert.ok(html.includes('id="' + id + '"'), id);
  const js = read("js/main.js");
  assert.ok(js.includes('fetch("/api/leads"'));
  assert.ok(js.includes('origem: "landing"'));
  assert.ok(js.includes("submit.disabled = false"));
});

test("cinematic assets are isolated from internal application and add no runtime library", () => {
  const app = read("app/index.html");
  assert.ok(!app.includes("landing-cinematic"));
  assert.ok(!app.includes("../js/main.js"));
  const js = read("js/landing-cinematic.js");
  assert.ok(js.includes("prefers-reduced-motion"));
  assert.ok(js.includes("requestAnimationFrame"));
  assert.ok(js.includes("ResizeObserver"));
  assert.ok(js.includes('addEventListener("pointermove"'));
  assert.ok(js.includes('className = "pointer-aura"'));
  assert.ok(!js.includes("screenImage.src"), "do not swap nearly identical screenshots on scroll");
  assert.ok(html.includes('class="platform-section"'));
  assert.ok(!html.includes('data-act="'), "product section must not swap abstract scenes");
  assert.ok(!html.includes('data-chapter="'), "no navigation inside the product presentation");
  assert.equal((html.match(/id="product-screen"/g) || []).length, 1);
  assert.ok(!html.includes("orbit-"), "no floating overlapping cards");
  assert.equal((html.match(/class="clarity-item"/g) || []).length, 3);
  assert.ok(html.includes('src="assets/brand/giro-logo-ciano.svg"'));
  assert.ok(html.includes('src="assets/brand/giro-logo-escuro.svg"'));
  assert.ok(html.includes('href="assets/brand/favicon.svg"'));
  assert.ok(!html.includes('href="css/styles.css"'), "public redesign must not rely on legacy layout overrides");
  assert.ok(!js.includes('addEventListener("wheel"'));
  assert.ok(!js.includes("localStorage"));
  assert.ok(read("css/landing-cinematic.css").includes("--brand: #5ccbff"));
});
