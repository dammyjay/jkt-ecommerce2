// utils/db.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});


pool.on("connect", () => {
  console.log("📦 Connected to PostgreSQL Database");
});

module.exports = pool;

