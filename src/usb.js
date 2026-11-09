// usb: USB devices through WebUSB (Chrome and Edge, on https or localhost). Only a person can pick a device: your app calls
// kit.usb.request(filters) from a click; after that the agent (and your code) can open it, claim an interface and send
// control and bulk/interrupt transfers. From Jade Vault (usb.js), browser side.
const hex = n => '0x' + Number(n).toString(16).padStart(4, '0');
const toBytes = d => d == null ? new Uint8Array() : typeof d === 'string' ? (/^(?:[0-9a-f]{2})+$/i.test(d.replace(/\s+/g, '')) ? Uint8Array.from(d.replace(/\s+/g, '').match(/../g), h => parseInt(h, 16)) : new TextEncoder().encode(d)) : Uint8Array.from(d);
const show = dv => { const b = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength); return { hex: [...b].map(x => x.toString(16).padStart(2, '0')).join(' '), text: /^[\x09\x0a\x0d\x20-\x7e]*$/.test(new TextDecoder().decode(b)) ? new TextDecoder().decode(b) : null, length: b.length }; };

export class Usb {
  constructor({ kit } = {}) { this.kit = kit; }
  get supported() { return !!globalThis.navigator?.usb; }
  _check() { if (!this.supported) throw new Error('WebUSB is not available here (Chrome or Edge, on https or localhost)'); }
  info(d, i) { return { id: i, vendor: hex(d.vendorId), product: hex(d.productId), name: d.productName || null, maker: d.manufacturerName || null, serial: d.serialNumber || null, opened: d.opened, configuration: d.configuration?.configurationValue ?? null, interfaces: (d.configuration?.interfaces || []).map(x => ({ number: x.interfaceNumber, claimed: x.claimed, class: x.alternate?.interfaceClass, endpoints: (x.alternate?.endpoints || []).map(e => ({ number: e.endpointNumber, direction: e.direction, type: e.type, size: e.packetSize })) })) }; }
  /** the devices this page may use */
  async list() { this._check(); return (await navigator.usb.getDevices()).map((d, i) => this.info(d, i)); }
  /** ask the user to pick a device (call from a click) → its info */
  async request(filters = []) { this._check(); const d = await navigator.usb.requestDevice({ filters }); const all = await navigator.usb.getDevices(); return this.info(d, all.indexOf(d)); }
  async device(id = 0) { this._check(); const all = await navigator.usb.getDevices(); const d = all[+id]; if (!d) throw new Error(all.length ? `no device ${id}; devices: 0-${all.length - 1}` : 'no USB device has been allowed yet: the app has to call kit.usb.request() from a click'); return d; }
  async open(id = 0) { const d = await this.device(id); if (!d.opened) await d.open(); if (d.configuration === null) await d.selectConfiguration(1); return this.info(d, +id); }
  async close(id = 0) { const d = await this.device(id); if (d.opened) await d.close(); return true; }
  async claim(id = 0, iface = 0) { const d = await this.device(id); if (!d.opened) await this.open(id); await d.claimInterface(+iface); return true; }
  async release(id = 0, iface = 0) { const d = await this.device(id); await d.releaseInterface(+iface); return true; }
  /** control transfer: { direction: 'in'|'out', requestType: 'standard'|'class'|'vendor', recipient: 'device'|'interface'|'endpoint'|'other', request, value, index, length | data } */
  async control(id, o) {
    const d = await this.device(id); if (!d.opened) await this.open(id);
    const setup = { requestType: o.requestType || 'vendor', recipient: o.recipient || 'device', request: +o.request || 0, value: +o.value || 0, index: +o.index || 0 };
    if ((o.direction || 'in') === 'in') { const r = await d.controlTransferIn(setup, +o.length || 64); return { status: r.status, ...(r.data ? show(r.data) : {}) }; }
    const r = await d.controlTransferOut(setup, toBytes(o.data)); return { status: r.status, written: r.bytesWritten };
  }
  async transferIn(id, endpoint, length = 64) { const d = await this.device(id); const r = await d.transferIn(+endpoint, +length); return { status: r.status, ...(r.data ? show(r.data) : {}) }; }
  async transferOut(id, endpoint, data) { const d = await this.device(id); const r = await d.transferOut(+endpoint, toBytes(data)); return { status: r.status, written: r.bytesWritten }; }
  async tool(a) {
    const act = String(a.action || 'list'), id = a.device ?? 0, J = o => JSON.stringify(o, null, 1);
    if (!this.supported) return 'WebUSB is not available in this browser.';
    if (act === 'list') { const l = await this.list(); return l.length ? J(l) : 'No USB devices are allowed yet. Ask the user to connect one with the app\'s button (kit.usb.request).'; }
    if (act === 'open') return J(await this.open(id)); if (act === 'close') { await this.close(id); return 'closed'; }
    if (act === 'claim') { await this.claim(id, a.interface ?? 0); return 'claimed'; } if (act === 'release') { await this.release(id, a.interface ?? 0); return 'released'; }
    if (act === 'control') return J(await this.control(id, a));
    if (act === 'in') return J(await this.transferIn(id, a.endpoint, a.length));
    if (act === 'out') return J(await this.transferOut(id, a.endpoint, a.data));
    throw new Error('unknown action ' + act + ': use list, open, close, claim, release, control, in, out');
  }
  get toolDefs() {
    return { usb: {
      description: 'USB devices the user allowed for this page (WebUSB). list; open / close (device: index from list); claim / release (interface); control (direction in|out, requestType standard|class|vendor, recipient, request, value, index, length or data); in (endpoint, length); out (endpoint, data: hex like "01 02 ff" or text). Only the user can allow a new device.',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'open', 'close', 'claim', 'release', 'control', 'in', 'out'] }, device: { type: 'integer' }, interface: { type: 'integer' }, direction: { type: 'string', enum: ['in', 'out'] }, requestType: { type: 'string', enum: ['standard', 'class', 'vendor'] }, recipient: { type: 'string', enum: ['device', 'interface', 'endpoint', 'other'] }, request: { type: 'integer' }, value: { type: 'integer' }, index: { type: 'integer' }, endpoint: { type: 'integer' }, length: { type: 'integer' }, data: { type: 'string' } }, required: ['action'] },
      run: a => this.tool(a),
    } };
  }
  plugin() { return { name: 'usb', tools: ['usb'] }; }
}
