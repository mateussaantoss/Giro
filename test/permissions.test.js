"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLE_PERMISSIONS, hasPermission, normalizeRole } = require("../permissions");

test("cada perfil recebe permissões centralizadas sem financeiro para mecânico", () => {
  assert.equal(hasPermission({ role: "OWNER" }, "settings.manage"), true);
  assert.equal(hasPermission({ role: "MANAGER" }, "os.assign"), true);
  assert.equal(hasPermission({ role: "OWNER" }, "services.view"), false);
  assert.equal(hasPermission({ role: "MANAGER" }, "services.view"), false);
  assert.equal(hasPermission({ role: "MECHANIC" }, "services.view"), true);
  assert.equal(hasPermission({ role: "ATTENDANT" }, "services.view"), false);
  assert.equal(hasPermission({ role: "ATTENDANT" }, "reports.view"), false);
  assert.equal(hasPermission({ role: "OWNER" }, "os.close"), true);
  assert.equal(hasPermission({ role: "MANAGER" }, "os.close"), true);
  assert.equal(hasPermission({ role: "ATTENDANT" }, "os.close"), true);
   assert.equal(hasPermission({ role: "MECHANIC" }, "os.close"), true);
  assert.equal(hasPermission({ role: "MECHANIC" }, "assigned_services.update_status"), true);
  assert.equal(hasPermission({ role: "MECHANIC" }, "financial.view"), false);
  assert.equal(hasPermission({ role: "MECHANIC" }, "whatsapp.manage"), false);
  assert.equal(ROLE_PERMISSIONS.MECHANIC.includes("settings.manage"), false);
});

test("roles legadas são normalizadas e usuário desativado nunca autoriza", () => {
  assert.equal(normalizeRole("admin"), "OWNER");
  assert.equal(normalizeRole("unknown"), "ATTENDANT");
  assert.equal(hasPermission({ role: "OWNER", active: false }, "settings.manage"), false);
});
