require('dotenv').config();

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env variable: ${key}`);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  moltbookAppKey: process.env.MOLTBOOK_APP_KEY || null,
  adminEmail: process.env.ADMIN_EMAIL || null,
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || null,
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || null,
};
