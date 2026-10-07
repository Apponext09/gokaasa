import pg from 'pg';
import { config } from '../config/index.js';

pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));
// DATE columns stay as 'YYYY-MM-DD' strings. Converting them to Date objects shifts stay dates by timezone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl ? { rejectUnauthorized: config.isProduction } : undefined,
  // Provider content (names, descriptions, star glyphs) is Unicode. Set at connection start, never per query.
  options: '-c client_encoding=UTF8',
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => {
  console.error('[db] idle client error', error.message);
});



/**
 * Runs `callback` inside a transaction. The client is released in all cases.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
