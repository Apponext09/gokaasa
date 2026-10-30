import pg from 'pg';

const database = 'gokassa_test_homepage_hero_20261030';
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: 'postgres',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

await client.connect();
const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
if (!found.rowCount) await client.query(`CREATE DATABASE "${database}"`);
console.log(database);
await client.end();
