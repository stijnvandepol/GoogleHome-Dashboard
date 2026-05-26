(() => {
  'use strict';

  const CONFIG = {
    homeyApi: window.HOMEY_API || 'http://192.168.1.21:3000/BaYYjdNFpMdyeqOTRHpbYzLTbRTRgu',
    knmiApiKey: window.KNMI_API_KEY || '',
    knmiStationId: window.KNMI_STATION_ID || '0-20000-0-06375',
    knmiStationLabel: window.KNMI_STATION_LABEL || '',
    knmiEdrBase: 'https://api.dataplatform.knmi.nl/edr/v1/collections/10-minute-in-situ-meteorological-observations',
    knmiProxyBase: '/knmi',
    weatherCacheKey: 'dashboard-weather-cache-v1',
    newsFeed: 'http://feeds.nos.nl/nosnieuwsalgemeen',
    newsApi: 'https://api.rss2json.com/v1/api.json'
  };

  const INTERVALS = {
    clock: 1000,
    weather: 300000,
    news: 600000,
    homey: 60000
  };

  const PRESENCE_PERSONS = [
    { key: 'aanwezigheid_stijn', color: '#7da67d', name: 'Stijn' },
    { key: 'aanwezigheid_britt', color: '#c4a24e', name: 'Britt' },
    { key: 'aanwezigheid_rens', color: '#6b9e6b', name: 'Rens' },
    { key: 'aanwezigheid_sandra', color: '#9b7ec4', name: 'Sandra' },
    { key: 'aanwezigheid_alfredo', color: '#c75a5a', name: 'Alfredo' }
  ];

  const DOM = {
    clock: document.getElementById('clock'),
    date: document.getElementById('date'),
    presence: document.getElementById('presence'),
    weather: document.getElementById('weather'),
    homey: document.getElementById('homey'),
    news: document.getElementById('news')
  };

  // --- Helpers ---

  function setHTML(el, html) {
    if (el) el.innerHTML = html;
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value, decimals, suffix = '') {
    if (value === undefined || value === null || Number.isNaN(value)) {
      return '--';
    }
    return `${Number(value).toFixed(decimals)}${suffix}`;
  }

  function formatWeatherTimestamp(value) {
    if (!value) return 'Onbekend';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Onbekend';
    return date.toLocaleString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Amsterdam'
    });
  }

  function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Zojuist';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minuten geleden`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} uur geleden`;
    return `${Math.floor(seconds / 86400)} dagen geleden`;
  }

  // --- KNMI Weather ---

  function buildKnmiUrl(endpoint, params) {
    const base = CONFIG.knmiProxyBase || CONFIG.knmiEdrBase;
    const baseUrl = CONFIG.knmiProxyBase ? window.location.origin : undefined;
    const url = new URL(`${base.replace(/\/$/, '')}/${endpoint}`, baseUrl);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }

  function getCoverage(data) {
    if (Array.isArray(data?.coverages) && data.coverages.length > 0) {
      return data.coverages[0];
    }
    if (data?.coverage) return data.coverage;
    return data;
  }

  function getTimeAxis(coverage) {
    const axes = coverage?.domain?.axes || {};
    return axes.t?.values || axes.time?.values || axes.datetime?.values || [];
  }

  function getUnit(coverage, paramName) {
    const unit = coverage?.parameters?.[paramName]?.unit;
    return unit?.symbol || unit?.label || '';
  }

  function extractLatestValue(coverage, paramName) {
    const range = coverage?.ranges?.[paramName];
    const values = range?.values || [];
    const times = getTimeAxis(coverage);
    for (let i = values.length - 1; i >= 0; i -= 1) {
      const v = values[i];
      if (v !== null && v !== undefined && !Number.isNaN(v)) {
        return {
          value: v,
          time: times[i] || null,
          unit: getUnit(coverage, paramName)
        };
      }
    }
    return { value: null, time: null, unit: getUnit(coverage, paramName) };
  }

  function saveWeatherCache(payload) {
    try {
      localStorage.setItem(CONFIG.weatherCacheKey, JSON.stringify(payload));
    } catch (err) {
      console.warn('Weather cache save failed', err);
    }
  }

  function loadWeatherCache() {
    try {
      const raw = localStorage.getItem(CONFIG.weatherCacheKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Weather cache load failed', err);
      return null;
    }
  }

  // --- Render functions ---

  function renderWeather(payload, isFallback = false) {
    if (!payload) return false;
    const temp = formatNumber(payload.temp, 1, payload.tempSuffix || '°C');
    const humidity = formatNumber(payload.humidity, 0, payload.humiditySuffix || '%');
    const wind = formatNumber(payload.wind, 1, payload.windSuffix || ' m/s');

    setHTML(DOM.weather, `
      <div class="weather-temp">${temp}</div>
      <div class="weather-detail">
        Luchtvochtigheid: ${humidity}<br>
        Wind: ${wind}
      </div>
    `);
    return true;
  }

  function renderPresence(data) {
    if (!DOM.presence) return;

    const active = PRESENCE_PERSONS.filter(p => data[p.key]);
    if (active.length === 0) {
      setHTML(DOM.presence, `
        <div class="presence-label">Thuis</div>
        <div class="presence-list">
          <div class="presence-empty">Niemand</div>
        </div>
      `);
      return;
    }

    const pills = active.map(p => `
      <div class="presence-pill" title="${escapeHtml(p.name)}">
        <span class="presence-dot" style="background:${p.color};"></span>
        <span class="presence-name">${escapeHtml(p.name)}</span>
      </div>
    `);

    setHTML(DOM.presence, `
      <div class="presence-label">Thuis</div>
      <div class="presence-list">
        ${pills.join('')}
      </div>
    `);
  }

  // --- Clock ---

  function updateTime() {
    const now = new Date();
    const clock = now.toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Amsterdam'
    });
    const date = now.toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Amsterdam'
    });
    setText(DOM.clock, clock);
    setText(DOM.date, date);
  }

  // --- Data fetching ---

  async function getWeather() {
    try {
      const cached = loadWeatherCache();
      if (cached) {
        renderWeather(cached, true);
      }

      const useProxy = CONFIG.knmiProxyBase && CONFIG.knmiProxyBase.startsWith('/');
      if ((!useProxy && !CONFIG.knmiApiKey) || CONFIG.knmiStationId.includes('XXXXX')) {
        setHTML(DOM.weather, '<div class="loading">Stel KNMI_API_KEY en KNMI_STATION_ID in</div>');
        return;
      }

      const now = new Date();
      const start = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const datetime = `${start.toISOString()}/${now.toISOString()}`;

      const url = buildKnmiUrl(`locations/${CONFIG.knmiStationId}`, {
        'parameter-name': 'ta,rh,ff',
        datetime
      });

      const resp = await fetch(url, useProxy ? {} : {
        headers: { Authorization: CONFIG.knmiApiKey }
      });
      if (!resp.ok) throw new Error(`KNMI HTTP ${resp.status}`);
      const data = await resp.json();
      const coverage = getCoverage(data);

      const ta = extractLatestValue(coverage, 'ta');
      const rh = extractLatestValue(coverage, 'rh');
      const ff = extractLatestValue(coverage, 'ff');

      const payload = {
        temp: ta.value,
        tempSuffix: ta.unit || '°C',
        humidity: rh.value,
        humiditySuffix: rh.unit ? ` ${rh.unit}` : '%',
        wind: ff.value,
        windSuffix: ff.unit ? ` ${ff.unit}` : ' m/s',
        desc: CONFIG.knmiStationLabel ? `KNMI ${CONFIG.knmiStationLabel}` : '',
        updatedAt: ta.time || rh.time || ff.time || new Date().toISOString()
      };

      saveWeatherCache(payload);
      renderWeather(payload);
    } catch (err) {
      console.error('Weather fetch error', err);
      const cached = loadWeatherCache();
      if (!renderWeather(cached, true)) {
        setHTML(DOM.weather, '<div class="loading">Weerdata wordt bijgewerkt</div>');
      }
    }
  }

  async function getNews() {
    try {
      const url = `${CONFIG.newsApi}?rss_url=${encodeURIComponent(CONFIG.newsFeed)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data?.items || data.items.length === 0) {
        setHTML(DOM.news, '<div class="loading">Geen nieuws beschikbaar</div>');
        return;
      }

      const items = data.items.slice(0, 4)
        .map(item => {
          const date = new Date(item.pubDate);
          return `
            <div class="news-item">
              <div class="news-headline">${escapeHtml(item.title)}</div>
              <div class="news-meta">${timeAgo(date)}</div>
            </div>`;
        })
        .join('');

      setHTML(DOM.news, items);
    } catch (err) {
      console.error('News fetch error', err);
      setHTML(DOM.news, '<div class="loading">Kon nieuws niet laden</div>');
    }
  }

  async function getHomeyStatus() {
    try {
      const resp = await fetch(CONFIG.homeyApi);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const payload = await resp.json();
      const data = payload?.data?.home || {};

      const tBinnen = formatNumber(data.temperatuur_binnen, 1, '°C');
      const tSet = formatNumber(data.temperatuur_ingesteld, 1, '°C');
      const stroom = formatNumber(data.stroomverbruik_vandaag, 2);
      const gas = formatNumber(data.gasverbruik_vandaag, 3);

      setHTML(DOM.homey, `
        <div class="metrics">
          <div>
            <div class="metric-label">Temp. binnen</div>
            <div class="metric-value">${tBinnen}</div>
          </div>
          <div>
            <div class="metric-label">Ingesteld</div>
            <div class="metric-value">${tSet}</div>
          </div>
          <div>
            <div class="metric-label">Stroom vandaag</div>
            <div class="metric-value">${stroom} <span style="font-size:14px;color:#8b7a65;">kWh</span></div>
          </div>
          <div>
            <div class="metric-label">Gas vandaag</div>
            <div class="metric-value">${gas} <span style="font-size:14px;color:#8b7a65;">m³</span></div>
          </div>
        </div>
      `);

      renderPresence(data);
    } catch (err) {
      console.error('Homey fetch error', err);
      setHTML(DOM.homey, '<div class="loading">Niet beschikbaar</div>');
      setHTML(DOM.presence, `
        <div class="presence-label">Thuis</div>
        <div class="presence-list">
          <div class="presence-empty">Onbekend</div>
        </div>
      `);
    }
  }

  // --- Init ---

  function init() {
    updateTime();
    getWeather();
    getNews();
    getHomeyStatus();

    setInterval(updateTime, INTERVALS.clock);
    setInterval(getWeather, INTERVALS.weather);
    setInterval(getNews, INTERVALS.news);
    setInterval(getHomeyStatus, INTERVALS.homey);
  }

  init();
})();
