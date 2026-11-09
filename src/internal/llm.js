// The model a feature uses when it needs one answer (journaling, compaction, critiques, proposals): the agent's when an
// agent asks, otherwise the kit's defaults (createKit({ provider, model })).
export async function pickModel(kit, { client = null, model = null, provider = null } = {}) {
  if (!client) {
    const o = await kit.use('ollama');
    provider ||= kit.config.provider || (o.cloud.apiKey ? 'cloud' : 'local');
    client = provider === 'cloud' ? o.cloud : o.local;
  }
  return { client, model: model || kit.config.model || (client.cloud ? 'gpt-oss:120b' : 'qwen3:8b') };
}

/** one answer as text: complete(kit, { system, prompt | messages, json, temperature, client, model, signal }) */
export async function complete(kit, { system = '', prompt = '', messages = null, json = false, temperature = 0.3, client = null, model = null, signal } = {}) {
  const m = await pickModel(kit, { client, model });
  const msgs = [...(system ? [{ role: 'system', content: system }] : []), ...(messages || [{ role: 'user', content: String(prompt) }])];
  const r = await m.client.complete({ model: m.model, messages: msgs, think: false, ...(json ? { format: 'json' } : {}), options: { temperature }, signal });
  return json ? parseJson(r.content) : r.content;
}

/** the first JSON object or array in a model's reply */
export function parseJson(text) {
  const s = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(s); } catch {}
  const i = s.search(/[[{]/); if (i < 0) throw new Error('the model did not answer with JSON');
  const open = s[i], close = open === '{' ? '}' : ']'; let d = 0, q = false, esc = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') q = false; continue; }
    if (c === '"') q = true; else if (c === open) d++; else if (c === close && --d === 0) return JSON.parse(s.slice(i, k + 1));
  }
  throw new Error('the model did not answer with complete JSON');
}

/** a conversation as plain text (for summaries) */
export function transcript(msgs, { toolChars = 600 } = {}) {
  return msgs.map(m => {
    if (m.role === 'user') return `USER: ${m.content}`;
    if (m.role === 'assistant') return [m.content ? `ASSISTANT: ${m.content}` : '', ...(m.tool_calls || []).map(t => `ASSISTANT called ${t.function?.name} ${JSON.stringify(t.function?.arguments ?? {}).slice(0, 700)}`)].filter(Boolean).join('\n');
    if (m.role === 'tool') { const c = String(m.content || ''); return `TOOL ${m.tool_name || ''}: ${c.length > toolChars ? c.slice(0, toolChars) + `…(${c.length - toolChars} more characters)` : c}`; }
    return '';
  }).filter(Boolean).join('\n\n');
}

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const cap = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
