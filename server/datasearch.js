import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

async function getDriverPoints(url) {
  const res = await axios.get(url, {
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    responseType: 'text',
    timeout: 15000,
    validateStatus: s => s >= 200 && s < 400,
  });

  const $ = cheerio.load(res.data);

  // Oikean taulukon hakeminen sivuilta
  let table = null;
  $('table').each((_, el) => {
    const headers = $(el).find('thead th').map((i, th) => $(th).text().trim().toLowerCase()).get();
    if (headers.includes('driver') && headers.includes('points') && !table) table = $(el);
  });
  if (!table) {
    $('table').each((_, el) => {
      const firstRow = $(el).find('tr').first().find('th,td').map((i, c) => $(c).text().trim().toLowerCase()).get();
      if (firstRow.includes('driver') && firstRow.includes('points') && !table) table = $(el);
    });
  }
  if (!table) throw new Error('Taulukkoa (Driver/Points) ei löytynyt.');

  const headerCells = table.find('thead th').length
    ? table.find('thead th')
    : table.find('tr').first().find('th,td');

  const headers = headerCells.map((i, th) => $(th).text().trim().toLowerCase()).get();
  const idxDriver = headers.indexOf('driver');
  const idxPoints = headers.indexOf('points');

  const rows = table.find('tbody tr').length ? table.find('tbody tr') : table.find('tr').slice(1);
  const clean = s => String(s).replace(/\s+/g, ' ').trim();

  const out = [];
  rows.each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length === 0) return;
    const driver = clean($(tds[idxDriver]).text());
    const pointsText = clean($(tds[idxPoints]).text()).replace(/\s/g, '').replace(/,/g, '.');
    if (driver) out.push({ driver, points: Number(pointsText) || null });
  });

  return out;
}

// Komentorivikäyttö, poistetaan myöhemmin
if (process.argv[1] && process.argv[1].endsWith('datasearch.js')) {
  const url = (process.argv[2] || '').trim().replace(/^`+|`+$/g, '');
  if (!url) {
    console.error('Anna URL: node server\\datasearch.js https://...');
    process.exit(1);
  }
  getDriverPoints(url)
    .then(list => console.log(JSON.stringify(list, null, 2)))
    .catch(err => { console.error('Virhe:', err.message); process.exit(1); });
}

export { getDriverPoints };