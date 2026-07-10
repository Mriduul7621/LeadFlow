import pg from 'pg';
const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (!pool) {
    const rawConnectionString = process.env.DATABASE_URL;
    console.log(process.env.DATABASE_URL);
    if (!rawConnectionString) {
      console.warn("⚠️ DATABASE_URL environment variable is not defined. Supabase PostgreSQL is not connected. Fallback to in-memory/local mock mode.");
      return null;
    }
    try {
      // Strip any conflicting sslmode=... parameters to prevent pg-connection-string from overriding our ssl option
      const connectionString = rawConnectionString.replace(/[\?&]sslmode=[^&]+/g, '');
      
      pool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false // Safe and required for Supabase Cloud Database connections
        }
      });
      console.log("🔌 Supabase PostgreSQL connection pool initialized with SSL.");
    } catch (err) {
      console.error("❌ Failed to create Supabase PostgreSQL connection pool:", err);
      return null;
    }
  }
  return pool;
}

// Automatically create tables if they do not exist
export async function initializeDatabase() {
  const activePool = getPool();
  if (!activePool) {
    console.warn("⚠️ Skipping table initialization: no active database connection.");
    return;
  }

  try {
    const client = await activePool.connect();
    console.log("🚀 Connected to Supabase PostgreSQL. Running schema initialization...");
    try {
      // Create Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255),
          employee_id VARCHAR(255) UNIQUE,
          email VARCHAR(255),
          role VARCHAR(100),
          designation VARCHAR(255),
          status VARCHAR(100),
          created_date VARCHAR(255),
          password VARCHAR(255)
        )
      `);
      console.log("✅ Users table verification complete.");

      // Create Leads table
      await client.query(`
        CREATE TABLE IF NOT EXISTS leads (
          id VARCHAR(255) PRIMARY KEY,
          prospect_name VARCHAR(255),
          mobile_number VARCHAR(100),
          campaign_name VARCHAR(255),
          current_status VARCHAR(100),
          collected_ncp NUMERIC,
          projected_ncp NUMERIC,
          sum_assured NUMERIC,
          product_name VARCHAR(255),
          assigned_to VARCHAR(255),
          assigned_by VARCHAR(255),
          assigned_date VARCHAR(255),
          creation_date VARCHAR(255),
          last_follow_up_date VARCHAR(255),
          next_follow_up_date VARCHAR(255),
          next_call_date VARCHAR(255),
          meeting_date VARCHAR(255),
          priority VARCHAR(100),
          district VARCHAR(255),
          upazila VARCHAR(255),
          address TEXT,
          status_history TEXT, -- Store JSON string representation
          timestamp VARCHAR(255)
        )
      `);
      console.log("✅ Leads table verification complete.");

      // Create Options table
      await client.query(`
        CREATE TABLE IF NOT EXISTS options (
          id VARCHAR(255) PRIMARY KEY,
          type VARCHAR(100),
          value VARCHAR(255),
          status VARCHAR(100)
        )
      `);
      console.log("✅ Options table verification complete.");

      // Create Departments table
      await client.query(`
        CREATE TABLE IF NOT EXISTS departments (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255),
          created_date VARCHAR(255)
        )
      `);
      console.log("✅ Departments table verification complete.");

      // Create Hierarchies table
      await client.query(`
        CREATE TABLE IF NOT EXISTS hierarchies (
          id VARCHAR(255) PRIMARY KEY,
          department_id VARCHAR(255),
          layers TEXT, -- Store JSON representation
          updated_at VARCHAR(255)
        )
      `);
      console.log("✅ Hierarchies table verification complete.");

      // Create Roles/Permissions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS roles (
          role_id VARCHAR(255) PRIMARY KEY,
          role_name VARCHAR(255),
          menu_access TEXT, -- Store JSON representation
          data_visibility VARCHAR(100),
          actions TEXT, -- Store JSON representation
          feature_permissions TEXT -- Store JSON representation
        )
      `);
      console.log("✅ Roles table verification complete.");

      // Create Teams table
      await client.query(`
        CREATE TABLE IF NOT EXISTS teams (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255),
          leader_id VARCHAR(255),
          leader_name VARCHAR(255),
          member_ids TEXT, -- Store JSON array representation
          created_date VARCHAR(255),
          department_id VARCHAR(255)
        )
      `);
      console.log("✅ Teams table verification complete.");

      // Create Notifications table
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255),
          title VARCHAR(255),
          message TEXT,
          lead_id VARCHAR(255),
          read BOOLEAN DEFAULT FALSE,
          date VARCHAR(255)
        )
      `);
      console.log("✅ Notifications table verification complete.");
      
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ Critical database initialization error:", err);
  }
}
