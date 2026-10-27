const mysql = require('mysql2/promise');

function databaseConfig(env = process.env) {
  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD || '',
    connectionLimit: Number(env.DB_CONNECTION_LIMIT || 10),
  };
}

function isDatabaseConfigured(env = process.env) {
  return Boolean(env.DB_HOST && env.DB_NAME && env.DB_USER);
}

function assertDatabaseConfigured(env = process.env) {
  if (!isDatabaseConfigured(env)) {
    throw new Error('Banco de dados não configurado: defina DB_HOST, DB_NAME e DB_USER.');
  }
}

function createPool(env = process.env) {
  assertDatabaseConfigured(env);
  return mysql.createPool(databaseConfig(env));
}

async function withTransaction(pool, callback) {
  if (!pool || typeof pool.getConnection !== 'function') throw new TypeError('withTransaction requer um pool MySQL.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch (_) { /* preserve the original error */ }
    throw error;
  } finally {
    connection.release();
  }
}

async function close(pool) {
  if (pool && typeof pool.end === 'function') await pool.end();
}

module.exports = { databaseConfig, isDatabaseConfigured, assertDatabaseConfigured, createPool, withTransaction, close };
