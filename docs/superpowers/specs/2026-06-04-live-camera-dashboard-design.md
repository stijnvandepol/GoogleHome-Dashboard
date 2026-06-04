# Live camera op knopdruk in het dashboard

**Datum:** 2026-06-04
**Status:** Ontwerp goedgekeurd, klaar voor implementatieplan

## Doel

Wanneer op een afstandsbediening (gekoppeld aan Homey) een knop wordt ingedrukt,
moet de **nieuws-kaart** in het dashboard worden vervangen door een **live
camerabeeld**. Bij nogmaals indrukken (of automatisch na 5 minuten) verschijnt
de nieuws-kaart weer.

Het dashboard wordt door `pagecaster` als ~3 FPS video-stream naar een Google
Home / Nest-scherm gecast. Het camerabeeld verschijnt dus ook in die cast-stream.

## Scope

**In scope:** wijzigingen aan de frontend (`dashboard.js`, `index.html`,
`style.css`).

**Buiten scope:** de Homey-kant. De gebruiker heeft zelf de Flows gebouwd die
de knop afhandelen en de variabele `camera_zichtbaar` togglen + na 5 minuten weer
op "Nee" zetten. Het dashboard hoeft die status alleen te **lezen** en erop te
reageren.

## Architectuur & data-flow

```
[Afstandsbediening] --knop--> [Homey Flows] --toggle + 5min auto-uit-->
        Logic-variabele `camera_zichtbaar` (Ja/Nee)
                          |
              [Local API endpoint JSON]   data.home.camera_zichtbaar
                          |  (dashboard pollt elke ~2s)
                  [dashboard.js]
                          |
        "Ja"  -> nieuws-kaart wordt vervangen door <img> (snapshot, ~1s refresh)
        "Nee" -> nieuws-kaart wordt hersteld
                          |
              alles blijft door pagecaster gerenderd -> cast (3 FPS)
```

### Waarom geen nginx-proxy

Een `<img>`-tag is niet onderworpen aan CORS, en de pagina draait over HTTP
(`pagecaster` opent `http://frontend`), dus er is geen mixed-content-probleem.
De snapshot kan daarom **rechtstreeks** in een `<img>` geladen worden. De eerder
overwogen `/camera/` nginx-proxy is niet nodig. (Zou alleen lonen bij HTTPS of
camera-credentials — die de snapshot-URL niet heeft.)

## Endpoint-contract

De bestaande Homey Local API endpoint (`CONFIG.homeyApi`) levert nu ook:

```json
{ "data": { "home": { "camera_zichtbaar": "Ja", ... } } }
```

De waarde wordt **soepel** geparsed: camera tonen bij `true`, `"Ja"`, `"ja"`,
`"yes"`, `1` of `"1"`; anders verbergen. Ontbreekt het veld → behandelen als
"niet tonen". Dit maakt de code robuust ongeacht hoe Local API de boolean
serialiseert.

## Componenten (frontend)

### Configuratie (`dashboard.js`)

Toevoegen aan `CONFIG`:
- `cameraSnapshot`: snapshot-URL, default `http://192.168.1.17/images/snapshot.jpg`,
  overschrijfbaar via `window.CAMERA_SNAPSHOT_URL` (zelfde patroon als `HOMEY_API`).

Toevoegen aan `INTERVALS`:
- `cameraPoll`: `2000` — hoe vaak `camera_zichtbaar` gepolld wordt.
- `cameraRefresh`: `1000` — hoe vaak de snapshot ververst wordt terwijl de camera zichtbaar is.

Constante:
- `CAMERA_MAX_MS`: `360000` (6 min) — client-side vangnet, iets langer dan Homey's 5 min.

### Status-poll: `getCameraState()`

- Pollt elke `cameraPoll` ms de bestaande `CONFIG.homeyApi` endpoint.
- Leest `data.home.camera_zichtbaar` en bepaalt gewenste toestand (aan/uit) via
  de soepele parser.
- Roept `showCamera()` of `hideCamera()` aan bij een **toestandswisseling**
  (niet elke poll opnieuw renderen).
- Bij netwerkfout: huidige toestand **vasthouden** (niet knipperen).
- Draait los van `getHomeyStatus()` (metrics blijven op 60s).

### Tonen: `showCamera()`

- Vervangt de inhoud van de nieuws-kaart door een `<img id="camera-feed">`.
- Start een refresh-interval (`cameraRefresh`) dat `img.src` zet op
  `cameraSnapshot + '?ts=' + Date.now()` (cache-buster, defeat browser-cache).
- Legt starttijd vast voor het vangnet.
- `img.onerror` → toont "Camera niet bereikbaar" maar blijft proberen.

### Verbergen: `hideCamera()`

- Stopt het refresh-interval.
- Herstelt de nieuws-lijst-container en roept `getNews()` aan om opnieuw te vullen.

### Vangnet (latch)

- Blijft `camera_zichtbaar` onverhoopt "Ja" langer dan `CAMERA_MAX_MS`, dan
  verbergt het dashboard de camera tóch.
- Een **latch** voorkomt dat de eerstvolgende 2s-poll hem direct weer toont: pas
  als de vlag minstens één keer "Nee" is geweest, mag de camera weer verschijnen.

### HTML (`index.html`)

- De bestaande nieuws-kaart (`article.card.news-card`) houdt zijn plek; de
  inhoud (`#news`) wordt geswapt. Eventueel een wrapper-element voor nette
  swap tussen nieuws-lijst en camera-`<img>`.

### CSS (`style.css`)

- `#camera-feed` vult de kaart (`width:100%`, `height:100%`, `object-fit:cover`,
  passend binnen de bestaande card-styling en afgeronde hoeken).
- Optioneel een klein "LIVE"-label.
- Foutmelding-styling consistent met bestaande `.loading`.

## Foutafhandeling (samenvatting)

| Situatie | Gedrag |
|---|---|
| `camera_zichtbaar` ontbreekt | Behandelen als "Nee" (nieuws blijft) |
| Endpoint onbereikbaar tijdens poll | Huidige toestand vasthouden |
| Snapshot laadt niet | `onerror`-placeholder, blijft proberen |
| Vlag blijft > 6 min "Ja" | Vangnet verbergt camera tot vlag weer "Nee" is geweest |

## Testen

- Snapshot-URL levert een afbeelding (browser/curl).
- Vlag handmatig op "Ja" → binnen ~2s camera in beeld, ververst elke ~1s; "Nee" → nieuws terug.
- Auto-uit: na Homey's 5 min verdwijnt de camera vanzelf.
- Vangnet: gesimuleerde vastzittende vlag → camera verdwijnt na ~6 min.
- End-to-end: knop op de remote → camera verschijnt op het Nest-scherm in de cast-stream.

## Gewijzigde bestanden

- `frontend/html/js/dashboard.js` — config, poll, show/hide, vangnet.
- `frontend/html/index.html` — wrapper rond nieuws/camera-inhoud (indien nodig).
- `frontend/html/css/style.css` — camera-`<img>` en label-styling.
