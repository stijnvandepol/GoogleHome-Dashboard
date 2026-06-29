# GoogleHome Dashboard

Een lichtgewicht HTML-dashboard (tijd, weer, Homey statistieken, nieuws) dat als videostream op Google Home / Nest schermen kan worden afgespeeld. De frontend draait in een browser container, wordt door Pagecaster gerenderd tot een ~3 FPS RTMP/RTSP-stream en kan vervolgens via Scrypted naar Google Home/Chromecast worden gepusht. Ideaal om actuele informatie op je TV te “casten” zonder custom apps

## Inhoud
- Overzicht
- Architectuur & Services
- Snel starten (Docker Compose)
- Ontwikkeling / Aanpassen frontend
- Deployment via GitHub Actions
- Configuratie & Variabelen
- Troubleshooting
- Toekomst ideeën

## Overzicht
Het project bestaat uit een eenvoudige statische frontend (`frontend/html/index.html`) plus twee extra containers:
- `rtsp-server` (Mediamtx) voor RTSP/RTMP streaming
- `pagecaster` voor het renderen van de webpagina naar een stream (bijv. voor casting)

Frontend haalt live weer (KNMI EDR API — vereist een gratis API-key, zie Configuratie), Homey data (temperatuur binnen, setpoint, stroom/gas vandaag), nieuws (NOS RSS via rss2json) en op knopdruk een live camerabeeld binnen. De bronnen zijn poll-based, waardoor 1–3 FPS streaming ruim voldoende is.

## Architectuur & Services
```
+------------------+        +-------------------+        +--------------------+
|  frontend        |<------>|   pagecaster      |<------>|   rtsp-server      |
|  Static HTML/CSS |  HTTP  | Renders page      | RTMP   | Publishes stream   |
+------------------+        +-------------------+        +--------------------+
```

### docker-compose.yml / Streaming pipeline
Belangrijkste services:
- `frontend`: bouwt uit `frontend/Dockerfile` en serveert de statische HTML op poort 8080 (intern Nginx/HTTP op 80). Nginx proxyt ook `/knmi` (injecteert de `KNMI_API_KEY`) en `/camera`.
- `camera-proxy`: kleine Python-sidecar die de camera-snapshot met Digest-auth ophaalt en inlogvrij aan de browser teruggeeft (credentials blijven server-side, uit `.env`)
- `pagecaster`: headless chromium dat `http://frontend` opent en de pagina als video rendert (standaard 3 FPS)
- `rtsp-server`: Mediamtx image dat de RTMP/RTSP stream van pagecaster beschikbaar maakt voor andere systemen (bijv. Scrypted)

In Scrypted voeg je de RTSP stream toe (via `rtsp://<host>:8554/dashboard`), zet ‘Max FPS’ laag (1‑3) en stream door naar een Google Home / Chromecast automation.

## Snel Starten
Zorg dat Docker Desktop of Docker Engine + Docker Compose beschikbaar zijn.

PowerShell (Windows):
```powershell
# Project clonen
git clone https://github.com/stijnvandepol/GoogleHome-Dashboard.git
cd GoogleHome-Dashboard

# Containers builden en starten
docker compose up -d --build

# Status bekijken
docker compose ps

# Logs van een service
docker compose logs -f frontend
```
Stoppen:
```powershell
docker compose down
```

## Ontwikkeling Frontend
De frontend is pure HTML/CSS/JS zonder build stap.
Aanpassen:
1. Bewerk `frontend/html/index.html`.
2. Herstart alleen de frontend container:
```powershell
docker compose up -d --build frontend
```
Of bind-mount (optioneel) door de Dockerfile aan te passen voor sneller itereren.

## Deployment (GitHub Actions)
Workflow bestand: `.github/workflows/deploy.yml`.
Werking:
- Triggert op `push` naar `main` of handmatig (`workflow_dispatch`).
- Op self-hosted runner:
  - Haalt code op
  - `docker compose up -d --build --remove-orphans`
  - `docker compose up -d --force-recreate --no-deps pagecaster-dashboard` (zodat layout/CSS updates direct zichtbaar zijn in de stream)

Minimalistisch gehouden op verzoek (geen uitgebreide prunes/health checks). Wil je images vooraf updaten, voeg een stap toe:
```bash
docker compose pull
```

## Configuratie & Variabelen
De omgevings-/geheime waarden staan in een `.env`-bestand naast `docker-compose.yml` (zie `.env.example` voor het sjabloon; `.env` zelf staat in `.gitignore`):
- `KNMI_API_KEY` — **vereist** voor de weerdata. `docker-compose.yml` geeft deze door aan de frontend-container, waar nginx hem in de `/knmi`-proxy injecteert. Is hij leeg of verlopen, dan blijft de buitentemperatuur op de laatst bekende waarde hangen (het "Bijgewerkt"-label onder de temperatuur kleurt dan amber).
- `CAMERA_SNAPSHOT_URL`, `CAMERA_USER`, `CAMERA_PASS` — voor de camera-proxy sidecar.

De Homey-endpoint en het KNMI-station staan hardcoded in `frontend/html/js/dashboard.js` (`CONFIG.homeyApi` / `CONFIG.knmiStationId`).

`pagecaster` env vars in `docker-compose.yml`:
- `WEB_URL=http://frontend` (interne service naam)
- `AUDIO_SOURCE=silent`
- `RTMP_URL=rtmp://rtsp-server:1935/dashboard`
- `SCREEN_WIDTH=1280`, `SCREEN_HEIGHT=720`, `FRAMERATE=3` (laag gehouden omdat data elke minuut/10 min ververst)

Visuele schaal gehalveerd in `index.html` (640x360) en widgets gestyled met schaduw + gauge voor uptime. Pas `SCREEN_WIDTH`/`SCREEN_HEIGHT` eventueel aan voor lagere output resolutie.

- Frontend niet bereikbaar op host: controleer poort mapping `8080:80` en firewall.
- Weer/nieuws/Homey leeg: API tijdelijk down of netwerkprobleem; controleer Network tab / CORS headers.
- Pagecaster stream faalt: controleer dat `rtsp-server` draait en RTMP URL klopt.
- Google Home toont niets: check dat Scrypted de RTSP stream ziet, dat de FPS laag staat en dat je een ‘Restream’ naar de gewenste Chromecast hebt geconfigureerd.
- Docker compose niet gevonden in runner: installeer actuele Docker versie of gebruik `docker-compose` legacy.

Logs bekijken:
```powershell
docker compose logs -f pagecaster
docker compose logs -f rtsp-server
```
