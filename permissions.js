"use strict";

const ROLE_PERMISSIONS = Object.freeze({
  OWNER: ["dashboard.admin.view", "os.create", "os.view", "os.edit", "os.assign", "os.close", "os.reopen", "clients.manage", "vehicles.manage", "whatsapp.manage", "history.view", "team.view", "team.manage", "reports.view", "financial.view", "settings.manage", "template.manage"],
  MANAGER: ["dashboard.admin.view", "os.create", "os.view", "os.edit", "os.assign", "os.close", "clients.manage", "vehicles.manage", "whatsapp.manage", "history.view", "team.view", "reports.view", "template.manage"],
  ATTENDANT: ["dashboard.operational.view", "os.create", "os.view", "os.close", "clients.manage", "vehicles.manage", "whatsapp.manage", "history.view"],
  MECHANIC: ["dashboard.mechanic.view", "services.view", "os.quick.create", "os.close", "assigned_services.view", "assigned_services.update_status", "assigned_services.add_note", "assigned_services.add_photo", "history.view"]
});

ROLE_PERMISSIONS.OWNER.push("inventory.view", "inventory.manage", "inventory.move", "inventory.reverse", "materials.add", "materials.reserve", "materials.commit", "orders.cancel");
ROLE_PERMISSIONS.MANAGER.push("inventory.view", "inventory.manage", "inventory.move", "inventory.reverse", "materials.add", "materials.reserve", "materials.commit", "orders.cancel");
ROLE_PERMISSIONS.MECHANIC.push("inventory.view", "materials.add", "materials.reserve", "materials.commit");

function normalizeRole(role) {
  const value = String(role || "OWNER").toUpperCase();
  return ({ ADMIN: "OWNER", OWNER: "OWNER", MANAGER: "MANAGER", ATTENDANT: "ATTENDANT", MECHANIC: "MECHANIC" })[value] || "ATTENDANT";
}

function hasPermission(user, permission) {
  return Boolean(user && user.active !== false && ROLE_PERMISSIONS[normalizeRole(user.role)]?.includes(permission));
}

module.exports = { ROLE_PERMISSIONS, normalizeRole, hasPermission };
