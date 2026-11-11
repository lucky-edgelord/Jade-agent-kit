// Which embedder a model name means: "hf:<repo>" runs in the page with Transformers.js, anything else is an Ollama
// embedding model (on a machine, or the client passed in).
export function embedder(kit, model, ollama) {
  if (String(model || '').startsWith('hf:')) return async (input, o = {}) => (await kit.use('transformers')).embed(input, { ...o, model });
  return async (input, o = {}) => (ollama || (await kit.use('ollama')).local).embed(input, o);
}
