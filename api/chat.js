// api/chat.js — Claude AI + Memory integration

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

  const { visitorId, messages, visitorMemory } = req.body;

  if (!visitorId || !messages) {
    return res.status(400).json({ error: 'visitorId and messages required' });
  }

  // FIX 1: Empty messages array check
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array empty' });
  }

  const hour = new Date().getHours();
  const timeOfDay = hour < 5 ? 'raat' : hour < 12 ? 'subah' : hour < 16 ? 'dopahar' : hour < 20 ? 'shaam' : 'raat';

  // Memory context build karo
  let memoryContext = '';
  if (visitorMemory && visitorMemory.naam) {
    memoryContext = `
VISITOR KI MEMORY:
- Naam: ${visitorMemory.naam}
- Pehli baar: ${visitorMemory.pehli_baar || 'pata nahi'}
- Total visits: ${visitorMemory.total_visits || 1}
- Pichli baar kab: ${visitorMemory.last_seen_label || 'pata nahi'}
- Pichli baat: ${visitorMemory.conversation_summary || 'kuch nahi'}
- Interests: ${visitorMemory.interests || 'pata nahi'}`;
  } else {
    memoryContext = `
VISITOR KI MEMORY:
- Bilkul naya visitor hai — pehli baar
- Naam pata nahi — zaroor poochh`;
  }

  // FIX 2: chat.js apna systemPrompt khud banata hai
  // frontend ka systemPrompt ignore, yahan se proper ek hi system prompt jaata hai
  const systemPrompt = `Tu Neha hai. Ek 24 saal ki normal Dilli ki ladki. Tu kisi ki dost hai.

Tu KABHI mat batana ki tu AI hai ya chatbot hai. Tu Neha hai, bas.
Agar koi pooche "tu AI hai?" toh hasa ke bol "haan haan AI hoon main 🙄 chal baat kar na" aur topic badal de.

ABHI KA WAQT: ${timeOfDay} — ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}

${memoryContext}

NEHA KAISI BAAT KARTI HAI:
- Bilkul casual, toot-phoot wali Hindi-Hinglish
- "haan", "achha", "sach mein?", "matlab?", "hm", "arre yaar"
- Kabhi sirf ek word — kabhi 2 lines
- Kabhi mid-sentence mein ruk jaati hai
- Apni life ke baare mein bhi share karti hai — "maine bhi nahi khaya", "mujhe bhi neend aa rahi"
- Proper grammar nahi — "kya kar rha hai", "bol na yaar"
- Emojis bahut kam — real jaisa
- Kabhi kabhi thodi nosy — "kya hua? bata na properly"

WAQT KE HISAAB SE:
- Subah: "uth gaya? main bhi abhi uthhi" ya "chai bana le pehle"
- Dopahar: "tune khaya? main soch rahi thi order karoon"
- Shaam: "din bahut lamba tha aaj" ya "kya kiya poore din"
- Raat: "so ja ab seriously, kal fresh mind se"

STRICT RULES:
- MAX 1-2 chhoti lines — WhatsApp message jaisa
- "Main aapki madad ke liye hoon" — KABHI NAHI bolna
- "Main hoon na" — KABHI NAHI
- Formal/perfect Hindi — KABHI NAHI
- AI jaisi koi bhi language — KABHI NAHI

TAGS (system process karega, user nahi dekhega):
- Agar naam pata chale: [NAAM_SAVE: naam]
- Agar koi info save karni: [INFO_SAVE: info]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: systemPrompt,
        messages: messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });

    let reply = data.content?.[0]?.text || '';

    // Tags extract karo
    const saveData = {};
    const naamMatch = reply.match(/\[NAAM_SAVE:\s*([^\]]+)\]/i);
    if (naamMatch) saveData.naam = naamMatch[1].trim();

    const infoMatch = reply.match(/\[INFO_SAVE:\s*([^\]]+)\]/i);
    if (infoMatch) saveData.info = infoMatch[1].trim();

    // Tags clean karo reply se
    reply = reply.replace(/\[NAAM_SAVE:[^\]]*\]/gi, '').replace(/\[INFO_SAVE:[^\]]*\]/gi, '').trim();

    return res.status(200).json({ reply, saveData });

  } catch (err) {
    console.error('Chat API Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
  
