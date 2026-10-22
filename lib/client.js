/**
 * Weather whisper — a gentle greeting card that says today's weather, tomorrow's
 * outlook, the coming week, any rough weather on the way, and what to wear.
 *
 * Pure DOM in a shadow root: no React, no host-side code, no dependencies.
 * Everything visual is themable at runtime — see THEME below.
 */
window.__ModuleLoader__.load({
  id: "dsh-weather-whisper",
  factory: (require) => {
    "use strict";

    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const VERSION = "0.3.0";
    const CACHE_KEY = "dsh-weather-whisper:cache:v2";
    const CITY_KEY = "dsh-weather-whisper:city";
    const POS_KEY = "dsh-weather-whisper:pos";
    const SHOWN_KEY = "dsh-weather-whisper:shown";
    const THEME_KEY = "dsh-weather-whisper:theme";
    const CACHE_MS = 30 * 60 * 1000;

    /* ────────────────────────────── theme ────────────────────────────── */

    /**
     * A theme is `{ palette, decor, radius }`. Anything missing falls back to
     * the defaults below, so a caller can pass a single colour and be done.
     *
     *   palette  bg · bg2 · fg · dim · accent · line · alert
     *   decor    sep (section divider, "" hides it) · corner (corner mark)
     *            glyphs ("hanzi" | "emoji") · sparkle (mark beside the temp)
     *   radius   card corner radius, 6–26
     */
    const DEFAULT_THEME = {
      palette: {
        bg: "#2b303c",
        bg2: "#171a21",
        fg: "#e7ecf7",
        dim: "#9fb0cc",
        accent: "#d8deea",
        line: "#8fa1c0",
        alert: "#e6c9a8",
      },
      decor: { sep: "┄┄┄", corner: "", glyphs: "hanzi", sparkle: false },
      radius: 18,
    };

    const PRESETS = {
      graphite: {
        label: "石墨",
        palette: { ...DEFAULT_THEME.palette },
        decor: { ...DEFAULT_THEME.decor },
        radius: 18,
      },
      ink: {
        label: "墨白",
        palette: { bg: "#14161a", bg2: "#0b0c0e", fg: "#f2f1ec", dim: "#a8a69e", accent: "#f2f1ec", line: "#6f7380", alert: "#e8dcc4" },
        decor: { sep: "───", corner: "❋", glyphs: "hanzi", sparkle: false },
        radius: 14,
      },
      sand: {
        label: "暖沙",
        palette: { bg: "#3a332b", bg2: "#241f1a", fg: "#f4ece0", dim: "#c3b4a0", accent: "#e8cfa6", line: "#8f7f6c", alert: "#f0c9a0" },
        decor: { sep: "・ ・ ・", corner: "❀", glyphs: "hanzi", sparkle: true },
        radius: 20,
      },
      sakura: {
        label: "樱粉",
        palette: { bg: "#3b2b33", bg2: "#241a20", fg: "#fbe9ef", dim: "#d3aab8", accent: "#f5c2d0", line: "#a3788a", alert: "#f3c6b4" },
        decor: { sep: "✿ ✿ ✿", corner: "✿", glyphs: "hanzi", sparkle: true },
        radius: 20,
      },
      deepsea: {
        label: "深海",
        palette: { bg: "#172630", bg2: "#0b1319", fg: "#dceaf2", dim: "#8aa9bb", accent: "#9fd6e6", line: "#587a8c", alert: "#e5cf9f" },
        decor: { sep: "〜〜〜", corner: "", glyphs: "hanzi", sparkle: false },
        radius: 18,
      },
    };

    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

    function merge(base, patch) {
      if (!isObj(patch)) return base;
      const out = { ...base };
      for (const [k, v] of Object.entries(patch)) {
        out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
      }
      return out;
    }

    /**
     * DSH picks a fresh port on every launch, so localStorage (origin-scoped)
     * forgets everything between runs. Cookies are scoped by host, not port —
     * that is what actually keeps the theme and the card position.
     */
    function readStored(key) {
      const m = document.cookie.match(new RegExp('(?:^|; )ww_' + key + '=([^;]*)'));
      if (m) {
        try {
          return decodeURIComponent(m[1]);
        } catch {
          /* fall through */
        }
      }
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }

    function writeStored(key, value) {
      try {
        document.cookie = 'ww_' + key + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax';
      } catch {
        /* cookies may be disabled */
      }
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore quota */
      }
    }

    function loadTheme() {      let saved = null;
      try {
        saved = JSON.parse(readStored(THEME_KEY) || "null");
      } catch {
        saved = null;
      }
      const merged = merge(DEFAULT_THEME, saved);
      merged.radius = Math.min(26, Math.max(6, Number(merged.radius) || 18));
      const glyphs = merged.decor.glyphs === "emoji" ? "emoji" : "hanzi";
      merged.decor = { ...merged.decor, glyphs };
      return merged;
    }

    function saveTheme(theme) {
      try {
        writeStored(THEME_KEY, JSON.stringify(theme));
      } catch {
        /* ignore quota */
      }
    }

    /* ────────────────────────────── data ─────────────────────────────── */

    const WMO = {
      0: ["晴朗", "☀️"], 1: ["大致晴朗", "🌤️"], 2: ["多云", "⛅"], 3: ["阴天", "☁️"],
      45: ["有雾", "🌫️"], 48: ["雾凇", "🌫️"],
      51: ["细毛毛雨", "🌦️"], 53: ["毛毛雨", "🌦️"], 55: ["密毛毛雨", "🌦️"],
      56: ["冻毛毛雨", "🌧️"], 57: ["冻毛毛雨", "🌧️"],
      61: ["小雨", "🌦️"], 63: ["中雨", "🌧️"], 65: ["大雨", "🌧️"],
      66: ["冻雨", "🌧️"], 67: ["强冻雨", "🌧️"],
      71: ["小雪", "🌨️"], 73: ["中雪", "🌨️"], 75: ["大雪", "🌨️"], 77: ["米雪", "🌨️"],
      80: ["阵雨", "🌦️"], 81: ["强阵雨", "🌧️"], 82: ["暴阵雨", "⛈️"],
      85: ["阵雪", "🌨️"], 86: ["强阵雪", "🌨️"],
      95: ["雷阵雨", "⛈️"], 96: ["雷暴伴冰雹", "⛈️"], 99: ["雷暴伴强冰雹", "⛈️"],
    };
    const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

    /** One glyph is enough at 10px, where emoji go blocky. */
    function short(code) {
      const c = Number(code) || 0;
      if (c === 0 || c === 1) return "晴";
      if (c === 2) return "云";
      if (c === 3) return "阴";
      if (c === 45 || c === 48) return "雾";
      if (c >= 95) return "雷";
      if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "雪";
      if (c >= 51 && c <= 82) return "雨";
      return "云";
    }

    function timeout(ms) {
      const ctl = new AbortController();
      const id = setTimeout(() => ctl.abort(), ms);
      return { signal: ctl.signal, done: () => clearTimeout(id) };
    }

    async function fetchJson(url, ms = 8000) {
      const t = timeout(ms);
      try {
        const res = await fetch(url, { signal: t.signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally {
        t.done();
      }
    }

    function greeting(h = new Date().getHours()) {
      if (h < 5) return "夜深了";
      if (h < 9) return "早安";
      if (h < 12) return "上午好";
      if (h < 14) return "午安";
      if (h < 18) return "下午好";
      if (h < 23) return "晚上好";
      return "夜深了";
    }

    function beaufort(kmh) {
      const bounds = [1, 5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117];
      let level = 0;
      for (const b of bounds) if (kmh >= b) level += 1;
      return level;
    }

    const r0 = (v) => Math.round(Number(v) || 0);

    function advice(d) {
      const feels = d.feels;
      const a = [];
      if (feels >= 30) a.push("短袖就够啦，防晒和水都别忘了");
      else if (feels >= 26) a.push("短袖或薄衬衫刚好，怕冷带件薄外套");
      else if (feels >= 22) a.push("长袖正合适，室内可能有点凉");
      else if (feels >= 18) a.push("薄毛衣或卫衣，外面套一件");
      else if (feels >= 12) a.push("毛衣配外套，风吹着会凉");
      else if (feels >= 6) a.push("厚外套或风衣，围巾可以带上了");
      else if (feels >= 0) a.push("羽绒服或厚呢大衣，别硬扛");
      else a.push("厚羽绒服、帽子手套都安排上");
      if (d.rain >= 50) a.push("降水概率不低，伞放进包里");
      else if (d.rain >= 30) a.push("也许有小雨，带把折叠伞更稳");
      if (d.wind >= 25) a.push("风有点大，外套挑挡风的");
      return a;
    }

    function tempTip(d) {
      const spread = d.max - d.min;
      if (d.max >= 33) return "紫外线强，中午尽量避开日晒";
      if (spread >= 12) return "今天温差很大，早晚差出十几度";
      if (spread >= 9) return "早晚温差有点大，外套别忘";
      if (d.humidity >= 85) return "空气很潮，衣服穿宽松透气的";
      if (d.humidity <= 30) return "空气偏干，多喝点水";
      if (d.min <= 2) return "清晨可能会结冰，脚下留神";
      if (d.feels >= 28 && d.humidity >= 70) return "又闷又热，别在外面待太久";
      if (d.humidity >= 70) return `湿度 ${r0(d.humidity)}%，体感会再凉一点`;
      return `体感 ${r0(d.feels)}°，空气挺清爽的`;
    }

    function careLine(d, now = new Date()) {
      const h = now.getHours();
      const pool = [];
      if (h < 9) pool.push("出门前喝口热水，胃会舒服一点。");
      if (d.rain >= 50) pool.push("路上慢一点，鞋子挑不怕水的。");
      if (d.min <= 8) pool.push("手会凉，口袋里塞个手套吧。");
      if (d.max >= 30) pool.push("记得找个阴凉地儿歇一会儿。");
      pool.push("今天也要好好吃饭呀。");
      pool.push("慢慢来，不着急。");
      pool.push("愿你今天遇到的人都很好。");
      const seed = Number(`${now.getMonth()}${now.getDate()}`) + (d.code || 0);
      return pool[seed % pool.length];
    }

    /** Rough severe-weather scan over 36 hours plus today/tomorrow extremes. */
    function alertsOf(d) {
      const out = [];
      const hourly = d.hourly || {};
      const hours = hourly.time || [];
      let maxPrecip = 0;
      let maxGust = 0;
      let stormAt = "";
      let snowAt = "";
      for (let i = 0; i < hours.length && i < 36; i++) {
        const p = Number((hourly.precipitation || [])[i] || 0);
        if (p > maxPrecip) {
          maxPrecip = p;
          if (p >= 6) stormAt = hours[i];
        }
        const g = Number((hourly.wind_gusts_10m || [])[i] || 0);
        if (g > maxGust) maxGust = g;
        const c = Number((hourly.weather_code || [])[i] || 0);
        if (c >= 95 && !stormAt) stormAt = hours[i];
        if (((c >= 71 && c <= 77) || c === 85 || c === 86) && !snowAt) snowAt = hours[i];
      }
      const when = (iso) => {
        if (!iso) return "";
        const dt = new Date(iso);
        const today = new Date();
        const tomorrow = new Date(Date.now() + 864e5);
        const day =
          dt.getDate() === today.getDate() && dt.getMonth() === today.getMonth()
            ? "今天"
            : dt.getDate() === tomorrow.getDate() && dt.getMonth() === tomorrow.getMonth()
              ? "明天"
              : `周${WEEK[dt.getDay()]}`;
        return `${day}${String(dt.getHours()).padStart(2, "0")}点`;
      };
      if (maxPrecip >= 12) out.push(`${when(stormAt)}前后雨势很急，短时可能积水`);
      else if (maxPrecip >= 6) out.push(`${when(stormAt)}有一阵急雨，伞和防水鞋备着`);
      if (maxGust >= 62) out.push(`阵风可能到 ${beaufort(maxGust)} 级，阳台的东西收一收`);
      else if (maxGust >= 50) out.push("风会突然变大，出门抓稳帽子");
      if (snowAt) out.push(`${when(snowAt)}可能飘雪，路面会滑`);
      const peak = Math.max(d.max, d.tomorrow ? d.tomorrow.max : d.max);
      const low = Math.min(d.min, d.tomorrow ? d.tomorrow.min : d.min);
      if (peak >= 35) out.push(`最高 ${peak}°，注意中暑和补水`);
      if (low <= -5) out.push(`最低 ${low}°，小心冻伤和管道`);
      else if (low <= 0) out.push(`夜里会到 ${low}°，窗户关好`);
      if (!out.length) out.push("这两天挺稳的，没有要躲的天气。");
      return out.slice(0, 2);
    }

    async function locate() {
      const manual = (readStored(CITY_KEY) || "").trim();
      if (manual) {
        const g = await fetchJson(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(manual)}&count=1&language=zh&format=json`,
        );
        const hit = g && g.results && g.results[0];
        if (hit) return { name: hit.name, lat: hit.latitude, lon: hit.longitude };
      }
      const info = await fetchJson("https://ipinfo.io/json");
      const loc = String(info.loc || "").split(",");
      if (loc.length !== 2) throw new Error("no location");
      const lat = Number(loc[0]);
      const lon = Number(loc[1]);
      let city = "";
      try {
        const rev = await fetchJson(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
          5000,
        );
        city = String(rev.city || rev.locality || "").replace(/市$/, "");
      } catch {
        /* fall back to the IP city */
      }
      if (!city) city = String(info.city || "").replace(/\u2019/g, "'");
      return { name: city || "你那边", lat, lon };
    }

    async function weather() {
      const cached = readCache();
      if (cached) return cached;
      const place = await locate();
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
        "&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m" +
        "&hourly=precipitation,weather_code,wind_gusts_10m" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max" +
        "&timezone=auto&forecast_days=8&forecast_hours=48";
      const w = await fetchJson(url);
      const cur = w.current || {};
      const day = w.daily || {};
      const days = (day.time || []).map((iso, i) => ({
        iso,
        code: Number((day.weather_code || [])[i] ?? 1),
        max: Number((day.temperature_2m_max || [])[i] ?? 0),
        min: Number((day.temperature_2m_min || [])[i] ?? 0),
        rain: Number((day.precipitation_probability_max || [])[i] ?? 0),
      }));
      const data = {
        city: place.name,
        code: Number(cur.weather_code ?? 1),
        temp: Number(cur.temperature_2m ?? 0),
        feels: Number(cur.apparent_temperature ?? cur.temperature_2m ?? 0),
        humidity: Number(cur.relative_humidity_2m ?? 0),
        wind: Number(cur.wind_speed_10m ?? 0),
        min: days[0] ? days[0].min : 0,
        max: days[0] ? days[0].max : 0,
        rain: days[0] ? days[0].rain : 0,
        tomorrow: days[1] || { code: 1, max: 0, min: 0, rain: 0 },
        week: days.slice(1, 8),
        hourly: w.hourly || null,
        at: Date.now(),
      };
      writeCache(data);
      return data;
    }

    function readCache() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        if (!v || typeof v !== "object") return null;
        if (Date.now() - Number(v.at || 0) > CACHE_MS) return null;
        return v;
      } catch {
        return null;
      }
    }

    function writeCache(v) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(v));
      } catch {
        /* ignore quota */
      }
    }

    function readPos() {
      try {
        const v = JSON.parse(readStored(POS_KEY) || "null");
        if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x, y: v.y };
      } catch {
        /* ignore */
      }
      return null;
    }

    function writePos(p) {
      try {
        writeStored(POS_KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    }

    /* ────────────────────────────── chrome ───────────────────────────── */

    const SEP_OPTIONS = ["┄┄┄", "───", "· · ·", "・ ・ ・", "〜〜〜", "✿ ✿ ✿", "✧ ✧ ✧", ""];
    const CORNER_OPTIONS = ["", "✿", "❀", "❁", "✧", "❋", "⁂"];

    const CSS = `
      :host { all: initial; }
      .card, .chip {
        position: fixed; z-index: 2147483000; box-sizing: border-box;
        color: var(--ww-fg); font: 13px/1.6 "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
        background: linear-gradient(160deg, var(--ww-bg), var(--ww-bg2));
        border: 1px solid color-mix(in srgb, var(--ww-line) 45%, transparent);
        box-shadow: 0 18px 50px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.05);
        backdrop-filter: blur(14px) saturate(1.1);
      }
      .card {
        width: 340px; max-width: calc(100vw - 24px);
        padding: 13px 16px 11px; border-radius: var(--ww-radius);
        opacity: 0; transform: translateY(10px);
        transition: opacity .6s ease, transform .6s cubic-bezier(.2,.8,.2,1);
      }
      .card.in { opacity: 1; transform: none; }
      .card.out { opacity: 0; transform: translateY(8px); }
      .head { display: flex; align-items: center; gap: 6px; cursor: grab; user-select: none; touch-action: none; }
      .head:active { cursor: grabbing; }
      .hi { font-size: 14.5px; font-weight: 600; letter-spacing: .2px; }
      .sub { color: var(--ww-dim); font-size: 12px; }
      .grow { flex: 1; }
      button.x {
        all: unset; cursor: pointer; color: var(--ww-dim); font-size: 13px; line-height: 1;
        padding: 3px 6px; border-radius: 6px;
      }
      button.x:hover { color: var(--ww-fg); background: rgba(255,255,255,.07); }
      .now { display: flex; align-items: baseline; gap: 8px; margin: 5px 0 1px; }
      .big { font-size: 27px; font-weight: 300; line-height: 1.1; letter-spacing: -0.5px; }
      .big .u { font-size: 13px; color: var(--ww-dim); margin-left: 1px; }
      .spark { color: var(--ww-accent); font-size: 13px; margin-left: 3px; }
      .desc { color: color-mix(in srgb, var(--ww-fg) 78%, var(--ww-dim)); font-size: 12.5px; }
      .meta { color: color-mix(in srgb, var(--ww-fg) 72%, var(--ww-dim)); font-size: 12px; }
      .sec { margin-top: 6px; }
      .sep { display: block; text-align: center; color: color-mix(in srgb, var(--ww-line) 75%, transparent); font-size: 9.5px; line-height: 1; margin: 7px 0 5px; letter-spacing: 2px; user-select: none; }
      .row { display: flex; gap: 8px; align-items: baseline; }
      .k { color: var(--ww-dim); font-size: 11.5px; flex: none; width: 28px; }
      .v { color: var(--ww-fg); font-size: 12.5px; }
      .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; margin-top: 4px; }
      .wd { text-align: center; color: var(--ww-dim); font-size: 10px; line-height: 1.45; }
      .wd b { display: block; color: var(--ww-fg); font-weight: 500; font-size: 11.5px; }
      .alert { color: var(--ww-alert); font-size: 12px; margin-top: 1px; }
      .tip { color: color-mix(in srgb, var(--ww-fg) 80%, var(--ww-dim)); font-size: 12px; }
      .care { color: var(--ww-dim); font-size: 11.5px; margin-top: 3px; font-style: italic; }
      .foot { margin-top: 8px; display: flex; align-items: center; justify-content: space-between; }
      .note { color: color-mix(in srgb, var(--ww-dim) 80%, transparent); font-size: 11px; }
      .corner { position: absolute; font-size: 10px; line-height: 1; color: var(--ww-accent); opacity: .38; pointer-events: none; }
      .corner.tl { left: 7px; top: 6px; }
      .corner.br { right: 8px; bottom: 6px; }

      .panel { display: none; }
      .card.editing .panel { display: block; }
      .card.editing .body { display: none; }
      .card.editing .head { cursor: default; }
      .pgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 8px; margin-top: 4px; }
      .plabel { display: block; color: var(--ww-dim); font-size: 11px; margin-bottom: 2px; }
      .pchip { all: unset; cursor: pointer; text-align: center; font-size: 11.5px; padding: 5px 0; border-radius: 8px; color: var(--ww-fg); background: rgba(255,255,255,.05); border: 1px solid color-mix(in srgb, var(--ww-line) 40%, transparent); }
      .pchip:hover { background: rgba(255,255,255,.10); }
      .pchip.on { border-color: var(--ww-accent); color: var(--ww-accent); }
      .sw {
        position: relative; display: block; height: 23px; border-radius: 6px; box-sizing: border-box;
        border: 1px solid color-mix(in srgb, var(--ww-line) 45%, transparent); overflow: hidden;
      }
      .sw input[type=color] {
        position: absolute; inset: -2px; width: calc(100% + 4px); height: calc(100% + 4px);
        padding: 0; border: 0; opacity: 0; cursor: pointer;
      }
      input[type=checkbox] { accent-color: var(--ww-accent); }
      select { all: unset; width: 100%; box-sizing: border-box; font-size: 12px; padding: 4px 6px; border-radius: 7px; color: var(--ww-fg); background: rgba(255,255,255,.06); border: 1px solid color-mix(in srgb, var(--ww-line) 40%, transparent); }
      select option { color: #111; }
      .prow { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
      .prow .plabel { margin: 0; }
      .pfoot { display: flex; gap: 8px; margin-top: 9px; }
      .pfoot button { all: unset; cursor: pointer; font-size: 11.5px; padding: 4px 9px; border-radius: 8px; color: var(--ww-fg); background: rgba(255,255,255,.06); }
      .pfoot button:hover { background: rgba(255,255,255,.12); }

      .chip {
        width: 40px; height: 40px; border-radius: 50%; display: none;
        align-items: center; justify-content: center; cursor: grab; font-size: 17px;
        touch-action: none; transition: transform .2s ease;
      }
      .chip.show { display: flex; }
      .chip:hover { transform: translateY(-2px); }
    `;

    function cardHtml() {
      const seps = SEP_OPTIONS.map((s) => `<option value="${s.replace(/"/g, "&quot;")}">${s || "（无）"}</option>`).join("");
      const corners = CORNER_OPTIONS.map((s) => `<option value="${s}">${s || "（无）"}</option>`).join("");
      const presets = Object.entries(PRESETS)
        .map(([k, p]) => `<button class="pchip" data-preset="${k}">${p.label}</button>`)
        .join("");
      return `
        <div class="card">
          <div class="head">
            <span class="hi"></span><span class="sub"></span>
            <span class="grow"></span>
            <button class="x gear" title="外观">✎</button>
            <button class="x" title="收起">×</button>
          </div>
          <div class="body">
            <div class="now"><span class="big"><span class="t"></span><span class="u">°C</span></span><span class="spark"></span><span class="desc d"></span></div>
            <div class="meta m1"></div>
            <div class="meta m2"></div>
            <div class="sec"><span class="sep"></span><div class="row"><span class="k">明日</span><span class="v tm"></span></div><div class="week wk"></div></div>
            <div class="sec"><span class="sep"></span><div class="alert al1"></div><div class="alert al2"></div></div>
            <div class="sec"><span class="sep"></span><div class="tip tp"></div><div class="tip tq"></div><div class="care cr"></div></div>
            <div class="foot"><span class="note">轻轻提醒 · 天气</span><button class="x" title="收起">收起</button></div>
          </div>
          <div class="panel">
            <div class="plabel" style="margin-top:6px">预设</div>
            <div class="pgrid">${presets}</div>
            <div class="pgrid" style="margin-top:8px">
              <label><span class="plabel">背景色</span><span class="sw sw-bg"><input type="color" class="c-bg"></span></label>
              <label><span class="plabel">文字色</span><span class="sw sw-fg"><input type="color" class="c-fg"></span></label>
              <label><span class="plabel">强调色</span><span class="sw sw-accent"><input type="color" class="c-accent"></span></label>
              <label><span class="plabel">分隔线</span><select class="c-sep">${seps}</select></label>
              <label><span class="plabel">角落小图案</span><select class="c-corner">${corners}</select></label>
              <label><span class="plabel">一周字形</span><select class="c-glyphs"><option value="hanzi">汉字</option><option value="emoji">图标</option></select></label>
            </div>
            <div class="prow"><label class="plabel"><input type="checkbox" class="c-spark"> 温度旁加个 ✧</label></div>
            <div class="pfoot">
              <button class="p-reset">恢复默认</button>
              <button class="p-close">好了</button>
            </div>
          </div>
        </div>
        <div class="chip" title="今天的天气">🌤️</div>
      `;
    }

    function hexOf(v) {
      return /^#[0-9a-f]{6}$/i.test(v || "") ? v : "#000000";
    }

    function mount() {
      if (window.__dshWeatherWhisper) return;
      window.__dshWeatherWhisper = true;

      const host = document.createElement("div");
      host.setAttribute("data-dsh-weather-whisper", "");
      const root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = CSS;
      root.appendChild(style);
      const wrap = document.createElement("div");
      wrap.innerHTML = cardHtml();
      root.appendChild(wrap);

      const card = root.querySelector(".card");
      const chip = root.querySelector(".chip");
      const $ = (s) => root.querySelector(s);
      const $$ = (s) => Array.from(root.querySelectorAll(s));
      let hideTimer = 0;
      let pos = readPos();
      let theme = loadTheme();
      let data = null;

      const applyTheme = () => {
        const p = theme.palette;
        const vars = {
          "--ww-bg": p.bg,
          "--ww-bg2": p.bg2,
          "--ww-fg": p.fg,
          "--ww-dim": p.dim,
          "--ww-accent": p.accent,
          "--ww-line": p.line,
          "--ww-alert": p.alert,
          "--ww-radius": `${theme.radius}px`,
        };
        for (const [k, v] of Object.entries(vars)) wrap.style.setProperty(k, v);
        const sepText = theme.decor.sep || "";
        $$(".sep").forEach((s) => {
          s.textContent = sepText;
          s.style.display = sepText ? "" : "none";
        });
        $$(".corner").forEach((c) => c.remove());
        if (theme.decor.corner) {
          for (const at of ["tl", "br"]) {
            const c = document.createElement("span");
            c.className = `corner ${at}`;
            c.textContent = theme.decor.corner;
            card.appendChild(c);
          }
        }
        $(".spark").textContent = theme.decor.sparkle ? "✧" : "";
        if (data) render(data);
      };

      const setTheme = (patch, persist = true) => {
        theme = merge(theme, patch);
        if (persist) saveTheme(theme);
        syncPanel();
        applyTheme();
      };

      const syncPanel = () => {
        $(".c-bg").value = hexOf(theme.palette.bg);
        $(".c-fg").value = hexOf(theme.palette.fg);
        $(".c-accent").value = hexOf(theme.palette.accent);
        $(".sw-bg").style.background = theme.palette.bg;
        $(".sw-fg").style.background = theme.palette.fg;
        $(".sw-accent").style.background = theme.palette.accent;
        $(".c-sep").value = theme.decor.sep;
        $(".c-corner").value = theme.decor.corner;
        $(".c-glyphs").value = theme.decor.glyphs;
        $(".c-spark").checked = !!theme.decor.sparkle;
        $$(".pchip").forEach((b) => {
          const p = PRESETS[b.dataset.preset];
          const same =
            hexOf(p.palette.bg).toLowerCase() === hexOf(theme.palette.bg).toLowerCase() &&
            hexOf(p.palette.fg).toLowerCase() === hexOf(theme.palette.fg).toLowerCase() &&
            hexOf(p.palette.accent).toLowerCase() === hexOf(theme.palette.accent).toLowerCase();
          b.classList.toggle("on", same);
        });
      };

      const place = () => {
        const w = card.offsetWidth || 340;
        const h = card.offsetHeight || 300;
        if (!pos) pos = { x: 18, y: Math.max(8, innerHeight - h - 18) };
        pos.x = Math.min(Math.max(8, pos.x), Math.max(8, innerWidth - w - 8));
        pos.y = Math.min(Math.max(8, pos.y), Math.max(8, innerHeight - h - 8));
        card.style.left = pos.x + "px";
        card.style.top = pos.y + "px";
        chip.style.left = pos.x + "px";
        chip.style.top = pos.y + "px";
      };

      const showCard = () => {
        chip.classList.remove("show");
        card.style.display = "";
        place();
        requestAnimationFrame(() => card.classList.add("in"));
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, 30000);
      };
      const hide = () => {
        if (card.classList.contains("editing")) return;
        card.classList.remove("in");
        card.classList.add("out");
        setTimeout(() => {
          card.style.display = "none";
          card.classList.remove("out");
          chip.classList.add("show");
        }, 600);
      };

      $$(".x:not(.gear)").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          hide();
        }),
      );
      chip.addEventListener("click", showCard);

      const drag = (el) => {
        let sx = 0, sy = 0, ox = 0, oy = 0, active = false, moved = false;
        el.addEventListener("pointerdown", (e) => {
          if (e.button !== 0 || card.classList.contains("editing")) return;
          active = true;
          moved = false;
          sx = e.clientX; sy = e.clientY;
          ox = pos.x; oy = pos.y;
          try { el.setPointerCapture(e.pointerId); } catch {}
          clearTimeout(hideTimer);
        });
        el.addEventListener("pointermove", (e) => {
          if (!active) return;
          const dx = e.clientX - sx;
          const dy = e.clientY - sy;
          if (!moved && Math.abs(dx) + Math.abs(dy) > 3) moved = true;
          if (!moved) return;
          const w = card.offsetWidth || 340;
          const h = card.offsetHeight || 300;
          pos.x = Math.min(Math.max(8, ox + dx), Math.max(8, innerWidth - w - 8));
          pos.y = Math.min(Math.max(8, oy + dy), Math.max(8, innerHeight - h - 8));
          place();
        });
        const end = (e) => {
          if (!active) return;
          active = false;
          try { el.releasePointerCapture(e.pointerId); } catch {}
          if (moved) writePos(pos);
          hideTimer = setTimeout(hide, 15000);
        };
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", end);
      };
      drag(root.querySelector(".head"));
      drag(chip);

      // theme editor
      $(".gear").addEventListener("click", (e) => {
        e.stopPropagation();
        card.classList.toggle("editing");
        clearTimeout(hideTimer);
        if (card.classList.contains("editing")) syncPanel();
        else hideTimer = setTimeout(hide, 15000);
        place();
      });
      $(".p-close").addEventListener("click", () => {
        card.classList.remove("editing");
        place();
        hideTimer = setTimeout(hide, 15000);
      });
      $(".p-reset").addEventListener("click", () => setTheme(JSON.parse(JSON.stringify(DEFAULT_THEME))));
      $$(".pchip").forEach((b) =>
        b.addEventListener("click", () => setTheme(JSON.parse(JSON.stringify(PRESETS[b.dataset.preset])))),
      );
      $(".c-bg").addEventListener("input", (e) => setTheme({ palette: { bg: e.target.value } }));
      $(".c-fg").addEventListener("input", (e) => setTheme({ palette: { fg: e.target.value } }));
      $(".c-accent").addEventListener("input", (e) => setTheme({ palette: { accent: e.target.value } }));
      $(".c-sep").addEventListener("change", (e) => setTheme({ decor: { sep: e.target.value } }));
      $(".c-corner").addEventListener("change", (e) => setTheme({ decor: { corner: e.target.value } }));
      $(".c-glyphs").addEventListener("change", (e) => setTheme({ decor: { glyphs: e.target.value } }));
      $(".c-spark").addEventListener("change", (e) => setTheme({ decor: { sparkle: e.target.checked } }));

      addEventListener("resize", place);
      document.body.appendChild(host);
      applyTheme();
      place();

      function render(d) {
        data = d;
        const [desc, emoji] = WMO[d.code] || WMO[1];
        $(".hi").textContent = greeting();
        $(".sub").textContent = `${theme.decor.glyphs === "emoji" ? emoji : ""} ${d.city}`.trim();
        $(".t").textContent = r0(d.temp);
        $(".d").textContent = desc;
        $(".m1").textContent = `体感 ${r0(d.feels)}° · 今日 ${r0(d.min)}~${r0(d.max)}° · 降水 ${r0(d.rain)}%`;
        $(".m2").textContent = `风 ${beaufort(d.wind)} 级 · 湿度 ${r0(d.humidity)}%`;
        const t = d.tomorrow;
        const tDesc = (WMO[t.code] || WMO[1])[0];
        const tDay = new Date(Date.now() + 864e5);
        $(".tm").textContent = `${tDesc} · ${r0(t.min)}~${r0(t.max)}° · 降水 ${r0(t.rain)}% · 周${WEEK[tDay.getDay()]}`;
        $(".wk").innerHTML = (d.week || [])
          .map((w) => {
            const day = new Date(w.iso);
            const glyph = theme.decor.glyphs === "emoji" ? (WMO[w.code] || WMO[1])[1] : short(w.code);
            return `<div class="wd">周${WEEK[day.getDay()]}<b>${r0(w.max)}°</b>${glyph}<br>${r0(w.min)}°</div>`;
          })
          .join("");
        const al = alertsOf(d);
        const calm = al.length === 1 && al[0].indexOf("挺稳的") >= 0;
        $(".al1").textContent = calm ? `· ${al[0]}` : `⚠ ${al[0] || ""}`;
        $(".al2").textContent = al[1] ? `⚠ ${al[1]}` : "";
        $(".al2").style.display = al[1] ? "" : "none";
        const wear = advice(d)[0] || "";
        const tip = tempTip(d);
        $(".tp").textContent = wear ? `穿：${wear}` : "";
        $(".tp").style.display = wear ? "" : "none";
        $(".tq").textContent = tip ? `· ${tip}` : "";
        $(".tq").style.display = tip ? "" : "none";
        $(".cr").textContent = `「${careLine(d)}」`;
        place();
      };

      const load = async () => {
        try {
          render(await weather());
          showCard();
        } catch (err) {
          $(".hi").textContent = greeting();
          $(".sub").textContent = "天气没拿到";
          $(".t").textContent = "--";
          $(".d").textContent = "网络不太顺";
          $(".m1").textContent = "晚点我再看看，别急";
          $(".m2").textContent = "";
          $$(".sec").forEach((s) => (s.style.display = "none"));
          place();
          showCard();
        }
      };

      // Public, deliberately tiny: `window.DSHWeatherWhisper.set({ palette: { accent: "#f5c2d0" } })`
      window.DSHWeatherWhisper = {
        version: VERSION,
        get theme() {
          return JSON.parse(JSON.stringify(theme));
        },
        presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])),
        set: (patch) => setTheme(patch),
        reset: () => setTheme(JSON.parse(JSON.stringify(DEFAULT_THEME))),
      };

      let announced = false;
      try {
        announced = sessionStorage.getItem(SHOWN_KEY) === "1";
        sessionStorage.setItem(SHOWN_KEY, "1");
      } catch {
        announced = false;
      }
      if (!announced) load();
      else weather().catch(() => {});
    }

    function apply() {
      if (document.body) mount();
      else document.addEventListener("DOMContentLoaded", mount, { once: true });
    }

    exports.apply = apply;
    exports.version = VERSION;
    return module.exports;
  },
});
