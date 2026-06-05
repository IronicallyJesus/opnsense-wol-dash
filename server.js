const express = require('express');
const axios = require('axios');
const https = require('https');
const { execSync } = require('child_process');
const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const OPNSENSE_URL = process.env.OPNSENSE_URL;
const API_KEY = process.env.OPNSENSE_API_KEY;
const API_SECRET = process.env.OPNSENSE_API_SECRET;

// Parse HOST_IPS env var — maps host descriptions to IPs for status checks
// Format: '{"My Desktop":"192.168.1.100","NAS":"192.168.1.200"}'
let HOST_IPS = {};
try {
  if (process.env.HOST_IPS) {
    HOST_IPS = JSON.parse(process.env.HOST_IPS);
  }
} catch (e) {
  console.warn('Failed to parse HOST_IPS env var:', e.message);
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// HTTPS Agent
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.VERIFY_SSL === 'true'
});

// Axios Client
const client = axios.create({
  baseURL: OPNSENSE_URL,
  auth: {
    username: API_KEY,
    password: API_SECRET
  },
  httpsAgent: httpsAgent,
  headers: { 'Content-Type': 'application/json' }
});

// API: Get Hosts — returns WOL hosts from OPNsense
app.get('/api/hosts', async (req, res) => {
  if (!API_KEY || !API_SECRET || !OPNSENSE_URL) {
    return res.status(500).json({ error: 'Missing OPNsense configuration env vars.' });
  }

  try {
    const response = await client.post('/api/wol/wol/searchHost', {
      current: 1,
      rowCount: 1000,
      sort: {},
      searchPhrase: ''
    });
    res.json(response.data.rows || []);
  } catch (error) {
    console.error('Error fetching hosts:', error.message);
    res.status(500).json({ error: 'Failed to connect to OPNsense API' });
  }
});

// API: Wake Host
app.post('/api/wake/:uuid', async (req, res) => {
  const { uuid } = req.params;
  try {
    const response = await client.post('/api/wol/wol/set', { uuid });
    res.json(response.data);
  } catch (error) {
    console.error(`Error waking host ${uuid}:`, error.message);
    res.status(500).json({ error: 'Failed to wake host' });
  }
});

// API: Host Status — ping each host to check online/offline
app.get('/api/status', async (req, res) => {
  const statuses = {};

  for (const [descr, ip] of Object.entries(HOST_IPS)) {
    try {
      // Single ping with 1s timeout — fast enough for a dashboard
      execSync(`ping -c 1 -W 1 ${ip}`, { timeout: 2000, stdio: 'pipe' });
      statuses[descr] = { online: true };
    } catch {
      statuses[descr] = { online: false };
    }
  }

  res.json(statuses);
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`OPNsense WOL v2 running on port ${PORT}`);
  if (Object.keys(HOST_IPS).length > 0) {
    console.log(`Status checks enabled for ${Object.keys(HOST_IPS).length} host(s)`);
  }
});
