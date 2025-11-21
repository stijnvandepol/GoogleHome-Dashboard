# GoogleHome Dashboard

Een lichtgewicht dashboard voor weergave van tijd, weer, verkeer en nieuws, bedoeld voor een scherm (bijv. in de keuken) en inzetbaar samen met een stream infrastructuur (RTSP + Pagecaster) voor weergave via andere apparaten.

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

Frontend haalt live weer (Open-Meteo), uptime (Uptime Kuma status page), nieuws (NOS RSS via rss2json) en Nederlandse feestdagen (Nager Date) binnen. Alle gebruikte bronnen zijn gratis en vereisen geen API sleutel.

## Architectuur & Services
```
+------------------+        +-------------------+        +--------------------+
|  frontend        |<------>|   pagecaster      |<------>|   rtsp-server      |
|  Static HTML/CSS |  HTTP  | Renders page      | RTMP   | Publishes stream   |
+------------------+        +-------------------+        +--------------------+
```

### docker-compose.yml
Belangrijkste services:
- `frontend`: bouwt uit `frontend/Dockerfile` en serveert de statische HTML op poort 8080 (intern Nginx/HTTP op 80)
- `rtsp-server`: Mediamtx image voor RTSP/RTMP (poort 8554)
- `pagecaster`: Haalt de pagina `http://frontend` op en publiceert video (optioneel voor casting)

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
Workflow bestand: `.github/workflows/blank.yml` (hernoem eventueel naar `deploy.yml`).
Werking:
- Triggert op `push` naar `main` of handmatig (`workflow_dispatch`).
- Op self-hosted runner:
  - Haalt code op
  - `docker compose down`
  - `docker compose up -d --build --remove-orphans`

Minimalistisch gehouden op verzoek (geen uitgebreide prunes/health checks). Wil je images vooraf updaten, voeg een stap toe:
```bash
docker compose pull
```

## Configuratie & Variabelen
`frontend/html/config.example.js` bevat locatie + Uptime Kuma instellingen (geen sleutels nodig). Kopieer naar `config.js` voor lokale overrides.

`pagecaster` env vars in `docker-compose.yml`:
- `WEB_URL=http://frontend` (interne service naam)
- `AUDIO_SOURCE=silent`
- `RTMP_URL=rtmp://rtsp-server:1935/dashboard`
- `SCREEN_WIDTH=1280`, `SCREEN_HEIGHT=720`, `FRAMERATE=15`

Visuele schaal gehalveerd in `index.html` (640x360) en widgets gestyled met schaduw + gauge voor uptime. Pas `SCREEN_WIDTH`/`SCREEN_HEIGHT` eventueel aan voor lagere output resolutie.

## Troubleshooting
- Frontend niet bereikbaar op host: controleer poort mapping `8080:80` en firewall.
- Weer/nieuws/feestdagen leeg: API tijdelijk down of netwerkprobleem; controleer Network tab.
- Uptime leeg: controleer dat Uptime Kuma status page publiek is en CORS toestaat vanaf dashboard host (anders reverse proxy met CORS headers toevoegen).
- Pagecaster stream faalt: controleer dat `rtsp-server` draait en RTMP URL klopt.
- Docker compose niet gevonden in runner: installeer actuele Docker versie of gebruik `docker-compose` legacy.

Logs bekijken:
```powershell
docker compose logs -f pagecaster
docker compose logs -f rtsp-server
```

## Toekomst Ideeën
- Live verkeer via ANWB/TomTom API
- Cachelaag voor RSS/weer om API calls te beperken
- Auth (basic) voor gevoelige dashboards
- Dark/Light thema toggle
- Metrics panel (CPU/Memory van host via Node exporter + Prometheus)
- Websocket live updates i.p.v. periodieke polling

## Licentie
(Voeg hier een licentie toe indien gewenst, bv. MIT.)

---
Vragen of uitbreiden? Open een issue of maak een pull request.
