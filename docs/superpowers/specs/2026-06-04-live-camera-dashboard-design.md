# Live camera op knopdruk in het dashboard

**Datum:** 2026-06-04
**Status:** Geïmplementeerd en end-to-end getest

## Doel

Wanneer op een afstandsbediening (gekoppeld aan Homey) een knop wordt ingedrukt,
wordt de **nieuws-kaart** in het dashboard vervangen door een **live
camera-snapshot**. Bij nogmaals indrukken (of automatisch na 5 minuten) verschijnt
de nieuws-kaart weer.

Het dashboard wordt door `pagecaster` als ~3 FPS video-stream naar een Google
Home / Nest-scherm gecast; het camerabeeld verschijnt dus ook in die cast-stream.

## Scope

**In scope:** frontend (`dashboard.js`, `index.html`, `style.css`), een
Digest-proxy sidecar, nginx- en docker-compose-config, en secrets-hygiëne.

**Buiten scope:** de Homey-kant. De gebruiker heeft zelf de Flows gebouwd die de
knop afhandelen en de variabele `camera_zichtbaar` togglen + na 5 min op "Nee"
zetten. Het dashboard **leest** die status alleen.

## Architectuur & data-flow

```
[Afstandsbediening] --knop--> [Homey Flows] --toggle + 5min auto-uit-->
        Logic-variabele `camera_zichtbaar` (Ja/Nee)
                          |
              [Local API endpoint JSON]   data.home.camera_zichtbaar
                          |  (dashboard pollt elke ~2s)
                  [dashboard.js]
                          |
        "Ja"  -> nieuws-kaart wordt <img>, snapshot ~1s ververst via /camera
        "Nee" -> nieuws-kaart hersteld
                          |
   <img> /camera --> [nginx] --> [camera-proxy sidecar: Digest] --> [camera]
                          |
              alles blijft door pagecaster gerenderd -> cast (3 FPS)
```

## Belangrijke bevindingen tijdens implementatie

1. **De camera vereist Digest-authenticatie** (getest: Digest → HTTP 200 JPEG,
   Basic → 401). Een kale `<img>` naar de camera-URL faalt dus, en credentials in
   de URL worden door Chromium/pagecaster geblokkeerd. nginx kan Digest niet
   injecteren (challenge/response per request). → Oplossing: een kleine
   **Digest-proxy sidecar**.
2. **`.env` werd door git getrackt in een openbare repo** → `KNMI_API_KEY` lag al
   publiek. `.env` is uit tracking gehaald en in `.gitignore` gezet; er is een
   `.env.example` toegevoegd. De KNMI-key moet geroteerd worden.
3. **Het camera-wachtwoord bevat een `$`** dat docker-compose als variabele
   interpreteert (verminkte waarde). `interpolate: false` op `env_file` wordt door
   de compose-versie niet ondersteund. → `.env` wordt read-only in de proxy
   gemount en door `proxy.py` zelf gelezen (letterlijk, geen interpretatie).

## Componenten

### Camera-proxy sidecar (`frontend/camera-proxy/`)

- `proxy.py`: pure Python-stdlib HTTP-server die op elke GET een **verse** snapshot
  ophaalt via `urllib` met `HTTPDigestAuthHandler` en het JPEG inlogvrij teruggeeft.
  Query (cache-buster) wordt genegeerd. Credentials worden gelezen uit een gemount
  `.env` (`/app/camera.env`), met environment-variabelen als override.
- `Dockerfile`: `python:3-alpine`, draait `proxy.py` op poort 8088.
- Docker-compose service `camera-proxy`: mount `./.env:/app/camera.env:ro`.

### nginx (`frontend/nginx/default.conf.template`)

- Nieuwe `location /camera`: proxyt naar `http://camera-proxy:8088` via een
  variabele + Docker-resolver (`127.0.0.11`), zodat nginx ook start als de proxy
  nog niet draait en IP-wijzigingen volgt.

### Dashboard (`frontend/html/`)

- `CONFIG.cameraSnapshot` = `/camera` (same-origin; override via
  `window.CAMERA_SNAPSHOT_URL`).
- `INTERVALS.cameraPoll` = 2000 (statuspoll), `INTERVALS.cameraRefresh` = 1000
  (snapshot-verversing terwijl zichtbaar). `CAMERA_MAX_MS` = 360000 vangnet.
- `getCameraState()`: pollt de Homey-endpoint, parset `camera_zichtbaar` soepel
  (`true`/`"ja"`/`"yes"`/`"1"`/`"aan"`), schakelt bij toestandswisseling.
- `showCamera()` / `hideCamera()`: swap tussen `#news` en `#camera`, label
  "Nieuws" ↔ "Camera", start/stopt de snapshot-refresh.
- Vangnet met latch: blijft de vlag > 6 min "Ja", dan verbergen tot de vlag weer
  "Nee" is geweest.
- `index.html`: camera-container + LIVE-label + foutmelding in de nieuws-kaart.
- `style.css`: `#camera-feed` (object-fit: cover), LIVE-badge, foutmelding-overlay.

### Configuratie

- `.env` (gitignored): `KNMI_API_KEY`, `CAMERA_SNAPSHOT_URL`, `CAMERA_USER`,
  `CAMERA_PASS`. `.env.example` als template in de repo.

## Endpoint-contract (Homey Local API)

```json
{ "data": { "home": { "camera_zichtbaar": "Ja", ... } } }
```

> **Let op:** de Local API gaf tijdens implementatie `{"data":{"status":"error",
> "message":"Invalid JSON"}}` terug — vrijwel zeker door `''camera_zichtbaar''`
> (dubbele enkele quotes). Dat moet `"camera_zichtbaar"` zijn, anders krijgt het
> dashboard geen data.

## Foutafhandeling

| Situatie | Gedrag |
|---|---|
| `camera_zichtbaar` ontbreekt/Nee | Nieuws blijft |
| Homey-endpoint onbereikbaar | Huidige toestand vasthouden (niet knipperen) |
| Snapshot/proxy faalt (502) | `onerror`-overlay "Camera niet bereikbaar", blijft proberen |
| Vlag blijft > 6 min "Ja" | Vangnet verbergt tot vlag weer "Nee" is geweest |

## Testresultaten (2026-06-04)

- `curl --digest` → HTTP 200 JPEG; `curl --basic` → 401 (Digest bevestigd).
- Wachtwoord met `$` correct in container geladen (lengte 16).
- `/camera` via de volledige keten (nginx → proxy → camera) → HTTP 200 JPEG.
- Twee opeenvolgende requests → verschillende hashes (verse frames, geen cache).
- `node --check dashboard.js` → OK.

## Gewijzigde / nieuwe bestanden

- `frontend/html/js/dashboard.js`, `frontend/html/index.html`, `frontend/html/css/style.css`
- `frontend/camera-proxy/proxy.py`, `frontend/camera-proxy/Dockerfile`
- `frontend/nginx/default.conf.template`, `docker-compose.yml`
- `.gitignore`, `.env.example` (en `.env` uit tracking gehaald)
