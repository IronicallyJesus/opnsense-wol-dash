const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const OPNSENSE_URL = process.env.OPNSENSE_URL;
const API_KEY = process.env.OPNSENSE_API_KEY;
const API_SECRET = process.env.OPNSENSE_API_SECRET;

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

// API: Get Hosts (Lightweight - Raw OPNsense Data)
app.get('/api/hosts', async (req, res) => {
  if (!API_KEY || !API_SECRET || !OPNSENSE_URL) {
    return res.status(500).json({ error: 'Missing OPNsense configuration env vars.' });
  }

  try {
    const response = await client.post('/api/wol/wol/searchHost', {
      current: 1,
      rowCount: 1000,
      sort: {},
      searchPhrase: ""
    });
    
    // Return rows directly without enrichment
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

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});