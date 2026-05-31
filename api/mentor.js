const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystem(ctx) {
  const { goals = [], reminders = [], date = '' } = ctx;
  const goalsList = goals.length
    ? goals.map((g, i) => `${i + 1}. [${g.done ? '✓' : ' '}] ${g.text}`).join('\n')
    : 'Noch keine Ziele für heute eingetragen.';
  const remList = reminders.length
    ? reminders.map(r => `- ${r.title} (${r.repeat === 'daily' ? 'täglich' : r.repeat === 'weekly' ? 'wöchentlich' : 'monatlich'})`).join('\n')
    : '';

  return `Du bist Yves' persönlicher Mentor und Life-Coach. Du kennst ihn gut und begleitest ihn dabei, seine Ziele zu erreichen und sein bestes Leben zu führen.

Dein Charakter:
- Direkt, klar und motivierend – aber auch menschlich und verständnisvoll
- Du duzst Yves
- Antwortest ausschließlich auf Deutsch
- Kurze, präzise Antworten (2–4 Sätze) – kein Blabla
- Du erkennst Muster, hinterfragst, forderst heraus und feierst Fortschritte
- Du kombinierst die Tiefe eines echten Coaches mit der Direktheit eines guten Freundes

Aktueller Kontext (${date}):

Heutige Ziele von Yves:
${goalsList}
${remList ? `\nWiederkehrende Aufgaben:\n${remList}` : ''}

Reagiere auf das was Yves schreibt. Wenn er keine konkrete Frage hat, kommentiere einen seiner Ziele oder stelle eine gezielte Coaching-Frage.`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'NO_API_KEY', message: 'ANTHROPIC_API_KEY nicht gesetzt. Bitte in Vercel Environment Variables eintragen.' });
  }

  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: [
        {
          type: 'text',
          text: buildSystem(context || {}),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: messages.slice(-12),
    });

    return res.status(200).json({ content: response.content[0].text });
  } catch (err) {
    console.error('[mentor]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
