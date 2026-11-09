// Senses: the browser's camera, microphone, location, motion sensors, battery, network and device facts, for apps and
// agents; and look, which shows the agent an image from the file system. Sensitive senses (camera, microphone,
// location) work only when your app allows them: createKit({ senses: { allow: ['camera', 'microphone', 'location'] } })
// or kit.senses.allow('camera'), and the browser still asks the user. Ported from Jade Vault (world.js), browser side.
export const SENSITIVE = ['camera', 'microphone', 'location'];
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const round = (x, n = 3) => typeof x === 'number' && isFinite(x) ? +x.toFixed(n) : x;
const IMG = /\.(png|jpe?g|gif|webp|bmp)$/i;

export class Senses {
  /** @param {{ kit: object, allow?: string[], dir?: string }} o dir: where photos and recordings are saved */
  constructor({ kit, allow = [], dir = '/media' } = {}) { Object.assign(this, { kit, vfs: kit.vfs, allowed: new Set(allow), dir: kit.vfs.norm(dir) }); }
  allow(...kinds) { for (const k of kinds.flat()) this.allowed.add(k); return this; }
  _need(kind) { if (!this.allowed.has(kind)) throw new Error(`${kind} is not allowed by this app (createKit({ senses: { allow: ['${kind}'] } }))`); }
  async _blob(blob) { return new Uint8Array(await blob.arrayBuffer()); }
  /**
   * Take a photo → { path, width, height, bytes }
   * @param {{ facing?: 'user'|'environment', width?: number, quality?: number, path?: string }} [o]
   */
  async photo({ facing = 'environment', width = 1280, quality = 0.85, path = null } = {}) {
    this._need('camera'); if (!navigator.mediaDevices?.getUserMedia) throw new Error('this browser has no camera access');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: width } }, audio: false });
    try {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play();
      for (let i = 0; i < 40 && !v.videoWidth; i++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => setTimeout(r, 250));   // let the exposure settle
      const w = Math.min(width, v.videoWidth || width), h = Math.round(w * (v.videoHeight || 3) / (v.videoWidth || 4));
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality)); const bytes = await this._blob(blob);
      const p = this.vfs.norm(path || `${this.dir}/photo-${stamp()}.jpg`); this.vfs.write(p, bytes); v.srcObject = null;
      return { path: p, width: w, height: h, bytes: bytes.length };
    } finally { stream.getTracks().forEach(t => t.stop()); }
  }
  /** record audio for some seconds → { path, seconds, bytes, level } (level: average loudness 0-1) */
  async record({ seconds = 5, path = null } = {}) {
    this._need('microphone'); if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('this browser cannot record audio');
    seconds = Math.max(1, Math.min(120, +seconds || 5));
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      const meter = this._meter(stream); const chunks = []; const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      const done = new Promise(r => { rec.onstop = r; }); rec.start(250); await new Promise(r => setTimeout(r, seconds * 1000)); rec.stop(); await done;
      const level = meter.stop(); const bytes = await this._blob(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      const ext = /ogg/.test(rec.mimeType) ? 'ogg' : /mp4/.test(rec.mimeType) ? 'm4a' : 'webm';
      const p = this.vfs.norm(path || `${this.dir}/audio-${stamp()}.${ext}`); this.vfs.write(p, bytes);
      return { path: p, seconds, bytes: bytes.length, level: round(level) };
    } finally { stream.getTracks().forEach(t => t.stop()); }
  }
  _meter(stream) {
    const ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)(); const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize); let sum = 0, n = 0, peak = 0;
    const t = setInterval(() => { an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; const rms = Math.sqrt(s / buf.length); sum += rms; n++; peak = Math.max(peak, rms); }, 100);
    return { stop: () => { clearInterval(t); ctx.close(); return n ? Math.min(1, sum / n * 4) : 0; }, peak: () => peak };
  }
  /** how loud it is now (0-1), listening for a moment */
  async level({ seconds = 1 } = {}) { this._need('microphone'); const s = await navigator.mediaDevices.getUserMedia({ audio: true }); try { const m = this._meter(s); await new Promise(r => setTimeout(r, Math.max(300, seconds * 1000))); return { level: round(m.stop()) }; } finally { s.getTracks().forEach(t => t.stop()); } }
  /** where the device is → { lat, lon, accuracy_m, altitude, speed, heading, at } */
  async location({ timeout = 15, high = true } = {}) {
    this._need('location'); if (!navigator.geolocation) throw new Error('this browser has no location');
    const p = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, e => rej(new Error(`location: ${e.message || 'denied'}`)), { enableHighAccuracy: high, timeout: timeout * 1000, maximumAge: 10000 }));
    const c = p.coords; return { lat: round(c.latitude, 6), lon: round(c.longitude, 6), accuracy_m: round(c.accuracy, 1), altitude: round(c.altitude, 1), speed: round(c.speed, 2), heading: round(c.heading, 1), at: new Date(p.timestamp).toISOString() };
  }
  /** a short sample of the motion sensors → { acceleration, rotation, orientation } (or why there are none) */
  async motion({ seconds = 1 } = {}) {
    if (typeof DeviceMotionEvent === 'undefined') return { error: 'this browser has no motion sensors' };
    if (typeof DeviceMotionEvent.requestPermission === 'function') { try { if (await DeviceMotionEvent.requestPermission() !== 'granted') return { error: 'motion permission denied' }; } catch (e) { return { error: 'motion needs a tap first (iOS): ' + e.message }; } }
    let acc = null, rot = null, ori = null;
    const m = e => { const a = e.accelerationIncludingGravity || e.acceleration; if (a) acc = { x: round(a.x), y: round(a.y), z: round(a.z) }; if (e.rotationRate) rot = { alpha: round(e.rotationRate.alpha), beta: round(e.rotationRate.beta), gamma: round(e.rotationRate.gamma) }; };
    const o = e => { ori = { alpha: round(e.alpha, 1), beta: round(e.beta, 1), gamma: round(e.gamma, 1) }; };
    addEventListener('devicemotion', m); addEventListener('deviceorientation', o);
    await new Promise(r => setTimeout(r, Math.max(200, seconds * 1000))); removeEventListener('devicemotion', m); removeEventListener('deviceorientation', o);
    return acc || rot || ori ? { acceleration: acc, rotation: rot, orientation: ori } : { error: 'no motion readings (a desktop, or the sensors are off)' };
  }
  async battery() { if (!navigator.getBattery) return { error: 'this browser does not report the battery' }; const b = await navigator.getBattery(); return { level: round(b.level, 2), charging: b.charging, charging_s: isFinite(b.chargingTime) ? b.chargingTime : null, discharging_s: isFinite(b.dischargingTime) ? b.dischargingTime : null }; }
  network() { const c = navigator.connection || {}; return { online: navigator.onLine, type: c.type || null, effective: c.effectiveType || null, downlink_mbps: c.downlink ?? null, rtt_ms: c.rtt ?? null, save_data: !!c.saveData }; }
  device() {
    const s = globalThis.screen || {}; return { user_agent: navigator.userAgent, platform: navigator.userAgentData?.platform || navigator.platform, mobile: navigator.userAgentData?.mobile ?? /Mobi/.test(navigator.userAgent), language: navigator.language, languages: navigator.languages, cores: navigator.hardwareConcurrency, memory_gb: navigator.deviceMemory ?? null, screen: { width: s.width, height: s.height, pixel_ratio: globalThis.devicePixelRatio }, dark: globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, time: new Date().toString(), webgpu: !!navigator.gpu, usb: !!navigator.usb, camera: !!navigator.mediaDevices, allowed: [...this.allowed] };
  }
  /** an image file as base64 for a model (images over ~4 MB are scaled down) */
  async image(path) {
    const p = this.vfs.norm(String(path)); if (!this.vfs.isFile(p)) throw new Error(`no file ${p}`); if (!IMG.test(p)) throw new Error(`${p} is not an image (png, jpg, gif, webp, bmp)`);
    let bytes = this.vfs.readBytes(p);
    if (bytes.length > 4e6 && typeof createImageBitmap === 'function') { const bmp = await createImageBitmap(new Blob([bytes])); const k = Math.sqrt(3e6 / bytes.length); const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k)); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })).arrayBuffer()); }
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s);
  }
  async tool(a, ctx = {}) {
    const act = String(a.action || 'device'); const J = o => JSON.stringify(o, null, 1);
    if (act === 'photo') { const r = await this.photo(a); if (ctx.agent) (ctx.agent.state.look ||= []).push(r.path); return `Took a photo: ${r.path} (${r.width}×${r.height}). You will see it in your next step.`; }
    if (act === 'record') return J(await this.record(a));
    if (act === 'level') return J(await this.level(a));
    if (act === 'location') return J(await this.location(a));
    if (act === 'motion') return J(await this.motion(a));
    if (act === 'battery') return J(await this.battery());
    if (act === 'network') return J(this.network());
    if (act === 'device') return J(this.device());
    throw new Error('unknown action ' + act + ': use photo, record, level, location, motion, battery, network, device');
  }
  get toolDefs() {
    return {
      senses: { description: 'The device: photo (camera; facing user|environment; you then see it), record (microphone, seconds; saved to a file), level (how loud it is), location, motion (accelerometer, gyroscope, orientation), battery, network, device (facts: screen, language, time zone, cores…). Camera, microphone and location work only when the app allows them.',
        parameters: { type: 'object', properties: { action: { type: 'string', enum: ['photo', 'record', 'level', 'location', 'motion', 'battery', 'network', 'device'] }, facing: { type: 'string', enum: ['user', 'environment'] }, seconds: { type: 'number' }, path: { type: 'string' } }, required: ['action'] },
        run: (a, ctx) => this.tool(a, ctx) },
      look: { description: 'Look at an image file (png, jpg, gif, webp): you see it in your next step. Give path, or paths for several (up to 4). Needs a model that understands images.',
        parameters: { type: 'object', properties: { path: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } } } },
        run: async (a, ctx) => { const ps = [...(a.paths || []), ...(a.path ? [a.path] : [])].slice(0, 4).map(p => this.vfs.norm(String(p))); if (!ps.length) throw new Error('give path'); for (const p of ps) { if (!this.vfs.isFile(p)) throw new Error(`no file ${p}`); if (!IMG.test(p)) throw new Error(`${p} is not an image`); } if (!ctx.agent) return 'look only works inside an agent'; (ctx.agent.state.look ||= []).push(...ps); return `You will see ${ps.join(', ')} in your next step.`; } },
    };
  }
  /** an agent plugin: the senses and look tools, and the images look asked for, shown to the model on its next step */
  plugin() {
    return { name: 'senses', tools: ['senses', 'look'],
      prepare: async (agent, { messages }) => {
        const want = agent.state.look; if (!want?.length) return messages; agent.state.look = [];
        const images = []; for (const p of want) { try { images.push(await this.image(p)); } catch {} }
        if (!images.length) return messages;
        const msg = { role: 'user', content: `[The image${images.length > 1 ? 's' : ''} you asked to see: ${want.join(', ')}]`, images };
        agent.messages.push(msg); return [...messages, msg];
      } };
  }
}
