// api/memory.js — Visitor memory using Upstash Redis (Free)

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(command, ...args) {
  const res = await fetch(
    `${UPSTASH_URL}/${command}/${args.map(encodeURIComponent).join('/')}`,
    { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } }
  );
  const data = await res.json();
  return data.result;
}

async function getMemory(visitorId) {
  try {
    const raw = await redisCmd('GET', `visitor:${visitorId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveMemory(visitorId, memory) {
  try {
    await redisCmd('SET', `visitor:${visitorId}`, JSON.stringify(memory));
    await redisCmd('EXPIRE', `visitor:${visitorId}`, '7776000'); // 90 din
    return true;
  } catch { return false; }
}

function timeAgoLabel(isoString) {
  if (!isoString) return 'pata nahi';
  const diff = Date.now() - new Date(isoString).getTime();
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(min / 60);
  const days = Math.floor(hr / 24);
  if (min < 2)    return 'abhi abhi';
  if (min < 60)   return `${min} minute pehle`;
  if (hr  < 24)   return `${hr} ghante pehle`;
  if (days === 1) return 'kal';
  return `${days} din pehle`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Only POST' });

  const { action, visitorId, updates } = req.body;
  if (!visitorId) return res.status(400).json({ error: 'visitorId required' });
  if (!action)    return res.status(400).json({ error: 'action required' });

  // ── LOAD ──────────────────────────────────────────────────
  if (action === 'load') {
    let memory = await getMemory(visitorId);
    const now  = new Date().toISOString();

    if (!memory) {
      memory = {
        visitorId,
        naam: null,
        pehli_baar: now,
        last_seen: now,
        last_seen_label: 'abhi pehli baar',
        last_seen_date: now,
        total_visits: 1,
        aaj_visits: 1,
        conversation_summary: '',
        interests: '',
        isNew: true,
      };
    } else {
      memory.last_seen_label = timeAgoLabel(memory.last_seen);
      memory.last_seen       = now;
      memory.total_visits    = (memory.total_visits || 0) + 1;

      const lastDate = new Date(memory.last_seen_date || 0).toDateString();
      const today    = new Date().toDateString();
      memory.aaj_visits = lastDate !== today ? 1 : (memory.aaj_visits || 0) + 1;
      memory.last_seen_date = now;
      memory.isNew = false;
    }

    await saveMemory(visitorId, memory);
    return res.status(200).json({ memory });
  }

  // ── UPDATE ────────────────────────────────────────────────
  if (action === 'update') {
    // FIX 3: updates undefined check
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates object required' });
    }

    let memory = await getMemory(visitorId) || {
      visitorId, naam: null, total_visits: 1,
      conversation_summary: '', interests: '', isNew: false,
    };

    if (updates.naam) memory.naam = updates.naam;
    if (updates.info) {
      memory.interests = memory.interests
        ? memory.interests + ', ' + updates.info
        : updates.info;
    }
    if (updates.conversation_summary) {
      memory.conversation_summary = updates.conversation_summary;
    }

    await saveMemory(visitorId, memory);
    return res.status(200).json({ success: true, memory });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
