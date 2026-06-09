const express = require('express');
const axios = require('axios');
const https = require('https');
const { exec: execCb } = require('child_process');
const util = require('util');
const execAsync = util.promisify(execCb);
const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const OPNSENSE_URL = process.env.OPNSENSE_URL;
const API_KEY = process.env.OPNSENSE_API_KEY;
const API_SECRET = process.env.OPNSENSE_API_SECRET;
const DEMO_MODE = process.env.DEMO_MODE === 'true';

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

// Parse INTERFACE_MAP env var — maps raw OPNsense interface names to friendly labels
// Format: '{"opt3":"IoT","vlan0x0a":"VLAN 10 - Devices","lan":"LAN"}'
let INTERFACE_MAP = {};
try {
  if (process.env.INTERFACE_MAP) {
    INTERFACE_MAP = JSON.parse(process.env.INTERFACE_MAP);
  }
} catch (e) {
  console.warn('Failed to parse INTERFACE_MAP env var:', e.message);
}

// Auto-discover interface descriptions from OPNsense ARP table
// The ARP endpoint returns intf_description for every entry — no extra perms needed
async function discoverInterfaces() {
  if (DEMO_MODE || !API_KEY || !API_SECRET || !OPNSENSE_URL) return;
  try {
    const resp = await client.get('/api/diagnostics/interface/get_arp');
    const arp = resp.data;
    const discovered = {};
    if (Array.isArray(arp)) {
      for (const entry of arp) {
        const iface = entry.intf;
        const desc = entry.intf_description;
        if (iface && desc && !discovered[iface]) {
          discovered[iface] = desc.trim();
        }
      }
    }
    // Merge — discovered values don't override explicit env config
    for (const [iface, descr] of Object.entries(discovered)) {
      if (!INTERFACE_MAP[iface]) {
        INTERFACE_MAP[iface] = descr;
        console.log(`  Auto-discovered interface: ${iface} → ${descr}`);
      }
    }
    if (Object.keys(discovered).length > 0) {
      console.log(`Interface mapping: ${Object.keys(INTERFACE_MAP).length} entries (${Object.keys(discovered).length} auto-discovered from ARP)`);
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      // OPNsense unreachable — silent
    } else if (err.response && err.response.status === 401) {
      console.log('OPNsense API: auth failed — cannot discover interfaces');
    } else {
      console.warn('Interface discovery error:', err.message);
    }
  }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ── Demo Mode: Mock Data ──
const DEMO_HOSTS = [
  {
    uuid: 'demo-uuid-1',
    descr: 'Office Desktop',
    mac: 'aa:bb:cc:11:22:33',
    interface: 'lan',
    '%interface': 'lan',
    friendly_interface: 'LAN'
  },
  {
    uuid: 'demo-uuid-2',
    descr: 'Living Room HTPC',
    mac: 'aa:bb:cc:44:55:66',
    interface: 'lan',
    '%interface': 'lan',
    friendly_interface: 'LAN'
  },
  {
    uuid: 'demo-uuid-3',
    descr: 'NAS Server',
    mac: 'aa:bb:cc:77:88:99',
    interface: 'lan',
    '%interface': 'lan',
    friendly_interface: 'LAN'
  },
  {
    uuid: 'demo-uuid-4',
    descr: 'Printer',
    mac: 'aa:bb:cc:aa:bb:cc',
    interface: 'opt1',
    '%interface': 'opt1',
    friendly_interface: 'IoT'
  },
  {
    uuid: 'demo-uuid-5',
    descr: 'Garage Workstation',
    mac: 'aa:bb:cc:dd:ee:ff',
    interface: 'lan',
    '%interface': 'lan',
    friendly_interface: 'LAN'
  },
  {
    uuid: 'demo-uuid-6',
    descr: 'Media Server',
    mac: '11:22:33:44:55:66',
    interface: 'lan',
    '%interface': 'lan',
    friendly_interface: 'LAN'
  }
];

// HTTPS Agent (only needed when not in demo mode)
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
  httpsAgent: httpsAgent,
  headers: { 'Content-Type': 'application/json' }
});

// API: Get Hosts — returns WOL hosts from OPNsense (or demo data)
app.get('/api/hosts', async (req, res) => {
  if (DEMO_MODE) {
    return res.json(DEMO_HOSTS);
  }

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
    const hosts = response.data.rows || [];
    // Apply interface name mapping
    for (const host of hosts) {
      const rawIface = host.interface || host['%interface'] || '';
      host.friendly_interface = INTERFACE_MAP[rawIface] || rawIface;
    }
    res.json(hosts);
  } catch (error) {
    console.error('Error fetching hosts:', error.message);
    res.status(500).json({ error: 'Failed to connect to OPNsense API' });
  }
});

// API: Wake Host
app.post('/api/wake/:uuid', async (req, res) => {
  const { uuid } = req.params;

  if (DEMO_MODE) {
    // Simulate a brief delay, then return success
    await new Promise(r => setTimeout(r, 400));
    return res.json({ status: 'OK', result: 'OK' });
  }

  try {
    const response = await client.post('/api/wol/wol/set', { uuid });
    res.json(response.data);
  } catch (error) {
    console.error(`Error waking host ${uuid}:`, error.message);
    res.status(500).json({ error: 'Failed to wake host' });
  }
});

// API: Wake All Hosts — sends WOL to every host at once
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
    });
    const hosts = hostRes.data.rows || [];
    const results = [];
    for (const host of hosts) {
      try {
        const wakeRes = await client.post('/api/wol/wol/set', { uuid: host.uuid });
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

// API: Host Status — parallel ping each host to check online/offline (or demo data)
app.get('/api/status', async (req, res) => {
  if (DEMO_MODE) {
    // Randomize online/offline per request for realistic demo behavior
    const statuses = {};
    for (const host of DEMO_HOSTS) {
      // 60% chance online, 40% offline — varied enough to be interesting
      statuses[host.descr] = { online: Math.random() < 0.6 };
    }
    return res.json(statuses);
  }

  // Parallel pings — all fire simultaneously, results as they come
  const entries = Object.entries(HOST_IPS);
  const results = await Promise.allSettled(
    entries.map(async ([descr, ip]) => {
      try {
        await execAsync(`ping -c 1 -W 1 ${ip.replace(/[^0-9.:]/g, '')}`, { timeout: 2000 });
        return [descr, { online: true }];
      } catch {
        return [descr, { online: false }];
      }
    })
  );
  const statuses = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const [descr, st] = r.value;
      statuses[descr] = st;
    }
  }
  res.json(statuses);
});

app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, async () => {
  if (DEMO_MODE) {
    console.log(`OPNsense WOL v2 DEMO running on http://localhost:${PORT}`);
    console.log(`Serving ${DEMO_HOSTS.length} mock hosts — no OPNsense connection needed`);
  } else {
    console.log(`OPNsense WOL v2 running on port ${PORT}`);
    if (Object.keys(HOST_IPS).length > 0) {
      console.log(`Status checks enabled for ${Object.keys(HOST_IPS).length} host(s)`);
    }
    // Auto-discover interface names from OPNsense API (non-blocking)
    await discoverInterfaces();
  }
});
