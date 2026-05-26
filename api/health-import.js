const SUPABASE_URL = 'https://twbkubukbdqpnarswopm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_04ay-Y-veywafH89XQBNWA_qvVowwbr';

// HEA v1 metric names → our keys
const V1_MAP = {
  StepCount:          'steps',
  ActiveEnergyBurned: 'calories',
  HeartRate:          'heart_rate',
  RestingHeartRate:   'resting_hr',
  SleepAnalysis:      'sleep',
};

// HEA v2 metric names → our keys
const V2_MAP = {
  step_count:          'steps',
  active_energy:       'calories',
  heart_rate:          'heart_rate',
  resting_heart_rate:  'resting_hr',
  sleep_analysis:      'sleep',
  // alternative spellings seen in the wild
  steps:               'steps',
  calories:            'calories',
  energy:              'calories',
};

function extractMetrics(metricList) {
  const out = {};
  for (const m of metricList) {
    const pts = Array.isArray(m.data) ? m.data : [];
    if (!pts.length) continue;

    const key = V1_MAP[m.name] || V2_MAP[m.name] || V2_MAP[m.name?.toLowerCase()];
    if (!key) continue;

    if (key === 'steps' || key === 'calories') {
      out[key] = Math.round(pts.reduce((s, d) => s + (d.qty || 0), 0));
    } else if (key === 'heart_rate') {
      const valid = pts.filter(d => d.qty > 0);
      if (valid.length)
        out[key] = Math.round(valid.reduce((s, d) => s + d.qty, 0) / valid.length);
    } else if (key === 'resting_hr') {
      out[key] = Math.round(pts[pts.length - 1].qty || 0);
    } else if (key === 'sleep') {
      // Sum asleep intervals (exclude InBed / inBed)
      const asleep = pts.filter(d => {
        if (!d.value) return true; // qty-only = sleep minutes/hours
        const v = String(d.value).toLowerCase();
        return v.includes('asleep') || v === 'sleep';
      });
      const total = asleep.reduce((s, d) => s + (d.qty || 0), 0);
      if (total > 0) out['sleep_hours'] = Math.round(total * 10) / 10;
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET')
    return res.status(200).json({ ok: true, service: 'health-import' });

  try {
    const body = req.body || {};
    const metrics = {
      date: new Date().toISOString().split('T')[0],
      synced_at: new Date().toISOString(),
    };

    // ── v2: body.data is an object with a "metrics" array ──
    if (body.data && !Array.isArray(body.data) && Array.isArray(body.data.metrics)) {
      Object.assign(metrics, extractMetrics(body.data.metrics));
    }

    // ── v1: body.data is an array of metrics ──
    if (Array.isArray(body.data)) {
      Object.assign(metrics, extractMetrics(body.data));
    }

    // ── Simple flat JSON (Apple Shortcuts) ──
    if (body.steps      != null) metrics.steps      = parseInt(body.steps);
    if (body.calories   != null) metrics.calories   = parseInt(body.calories);
    if (body.heart_rate != null) metrics.heart_rate = parseInt(body.heart_rate);
    if (body.resting_hr != null) metrics.resting_hr = parseInt(body.resting_hr);
    if (body.sleep_hours!= null) metrics.sleep_hours= parseFloat(body.sleep_hours);

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
