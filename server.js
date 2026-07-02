const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const OPNSENSE_URL = process.env.OPNSENSE_URL;
const API_KEY = process.env.OPNSENSE_API_KEY;
const API_SECRET = process.env.OPNSENSE_API_SECRET;
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ── Demo Mode: Mock Data ──
const DEMO_HOSTS = [
  {
    uuid: 'demo-uuid-1',
    descr: 'Office Desktop',
    mac: 'aa:bb:cc:11:22:33',
    interface: 'opt2',
    '%interface': 'HSD',
    friendly_interface: 'HSD',
    online: true,
    ip: '198.51.100.50'
  },
  {
    uuid: 'demo-uuid-2',
    descr: 'Living Room HTPC',
    mac: 'aa:bb:cc:44:55:66',
    interface: 'opt2',
    '%interface': 'HSD',
    friendly_interface: 'HSD',
    online: false
  },
  {
    uuid: 'demo-uuid-3',
    descr: 'NAS Server',
    mac: 'aa:bb:cc:77:88:99',
    interface: 'opt4',
    '%interface': 'SVRS',
    friendly_interface: 'SVRS',
    online: true,
    ip: '198.51.100.3'
  },
  {
    uuid: 'demo-uuid-4',
    descr: 'Printer',
    mac: 'aa:bb:cc:aa:bb:cc',
    interface: 'opt3',
    '%interface': 'IOT',
    friendly_interface: 'IOT',
    online: true,
    ip: '198.51.100.100'
  },
  {
    uuid: 'demo-uuid-5',
    descr: 'Garage Workstation',
    mac: 'aa:bb:cc:dd:ee:ff',
    interface: 'opt2',
    '%interface': 'HSD',
    friendly_interface: 'HSD',
    online: false
  },
  {
    uuid: 'demo-uuid-6',
    descr: 'Media Server',
    mac: '11:22:33:44:55:66',
    interface: 'opt5',
    '%interface': 'GUEST',
    friendly_interface: 'GUEST',
    online: false
  }
];

// HTTPS Agent
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.VERIFY_SSL === 'true'
});

// Axios Client (only used when not in demo mode)
const client = axios.create({
  baseURL: OPNSENSE_URL,
  auth: {
    username: API_KEY,
    password: API_SECRET
  },
  httpsAgent: httpsAgent
});

// Build ARP lookup: mac -> { ip, intf, intf_desc }
async function fetchArpTable() {
  try {
    const resp = await client.get('/api/diagnostics/interface/get_arp');
    const entries = Array.isArray(resp.data) ? resp.data : (resp.data.data || []);
    const lookup = {};
    for (const e of entries) {
      const mac = (e.mac || '').toLowerCase().trim();
      if (mac) {
        lookup[mac] = {
          ip: e.ip || '',
          intf: e.intf || '',
          intf_desc: e.intf_description || ''
        };
      }
    }
    return lookup;
  } catch (error) {
    console.error('Error fetching ARP table:', error.message);
    return {};
  }
}

// API: Get Hosts — returns WOL hosts with friendly interface names + online status
app.get('/api/hosts', async (req, res) => {
  if (DEMO_MODE) {
    return res.json(DEMO_HOSTS);
  }

  if (!API_KEY || !API_SECRET || !OPNSENSE_URL) {
    return res.status(500).json({ error: 'Missing OPNsense configuration env vars.' });
  }

  try {
    // Fetch hosts + ARP in parallel
    const [hostRes, arpTable] = await Promise.all([
      client.post('/api/wol/wol/searchHost', {
        current: 1,
        rowCount: 1000,
        sort: {},
        searchPhrase: ''
      }, { headers: { 'Content-Type': 'application/json' } }),
      fetchArpTable()
    ]);

    const hosts = hostRes.data.rows || [];

    for (const host of hosts) {
      const mac = (host.mac || '').toLowerCase().trim();
      const arpEntry = arpTable[mac];

      // Friendly interface name from %interface field (already a description like "HSD")
      host.friendly_interface = host['%interface'] || host.interface || 'Unknown';

      // Online status from ARP table (MAC entry exists)
      host.online = !!arpEntry;

      // Include IP if available
      if (arpEntry) {
        host.ip = arpEntry.ip;
      } else {
        host.ip = '';
      }
    }

    res.json(hosts);
  } catch (error) {
    console.error('Error fetching hosts:', error.message);
    res.status(500).json({ error: 'Failed to connect to OPNsense API' });
  }
});

// ── In-memory ping cache: { uuid: { rtt: number|null, time: timestamp } } ──
const pingCache = {};
const PING_CACHE_TTL = 60_000; // 1 minute

// Helper: get IP for a host uuid
async function getHostIp(uuid) {
  if (DEMO_MODE) {
    const h = DEMO_HOSTS.find(h => h.uuid === uuid);
    return h ? h.ip : null;
  }
  try {
    const resp = await client.post('/api/wol/wol/searchHost', {
      current: 1, rowCount: 1000, sort: {}, searchPhrase: ''
    }, { headers: { 'Content-Type': 'application/json' } });
    const hosts = resp.data.rows || [];
    const host = hosts.find(h => h.uuid === uuid);
    if (!host || !host.mac) return null;
    const arpTable = await fetchArpTable();
    const mac = host.mac.toLowerCase().trim();
    return arpTable[mac] ? arpTable[mac].ip : null;
  } catch {
    return null;
  }
}

