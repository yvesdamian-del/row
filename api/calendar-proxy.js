module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url-Parameter fehlt' });

  // webcal:// → https://
  url = url.replace(/^webcal:\/\//i, 'https://');

  // Sicherheit: nur iCloud-Kalender-URLs
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('.icloud.com')) {
      return res.status(403).json({ error: 'Nur iCloud-URLs erlaubt' });
    }
  } catch {
    return res.status(400).json({ error: 'Ungültige URL' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Yves-Dashboard/1.0' },
    });
    if (!response.ok) throw new Error(`iCloud antwortete mit ${response.status}`);
    const text = await response.text();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
