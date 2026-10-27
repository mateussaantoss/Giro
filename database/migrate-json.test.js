const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeLead, normalizeQuantity, metadata } = require('./migrate-json');
const { isDatabaseConfigured, createPool } = require('../db');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

test('normaliza o formato legado de lead sem perder os nomes públicos', () => {
  assert.deepEqual(normalizeLead({ id: 'a', nome: 'N', oficina: 'O', whats: '1', email: 'e', state: 'RS', city: 'C', criadoEm: '2026-01-01' }), { id: 'a', name: 'N', workshopName: 'O', whatsapp: '1', email: 'e', state: 'RS', stateName: null, city: 'C', workshopSize: null, plan: null, message: null, source: 'landing', status: 'new', createdAt: '2026-01-01' });
});

test('camada de banco não conecta ao require e exige somente campos essenciais', () => {
  assert.equal(isDatabaseConfigured({ DB_HOST: 'localhost', DB_NAME: 'giro', DB_USER: 'giro', DB_PASSWORD: '' }), true);
  assert.equal(isDatabaseConfigured({ DB_HOST: 'localhost', DB_NAME: 'giro' }), false);
  assert.throws(() => createPool({ DB_HOST: 'localhost', DB_NAME: 'giro' }), /DB_HOST, DB_NAME e DB_USER/);
});

test('converte milésimos de inventário para unidades decimais', () => {
  assert.equal(normalizeQuantity(12345), 12.345);
  assert.equal(normalizeQuantity(undefined), 0);
});

test('separa campos conhecidos e mantém desconhecidos em metadata', () => {
  assert.deepEqual(metadata({ id: 1, extra: 'preserve' }, new Set(['id'])), { extra: 'preserve' });
});

test('schema preserva UUID de clientes/veículos e status 0..4 sem CHECK restritivo', () => {
  assert.match(schema, /clients \(id CHAR\(36\)/);
  assert.match(schema, /vehicles \(id CHAR\(36\)/);
  assert.match(schema, /status TINYINT UNSIGNED/);
  assert.doesNotMatch(schema, /ck_orders_status/);
  for (const table of ['inventory_operations', 'inventory_movements', 'inventory_reservations', 'password_reset_tokens', 'invitation_tokens']) assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
});