// API: Ping a host — returns RTT in ms (cached for PING_CACHE_TTL)
app.get('/api/ping/:uuid', async (req, res) => {
  const { uuid } = req.params;
  const now = Date.now();

  // Return cached value if fresh
  const cached = pingCache[uuid];
  if (cached && (now - cached.time) < PING_CACHE_TTL) {
    return res.json({ uuid, rtt: cached.rtt });
  }

  if (DEMO_MODE) {
    // Simulate plausible RTTs for demo hosts
    const delay = 100 + Math.random() * 400;
    await new Promise(r => setTimeout(r, Math.min(delay, 300)));
    const rtt = Math.round(delay);
    pingCache[uuid] = { rtt, time: now };
    return res.json({ uuid, rtt });
  }

  const ip = await getHostIp(uuid);
  if (!ip) {
    pingCache[uuid] = { rtt: null, time: now };
    return res.json({ uuid, rtt: null });
  }

  const { exec } = require('child_process');
  exec(`ping -c 1 -W 2 ${ip}`, { timeout: 5000 }, (err, stdout) => {
    let rtt = null;
    if (!err && stdout) {
      // Parse "time=1.23 ms" or "rtt min/avg/max/mdev = 1.234/..."
      const m = stdout.match(/time=(\d+\.?\d*)\s*ms/);
      if (m) rtt = Math.round(parseFloat(m[1]) * 10) / 10;
    }
    pingCache[uuid] = { rtt, time: now };
    res.json({ uuid, rtt });
  });
});

// API: Batch ping — returns RTT for all hosts with an IP
app.get('/api/ping', async (req, res) => {
  const hosts = DEMO_MODE
    ? DEMO_HOSTS
    : (await (async () => {
        try {
          const resp = await client.post('/api/wol/wol/searchHost', {
            current: 1, rowCount: 1000, sort: {}, searchPhrase: ''
          }, { headers: { 'Content-Type': 'application/json' } });
          return resp.data.rows || [];
        } catch { return []; }
      })());

  const ips = DEMO_MODE
    ? hosts.filter(h => h.ip).map(h => ({ uuid: h.uuid, ip: h.ip }))
    : (() => { /* resolve ARP for non-demo — skip batch ping for now, use individual */ return []; })();

  if (DEMO_MODE) {
    // Simulate batch ping results
    const results = {};
    for (const h of hosts.filter(h => h.ip)) {
      const rtt = Math.round(50 + Math.random() * 450);
      pingCache[h.uuid] = { rtt, time: Date.now() };
      results[h.uuid] = rtt;
    }
    return res.json(results);
  }

  // Real mode: return whatever is in cache (individual pings populate it)
  const results = {};
  for (const host of hosts) {
    const cached = pingCache[host.uuid];
    if (cached && (Date.now() - cached.time) < PING_CACHE_TTL) {
      results[host.uuid] = cached.rtt;
    }
  }
  res.json(results);
});

// API: Wake Host
app.post('/api/wake/:uuid', async (req, res) => {
  const { uuid } = req.params;

  if (DEMO_MODE) {
    await new Promise(r => setTimeout(r, 400));
    return res.json({ status: 'OK', result: 'OK' });
  }

  try {
    const response = await client.post('/api/wol/wol/set', { uuid }, { headers: { 'Content-Type': 'application/json' } });
    res.json(response.data);
  } catch (error) {
    console.error(`Error waking host ${uuid}:`, error.message);
    res.status(500).json({ error: 'Failed to wake host' });
  }
});

// API: Wake All Hosts
app.post('/api/wake-all', async (req, res) => {
  if (DEMO_MODE) {
    await new Promise(r => setTimeout(r, 800));
    return res.json({ status: 'OK', count: DEMO_HOSTS.length });
  }

  if (!API_KEY || !API_SECRET || !OPNSENSE_URL) {
    return res.status(500).json({ error: 'Missing OPNsense configuration env vars.' });
  }

  try {
    const hostRes = await client.post('/api/wol/wol/searchHost', {
      current: 1, rowCount: 1000, sort: {}, searchPhrase: ''
    }, { headers: { 'Content-Type': 'application/json' } });
    const hosts = hostRes.data.rows || [];
    const results = [];
    for (const host of hosts) {
      try {
        const wakeRes = await client.post('/api/wol/wol/set', { uuid: host.uuid }, { headers: { 'Content-Type': 'application/json' } });
        results.push({ descr: host.descr, status: wakeRes.data.status || 'OK' });
      } catch (e) {
        results.push({ descr: host.descr, status: 'FAILED', error: e.message });
      }
    }
    res.json({ status: 'OK', count: hosts.length, results });
  } catch (error) {
    console.error('Error waking all hosts:', error.message);
    res.status(500).json({ error: 'Failed to wake hosts' });
  }
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, async () => {
  if (DEMO_MODE) {
    console.log(`OPNsense WOL v3 DEMO running on http://localhost:${PORT}`);
    console.log(`Serving ${DEMO_HOSTS.length} mock hosts with status via ARP simulation`);
  } else {
    console.log(`OPNsense WOL v3 running on port ${PORT}`);
    if (API_KEY) {
      console.log('OPNsense API connected — status via ARP table, interface names via %interface');
    }
  }
});
