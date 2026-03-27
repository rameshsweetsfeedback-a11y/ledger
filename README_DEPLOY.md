# Ramesh Sweets Ledger Deployment

This app can be installed on another device after you host it online over HTTPS.

## What is already prepared

- The app frontend is a PWA.
- The backend serves both the API and the frontend from one Python process.
- The server reads `HOST`, `PORT`, and optional `DATA_DIR` from environment variables.
- Deployment files included:
  - `Procfile`
  - `Dockerfile`

## Quick hosting options

### Option 0: Deploy on Render

Render's docs say a web service should bind to `0.0.0.0` and usually uses the `PORT` environment variable. Render also supports persistent disks for app data. Sources: [Render Web Services](https://render.com/docs/web-services), [Your First Render Deploy](https://render.com/docs/your-first-deploy)

Files already prepared for Render:

- `render.yaml`
- `requirements.txt`
- `ledger_api.py`

How to deploy:

1. Push this project to GitHub.
2. Sign in to Render.
3. Create a new `Web Service` from your GitHub repo.
4. Render can read `render.yaml` automatically, or you can enter settings manually.
5. After deploy, open the generated `onrender.com` URL.

Important:

- Use a persistent disk, because SQLite must be stored on durable storage.
- This app is best suited to a single-instance deployment because it uses SQLite.

### Option 1: Deploy with Docker

Build and run:

```bash
docker build -t rs-ledger .
docker run -p 8000:8000 -e PORT=8000 rs-ledger
```

Then open:

```text
http://localhost:8000
```

### Option 1B: Deploy with Docker Compose on a VPS

Install Docker Desktop or Docker Engine with Docker Compose. Docker's docs say Docker Desktop is the recommended way to get Docker Compose on Windows/Mac, and Docker Compose is the tool for defining and running multi-container applications. Sources: [Install Docker Compose](https://docs.docker.com/compose/install/), [Docker Compose overview](https://docs.docker.com/guides/docker-compose/)

On the VPS:

```bash
git clone <your-repo-url>
cd <your-repo-folder>
docker compose up -d --build
```

Then open:

```text
http://your-server-ip:8000
```

Data persists in the Docker volume `ledger_data`.

### Option 2: Deploy to a Python host

Run:

```bash
python ledger_api.py
```

Environment variables:

- `HOST=0.0.0.0`
- `PORT=8000`
- `DATA_DIR=/path/to/persistent/storage` (optional but recommended)

## Install on another device

After hosting on HTTPS:

1. Open the hosted URL on the device.
2. In Chrome/Edge/Android Chrome, choose install/add to home screen.
3. The app will install as a PWA.

## Important

- If you want shared data across devices, host one central server and persistent database storage.
- Do not rely on the local Windows `ledger.db` file for multi-device use.
- For Android or installed PWA usage on other devices, put this behind HTTPS with a domain or reverse proxy.
