const { GoogleGenerativeAI } = require('@google/generative-ai');

// Daily tip: one short call per day, cached client-side.
// Chat: on-demand, short responses. Both use gemini-2.0-flash (free tier).

function dailySystem(ctx) {
  const { goals = [], reminders = [], date = '' } = ctx;
  const done  = goals.filter(g => g.done).length;
  const total = goals.length;
  const goalsList = goals.length
    ? goals.map((g, i) => `${i + 1}. [${g.done ? '✓' : ' '}] ${g.text}`).join('\n')
    : 'Keine Ziele eingetragen.';
  const remList = reminders.length
    ? reminders.map(r => `- ${r.title}`).join('\n')
    : '';
  return `Du bist Yves' persönlicher Mentor. Heute ist ${date}.
Fortschritt: ${done}/${total} Ziele erledigt.
Ziele:\n${goalsList}${remList ? '\nWiederkehrende Aufgaben:\n' + remList : ''}

Schreib einen einzigen, präzisen Tages-Tipp (2–3 Sätze). Direkt, motivierend, auf Deutsch. Kein Smalltalk.`;
}

function chatSystem(ctx) {
  const { goals = [], date = '' } = ctx;
  const goalsList = goals.length
    ? goals.map((g, i) => `${i + 1}. [${g.done ? '✓' : ' '}] ${g.text}`).join('\n')
    : 'Keine Ziele.';
  return `Du bist Yves' persönlicher Mentor (${date}). Heutige Ziele:\n${goalsList}\nSei direkt, kurz (2–3 Sätze), auf Deutsch.`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'NO_API_KEY', message: 'GEMINI_API_KEY nicht in Vercel Environment Variables gesetzt.' });
  }

  const { type = 'chat', messages = [], context = {} } = req.body || {};

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // ── Daily tip: single turn, very short ──
    if (type === 'daily') {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: dailySystem(context),
        generationConfig: { maxOutputTokens: 150, temperature: 0.7 },
      });
      const result = await model.generateContent('Gib mir meinen Tages-Tipp.');
      return res.status(200).json({ content: result.response.text().trim() });
    }

    // ── Chat: multi-turn, slightly longer ──
    if (!messages.length) return res.status(400).json({ error: 'messages required' });

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: chatSystem(context),
      generationConfig: { maxOutputTokens: 220, temperature: 0.75 },
    });

    const history = messages.slice(0, -1)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    while (history.length && history[0].role !== 'user') history.shift();

    const chat = model.startChat({ history });
    const last = messages[messages.length - 1];
    const result = await chat.sendMessage(last.content);
    return res.status(200).json({ content: result.response.text().trim() });

  } catch (err) {
    console.error('[mentor]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
