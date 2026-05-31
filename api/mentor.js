const { GoogleGenerativeAI } = require('@google/generative-ai');

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

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'NO_API_KEY',
      message: 'GEMINI_API_KEY nicht gesetzt. Bitte in Vercel → Settings → Environment Variables eintragen.',
    });
  }

  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: buildSystem(context || {}),
    });

    // Gemini chat history: all messages except the last user message
    // Roles: 'user' stays 'user', 'assistant' becomes 'model'
    const history = messages.slice(0, -1)
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // Ensure history starts with user role (Gemini requirement)
    while (history.length && history[0].role !== 'user') history.shift();

    const chat = model.startChat({ history });
    const lastMsg = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMsg.content);
    const text = result.response.text();

    return res.status(200).json({ content: text });
  } catch (err) {
    console.error('[mentor]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
