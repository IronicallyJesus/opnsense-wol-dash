# OPNsense WOL v2

![Wake-on-LAN Dashboard](./screenshot.png)

A lightweight web dashboard for waking devices on your network through the OPNsense WOL plugin API. v2 adds real-time host status checks, a theme selector, and wake history. Built with Express.js and Tailwind CSS.

## What's New in v2

- **Host Status** — Ping-based online/offline indicators with pulsing green dots. Map host names to IPs via `HOST_IPS` env var.
- **Theme Selector** — 5 color themes (Slate Dark, Emerald Dark, Violet Dark, Rose Dark, Light) persisted to localStorage.
- **Wake History** — Per-host last-wake timestamps with relative time display (stored in browser localStorage).
- **Wake All** — One-click button to send magic packets to every host at once.
- **Auto-Refresh** — Host list and status auto-refresh every 30 seconds.
- **Online-First Sort** — Cards sort with online hosts first, then unknown, then offline.
- **Improved UX** — Fade-in cards, hover transitions, cleaner toast notifications, status summary bar.

## Features

| Feature | Description |
|---|---|
| **Host Discovery** | Fetches all WOL-configured hosts directly from OPNsense |
| **One-Click Wake** | Sends magic packet via OPNsense API with toast confirmation |
| **Wake All** | One-click button wakes every host at once |
| **Host Status** | Optional ping-based online/offline checks with visual indicators |
| **Theme Selector** | 5 preset color themes with localStorage persistence |
| **Wake History** | Tracks when each host was last woken |
| **Responsive Grid** | Card-based layout adapts from 1 to 3 columns |
| **Auto-Refresh** | Polls OPNsense and pings hosts every 30 seconds |
| **Sanitized Display** | Host descriptions and MAC addresses are HTML-escaped |
| **Dockerized** | Production Docker build with Alpine Node.js |
| **CI/CD** | Gitea Actions workflow builds and deploys on version tags |

## How It Works

```
┌──────────┐     ┌───────────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Browser │────►│  Express Server   │────►│  OPNsense API    │     │  Your Hosts  │
│ (UI)     │     │  (Node.js)        │     │  (WOL Plugin)    │     │  (ICMP Ping) │
└──────────┘     └───────────────────┘     └─────────────────┘     └──────────────┘
                       │                          │                       │
                   GET /api/hosts           POST /api/wol/wol/      GET /api/status
                   POST /api/wake/:uuid     searchHost               (ping checks)
                   GET /api/status          POST /api/wol/wol/set
```

The Express server acts as a bridge between the browser and the OPNsense API:

1. **List hosts** — queries OPNsense's `wol/searchHost` endpoint and returns raw host data
2. **Wake host** — sends a magic packet via OPNsense's `wol/set` endpoint
3. **Check status** — pings each configured host and returns online/offline state

## Getting Started

### Prerequisites
- Node.js 18+
- OPNsense with the **os-wol** plugin installed and API access enabled
- OPNsense API key and secret

### Configuration

The server is configured entirely through environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPNSENSE_URL` | ✅ | — | OPNsense base URL (e.g. `https://opnsense.lan`) |
| `OPNSENSE_API_KEY` | ✅ | — | OPNsense API key |
| `OPNSENSE_API_SECRET` | ✅ | — | OPNsense API secret |
| `PORT` | ❌ | `3000` | Server listen port |
| `VERIFY_SSL` | ❌ | `false` | Set to `"true"` to verify SSL cert |
| `HOST_IPS` | ❌ | `{}` | JSON map of host descriptions to IPs for status checks |
| `INTERFACE_MAP` | ❌ | `{}` | JSON map of OPNsense port names (LAN, OPT1, OPT2…) to friendly labels |
| `DEMO_MODE` | ❌ | `false` | Set to `"true"` to run with mock data — no OPNsense needed |

### Demo Mode

