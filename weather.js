'use strict';

// JNPA approximate coordinates.
const LAT = 18.950;
const LON = 72.950;

const WEATHER_CODE_TEXT = {
  0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog',
  51: 'Light Drizzle', 53: 'Drizzle', 55: 'Dense Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  80: 'Rain Showers', 81: 'Rain Showers', 82: 'Violent Rain Showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Severe Thunderstorm'
};

/**
 * Fetches real current weather for JNPA from Open-Meteo (free, no API key).
 * Falls back to a clearly-marked unavailable shape on any failure so a flaky
 * weather call never breaks the rest of the dashboard.
 */
async function fetchJnpaWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cw = data.current_weather;
    if (!cw) throw new Error('No current_weather in response');
    return {
      time: cw.time,
      windSpeed: Math.round((cw.windspeed / 1.852) * 10) / 10, // km/h -> knots
      windDir: cw.winddirection,
      visibility: null, // not provided by this endpoint — needs a separate marine source
      tide: null, // tide is not weather data — needs a tide-table source, not fabricated here
      current: null,
      status: WEATHER_CODE_TEXT[cw.weathercode] || 'Mixed',
      restriction: 'None',
      source: 'open-meteo.com (live)'
    };
  } catch (err) {
    return {
      time: null, windSpeed: null, windDir: null, visibility: null, tide: null, current: null,
      status: 'Unavailable', restriction: 'Unknown', source: `error: ${err.message}`
    };
  }
}

module.exports = { fetchJnpaWeather, LAT, LON };
