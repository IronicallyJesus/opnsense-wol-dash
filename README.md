# OPNsense WOL

![Wake-on-LAN Dashboard](./screenshot.png)

A lightweight web dashboard for waking devices on your network through the OPNsense WOL plugin API. Built with Express.js and Tailwind CSS.

## Features

| Feature | Description |
|---|---|
| **Host Discovery** | Fetches all WOL-configured hosts directly from OPNsense |
| **One-Click Wake** | Sends magic packet via OPNsense API with toast confirmation |
| **Responsive Grid** | Card-based layout adapts from 1 to 3 columns |
| **Sanitized Display** | Host descriptions and MAC addresses are HTML-escaped |
| **Dockerized** | Multi-stage Docker build with production-only dependencies |
| **CI/CD** | Gitea Actions workflow builds and deploys on version tags |

## How It Works

```
┌──────────┐     ┌───────────────────┐     ┌─────────────────┐
│  Browser │────►│  Express Server   │────►│  OPNsense API    │
│ (UI)     │     │  (Node.js)        │     │  (WOL Plugin)    │
└──────────┘     └───────────────────┘     └─────────────────┘
                       │                          │
                   GET /api/hosts           POST /api/wol/wol/searchHost
                   POST /api/wake/:uuid     POST /api/wol/wol/set
```

The Express server acts as a bridge between the browser and the OPNsense API:

1. **List hosts** — queries OPNsense's `wol/searchHost` endpoint and returns raw host data
2. **Wake host** — sends a magic packet via OPNsense's `wol/set` endpoint

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

### Development

```sh
git clone https://git.twk95.com/twk95/opnsense-wol.git
cd opnsense-wol
npm install

OPNSENSE_URL=https://opnsense.lan \
OPNSENSE_API_KEY=your-key \
OPNSENSE_API_SECRET=your-secret \
node server.js
```

Open `http://localhost:3000` to view the dashboard.

### Docker

```sh
docker build -t opnsense-wol .

docker run -d \
  -p 3000:3000 \
  -e OPNSENSE_URL=https://opnsense.lan \
  -e OPNSENSE_API_KEY=your-key \
  -e OPNSENSE_API_SECRET=your-secret \
  opnsense-wol
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hosts` | List all WOL hosts from OPNsense |
| `POST` | `/api/wake/:uuid` | Send wake signal to a host by UUID |
| `GET` | `/health` | Health check endpoint |

## Project Structure

```
├── server.js            # Express server (API proxy)
├── public/
│   └── index.html       # Frontend (Tailwind CSS via CDN)
├── Dockerfile           # Multi-stage production build
├── package.json
└── .gitea/workflows/    # CI/CD (Docker build + deploy on v* tags)
```

## License

ISC
