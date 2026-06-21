// utils/getTables.js
import { neon } from '@neondatabase/serverless';

/**
 * Fetches all table names from the database using DATABASE_URL environment variable
 * @returns {Promise<string[]>} Array of table names
 */
export async function getAllTables() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  
  const sql = neon(databaseUrl);
  
  try {
    // Query to get all user tables (excluding system tables)
    const result = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    return result.map(row => row.table_name);
  } catch (error) {
    console.error('Error fetching tables:', error);
    throw error;
  }
}

// If run directly as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  getAllTables()
    .then(tables => {
      console.log('Tables in database:');
      tables.forEach(table => console.log(`  - ${table}`));
    })
    .catch(err => {
      console.error('Failed to fetch tables:', err.message);
      process.exit(1);
    });
}
