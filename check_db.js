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
  const res = await client.query('SELECT otp_code, otp_expires_at FROM workflow_steps ORDER BY id DESC LIMIT 1');
  console.log(res.rows[0]);
  await client.end();
}
checkDb();
