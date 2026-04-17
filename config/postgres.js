import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

/**
 * PostgreSQL connection pool.
 * Uses a pool (not a single client) so multiple queries can run
 * concurrently without blocking each other.
 */
const pool = new Pool({
  host:     process.env.PG_HOST,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port:     Number(process.env.PG_PORT) || 5432,

  // Optional but recommended pool settings
  max: 10,              // maximum number of connections in the pool
  idleTimeoutMillis: 30000,  // close idle connections after 30 s
  connectionTimeoutMillis: 2000, // error if a connection cannot be acquired within 2 s
});

// Verify the connection is working when the server starts
pool.connect()
  .then(client => {
    return client
      .query('SELECT NOW() AS connected_at')
      .then(result => {
        client.release();
        console.log(`✅ PostgreSQL connected — server time: ${result.rows[0].connected_at}`);
      })
      .catch(err => {
        client.release();
        console.error('❌ PostgreSQL query error during startup:', err.message);
      });
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.message);
    console.error('   Check PG_HOST, PG_USER, PG_PASSWORD, PG_DATABASE, PG_PORT in your .env');
  });

export default pool;