Set `DEMO_MODE=true` to run a fully functional dashboard with 6 mock hosts (4 online, 2 offline) — no OPNsense connection required. Ideal for testing, development, or taking screenshots:

```sh
DEMO_MODE=true node server.js
# → http://localhost:3000
```

### INTERFACE_MAP

To show friendly names instead of `OPT2`, `OPT3`, etc., set `INTERFACE_MAP` to a JSON object mapping OPNsense port names (the names shown in the WOL plugin interface column) to human-readable labels:

```sh
INTERFACE_MAP='{"OPT2":"HSD","OPT3":"IOT","LAN":"MGMT","OPT1":"WiFi"}'
```

Unmapped interfaces show their raw name. Docker equivalent:

```yaml
environment:
  INTERFACE_MAP: '{"OPT2":"HSD","OPT3":"IOT","LAN":"MGMT","OPT1":"WiFi"}'
```

### HOST_IPS

To enable host status checks, set `HOST_IPS` to a JSON object mapping host descriptions (exactly as they appear in OPNsense) to IP addresses:

```sh
HOST_IPS='{"My Desktop":"192.168.1.100","NAS":"192.168.1.200"}'
```

The server will ping each IP on every `/api/status` call. Hosts without an entry in `HOST_IPS` show no status indicator. Docker equivalent:

```yaml
environment:
  HOST_IPS: '{"My Desktop":"192.168.1.100","NAS":"192.168.1.200"}'
```

### Development

```sh
git clone https://git.twk95.com/twk95/opnsense-wol.git
cd opnsense-wol
npm install

OPNSENSE_URL=https://opnsense.lan \
OPNSENSE_API_KEY=your-key \
OPNSENSE_API_SECRET=your-secret \
HOST_IPS='{"My PC":"192.168.1.50","Server":"192.168.1.10"}' \
node server.js
```

Open `http://localhost:3000` to view the dashboard.

### Docker

```sh
# Build and run
docker build -t opnsense-wol .
docker run -d -p 3000:3000 -e DEMO_MODE=true opnsense-wol
```

### Docker Compose

```sh
# Run in demo mode (no OPNsense required)
docker compose up -d

# Run with real OPNsense (edit docker-compose.yml first)
OPNSENSE_URL=https://opnsense.lan \
OPNSENSE_API_KEY=your-key \
OPNSENSE_API_SECRET=your-secret \
HOST_IPS='{"My PC":"192.168.1.50"}' \
docker compose up -d
```

Or edit `docker-compose.yml` directly to set environment variables for production.

> **Note:** Docker containers need network access to ping local hosts. Use `--network host` or ensure the container can reach your LAN.

### Demo (no OPNsense required)

```sh
docker run -d -p 3000:3000 -e DEMO_MODE=true opnsense-wol
# → http://localhost:3000
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hosts` | List all WOL hosts from OPNsense |
| `POST` | `/api/wake/:uuid` | Send wake signal to a host by UUID |
| `POST` | `/api/wake-all` | Send wake signal to all configured hosts |
| `GET` | `/api/status` | Ping all configured hosts, returns `{descr: {online: bool}}` |
| `GET` | `/health` | Health check endpoint |

## Themes

Click the theme dropdown in the header to switch between 5 color presets:

| Theme | Vibe |
|---|---|
| **Slate Dark** | Default — cool blue-grey |
| **Emerald Dark** | Deep green |
| **Violet Dark** | Indigo/purple |
| **Rose Dark** | Warm red |
| **Light** | Clean white |

Your choice persists in localStorage across sessions.

## Project Structure

```
├── server.js            # Express server (API proxy + status checks)
├── public/
│   └── index.html       # Frontend (Tailwind CSS via CDN, themes, status, wake history)
├── Dockerfile           # Production build (Alpine Node.js, includes ping)
├── docker-compose.yml   # One-command demo or production deployment
├── .dockerignore
├── package.json
└── .gitea/workflows/    # CI/CD (Docker build + deploy on v* tags)
```

## License

ISC
