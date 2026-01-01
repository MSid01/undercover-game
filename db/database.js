import pg from 'pg';
const { Pool } = pg;

// Use DATABASE_URL from environment (Render provides this)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize database schema
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create word_pairs table (generic pairs only)
    await client.query(`
      CREATE TABLE IF NOT EXISTS word_pairs (
        id SERIAL PRIMARY KEY,
        word1 TEXT NOT NULL,
        word2 TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(word1, word2)
      )
    `);
    
    // Create index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_word_pairs_words ON word_pairs(word1, word2)
    `);
    
    console.log('✅ PostgreSQL database initialized');
  } catch (error) {
    console.error('Database initialization error:', error.message);
  } finally {
    client.release();
  }
}

// Initialize on module load
initDatabase().catch(console.error);

export default pool;
