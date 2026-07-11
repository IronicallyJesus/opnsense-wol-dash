# OPNsense WOL Dashboard

[![Docker](https://img.shields.io/badge/docker-ready-blue?logo=docker)](https://hub.docker.com/) [![License: ISC](https://img.shields.io/badge/license-ISC-green)](LICENSE) [![Node](https://img.shields.io/badge/node-22-alpine?logo=nodedotjs)](package.json)

A lightweight web dashboard for waking devices on your network through the **OPNsense WOL plugin API** — with live ping latency (RTT), table/grid views, scheduled wake-ups, and ARP-based host status. Built with Express.js and vanilla JS.

| Grid View | Table View |
|---|---|
| ![Grid view screenshot](public/screenshot-grid.png) | ![Table view screenshot](public/screenshot-table.png) |

> 🌐 **Live Demo:** [wol-demo.twk95.com](https://wol-demo.twk95.com/) — Fully functional dashboard with mock hosts, no OPNsense required.

---

## 🛡️ Security Notice

> ⚠️ **This app has no built-in authentication.** Every endpoint — including `/api/wake/*` — is open to anyone who can reach the server.
>
> **Deploy exclusively behind a reverse proxy** (OPNsense HAProxy, Nginx, Caddy) with authentication, or run it in a trusted LAN / VPN environment only.

---

## Features

| | |
|---|---|
| **Host Discovery** | Auto-fetches WOL-configured hosts from OPNsense |
| **One-Click Wake** | Sends magic packet via OPNsense API with toast confirmation |
| **Wake All** | Single button wakes every host at once |
| **Host Status** | Real-time online/offline via OPNsense ARP table — MAC-level, no ping needed |
| **Ping Latency (RTT)** | Live round-trip times with color-coded badges, 60s cache |
| **Table / Grid View** | Toggle between sortable data table and compact card grid |
| **5 Color Themes** | Built-in presets: Slate, Emerald, Violet, Rose, Light |
| **Custom CSS** | Drop in a stylesheet for full visual control |
| **Scheduled Wake** | Automatic wake-ups by time and day-of-week |
| **Wake History** | Tracks last wake time per host |
| **Responsive** | Cards adapt 1–3 columns; table scrolls on mobile |
| **Auto-Refresh** | Polls OPNsense every 30s |
| **Dockerized** | Production Alpine Node.js image (~160 MB) |

---

## How It Works

```
┌──────────┐     ┌───────────────────┐      ┌──────────────────────────────┐
│  Browser │────►│  Express Server   │─────►│  OPNsense API                │
└──────────┘     └───────────────────┘      │ GET  /api/diagnostics/       │
                      │                     │       interface/get_arp      │
                  GET  /api/hosts           │ POST /api/wol/wol/           │
                  POST /api/wake/:uuid      │       searchHost / set       │
                  POST /api/wake-all        └──────────────────────────────┘
                  GET  /api/ping
                  GET  /api/schedules
```

The Express server bridges the browser and OPNsense — it fetches hosts, merges ARP status + IP, fires magic packets, runs system pings (60s cache), and handles the in-process wake scheduler. All view preferences are persisted in `localStorage`.

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/engine/install/) & [Docker Compose](https://docs.docker.com/compose/install/)
- OPNsense with the **os-wol** plugin and API access enabled
- OPNsense API key with the **WOL** privilege (`/api/wol/wol/*`) — just one privilege needed for host listing, wake, and ARP lookups

### Configuration

All settings via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPNSENSE_URL` | ✅ | — | OPNsense base URL (e.g. `https://opnsense.lan`) |
| `OPNSENSE_API_KEY` | ✅ | — | OPNsense API key |
| `OPNSENSE_API_SECRET` | ✅ | — | OPNsense API secret |
| `DEMO_MODE` | ❌ | `false` | Run with 6 mock hosts — no OPNsense required |
| `PORT` | ❌ | `3000` | Server listen port |
| `VERIFY_SSL` | ❌ | `false` | Set to `"true"` to verify SSL cert |
| `DATA_DIR` | ❌ | `./data` | Persistent data (schedules, wake history) |

### Quick Start (Demo)

```yaml
# docker-compose.yml
services:
  opnsense-wol:
    image: ironicallyjesus/opnsense-wol-dash:latest
    container_name: opnsense-wol
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      DEMO_MODE: "true"
    volumes:
      - wol_data:/data

volumes:
  wol_data:
```

```bash
docker compose up -d
# Open http://localhost:3000
```

### Production

For production, drop `DEMO_MODE`, set your OPNsense credentials, and place it behind a reverse proxy:

```yaml
services:
  opnsense-wol:
    image: ironicallyjesus/opnsense-wol-dash:latest
    container_name: opnsense-wol
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"       # Only listen on localhost → reverse proxy
    environment:
      OPNSENSE_URL: "https://opnsense.lan"
      OPNSENSE_API_KEY: "your-api-key"
      OPNSENSE_API_SECRET: "your-api-secret"
      # Optional:
      # PORT: "3000"
      # DATA_DIR: "/data"
      # VERIFY_SSL: "false"
    volumes:
      - wol_data:/data

volumes:
  wol_data:
```

> **Note:** Status is determined via OPNsense's ARP table (API), not ICMP — no special network config needed.

---

## Custom CSS

Mount your own stylesheet at `/app/custom.css` to override every visual element:

```bash
docker run -d -p 3000:3000 \
  -e DEMO_MODE=true \
  -v /path/to/cyberpunk.css:/app/custom.css \
  ironicallyjesus/opnsense-wol-dash:latest
```

Or in Docker Compose:

```yaml
volumes:
  - ./custom.css:/app/custom.css:ro
```

Use `!important` to override built-in theme styles. See [`cyberpunk.css`](./cyberpunk.css) for a complete example — neon cyan/magenta, monospace, CRT flicker, fully themed modals and tables.

---

## Building from Source

```bash
git clone https://github.com/your-username/opnsense-wol-dash.git
cd opnsense-wol-dash

# Run natively
npm install
DEMO_MODE=true node server.js

# Or build the Docker image locally
docker build -t opnsense-wol .
docker run -d -p 3000:3000 -e DEMO_MODE=true opnsense-wol
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hosts` | List hosts with ARP-based online status + IP |
| `GET` | `/api/ping/:uuid` | Ping a single host by UUID, returns RTT in ms |
| `GET` | `/api/ping` | Batch ping — cached RTT for all hosts |
| `POST` | `/api/wake/:uuid` | Send wake signal to a host by UUID |
| `POST` | `/api/wake-all` | Send wake signal to all hosts |
| `GET` | `/api/schedules` | List scheduled wake tasks |
| `POST` | `/api/schedules` | Create a scheduled wake |
| `PUT` | `/api/schedules/:id` | Update a scheduled wake |
| `DELETE` | `/api/schedules/:id` | Delete a scheduled wake |
| `GET` | `/health` | Health check |

---

## Project Structure

```
├── server.js              # Express server (API proxy + scheduler + ping)
├── lib/
│   └── scheduler.js       # In-process scheduled wake module
├── public/
│   ├── index.html         # Single-page frontend (vanilla JS, CSS variables)
│   ├── screenshot-grid.png
│   └── screenshot-table.png
├── Dockerfile             # Multi-stage Alpine Node.js build
├── docker-compose.yml     # One-command demo or production deployment
├── cyberpunk.css          # Example custom CSS theme
├── .env.example           # Environment variable template
├── .dockerignore
├── package.json
└── .gitea/workflows/      # CI/CD pipelines (GitHub Actions-compatible)
```

---

## License

[ISC](LICENSE) — do what you want with it.
