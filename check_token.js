const { Client } = require('pg');
require('dotenv').config({ path: 'C:/Users/pc/OneDrive/Documents/Isco Internship/Digital Signature/backend/.env' });

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function checkDb() {
  await client.connect();
  const res = await client.query("SELECT id, access_token, otp_code, otp_expires_at FROM workflow_steps WHERE access_token = 'f2ec8407-c5fc-4c0d-8f48-aa0e9dc6866b'");
  console.log('Results:', res.rows);
  await client.end();
}
checkDb();
