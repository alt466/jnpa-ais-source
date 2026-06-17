'use strict';

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c]));
}

/**
 * Builds a valid RSS 2.0 feed: one item per open alert, and if there are
 * none, one item per vessel describing its current status. This is what
 * lets 3DDashboard's native "RSS feeds" app show rolling text updates
 * with zero custom widget code.
 */
function buildAlertsRss(alerts, widgetVessels, baseUrl) {
  const now = new Date().toUTCString();
  let items;
  if (alerts.length > 0) {
    items = alerts.map((a) => `
    <item>
      <title>${escapeXml(`[${a.severity}] ${a.vessel} — ${a.category}`)}</title>
      <description>${escapeXml(a.message)}</description>
      <pubDate>${now}</pubDate>
      <guid isPermaLink="false">${escapeXml(a.id)}</guid>
    </item>`).join('');
  } else {
    items = widgetVessels.map((v) => `
    <item>
      <title>${escapeXml(`${v.name} — ${v.status}`)}</title>
      <description>${escapeXml(`Zone: ${v.zone} · Speed: ${v.speed}kn · Berth: ${v.berth} · Risk: ${v.risk}`)}</description>
      <pubDate>${now}</pubDate>
      <guid isPermaLink="false">${escapeXml(v.id + '-' + v.status)}</guid>
    </item>`).join('');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>JNPA Port Operations</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Live vessel and alert status for JNPA</description>
    <lastBuildDate>${now}</lastBuildDate>${items}
  </channel>
</rss>`;
}

function toCsvRow(values) {
  return values.map((v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

function buildVesselsCsv(widgetVessels) {
  const header = ['id', 'name', 'zone', 'status', 'speed', 'course', 'berth', 'terminal', 'risk'];
  const rows = widgetVessels.map((v) => toCsvRow([v.id, v.name, v.zone, v.status, v.speed, v.course, v.berth, v.terminal, v.risk]));
  return [toCsvRow(header), ...rows].join('\n');
}

function buildMetricsCsv(history) {
  const header = ['timestamp', 'totalVessels', 'atAnchorage', 'inTransit', 'berthing', 'avgRisk', 'openAlerts'];
  const rows = history.map((h) => toCsvRow([h.timestamp, h.totalVessels, h.atAnchorage, h.inTransit, h.berthing, h.avgRisk, h.openAlerts]));
  return [toCsvRow(header), ...rows].join('\n');
}

function summarize(widgetVessels, alerts) {
  const atAnchorage = widgetVessels.filter((v) => v.status === 'Waiting at Anchorage').length;
  const berthing = widgetVessels.filter((v) => v.status === 'Berthing in Progress').length;
  const inTransit = widgetVessels.length - atAnchorage - berthing;
  const avgRisk = widgetVessels.length
    ? Math.round(widgetVessels.reduce((s, v) => s + v.risk, 0) / widgetVessels.length)
    : 0;
  return {
    timestamp: new Date().toISOString(),
    totalVessels: widgetVessels.length,
    atAnchorage,
    inTransit,
    berthing,
    avgRisk,
    openAlerts: alerts.length
  };
}

module.exports = { buildAlertsRss, buildVesselsCsv, buildMetricsCsv, summarize };
