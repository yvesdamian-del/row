const SUPABASE_URL = 'https://twbkubukbdqpnarswopm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_04ay-Y-veywafH89XQBNWA_qvVowwbr';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });

  try {
    const body = req.body || {};
    const metrics = {
      date: new Date().toISOString().split('T')[0],
      synced_at: new Date().toISOString(),
    };

    // Health Auto Export format: { data: [{ name, units, data: [{date, qty, value?}] }] }
    if (Array.isArray(body.data)) {
      for (const metric of body.data) {
        const pts = Array.isArray(metric.data) ? metric.data : [];
        if (!pts.length) continue;

        switch (metric.name) {
          case 'StepCount':
            metrics.steps = Math.round(pts.reduce((s, d) => s + (d.qty || 0), 0));
            break;
          case 'ActiveEnergyBurned':
            metrics.calories = Math.round(pts.reduce((s, d) => s + (d.qty || 0), 0));
            break;
          case 'HeartRate': {
            const valid = pts.filter(d => d.qty > 0);
            if (valid.length)
              metrics.heart_rate = Math.round(valid.reduce((s, d) => s + d.qty, 0) / valid.length);
            break;
          }
          case 'RestingHeartRate':
            metrics.resting_hr = Math.round(pts[pts.length - 1].qty);
            break;
          case 'SleepAnalysis': {
            // Filter for actual sleep (not InBed)
            const asleep = pts.filter(
              d => !d.value || d.value === 'Asleep' || d.value === 'asleep' || d.value === 'ASLEEP'
            );
            metrics.sleep_hours =
              Math.round(asleep.reduce((s, d) => s + (d.qty || 0), 0) * 10) / 10;
            break;
          }
        }
      }
    }

    // Simple JSON format (z. B. von Apple Shortcuts): { steps, calories, heart_rate, sleep_hours }
    if (body.steps != null)       metrics.steps       = parseInt(body.steps);
    if (body.calories != null)    metrics.calories    = parseInt(body.calories);
    if (body.heart_rate != null)  metrics.heart_rate  = parseInt(body.heart_rate);
    if (body.resting_hr != null)  metrics.resting_hr  = parseInt(body.resting_hr);
    if (body.sleep_hours != null) metrics.sleep_hours = parseFloat(body.sleep_hours);

    const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/app_state?on_conflict=key`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        key: 'apple_health',
        data: metrics,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!supaRes.ok) {
      const txt = await supaRes.text();
      throw new Error(`Supabase ${supaRes.status}: ${txt}`);
    }

    return res.status(200).json({ ok: true, metrics });
  } catch (err) {
    console.error('[health-import]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
