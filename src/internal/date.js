// $date(fmt, date, days): moment-style date formatting (from Jade Vault's flows).
export function jvDate(fmt, d, days) {
  fmt = fmt == null || fmt === '' ? 'YYYY-MM-DD' : String(fmt);
  let t = d instanceof Date ? new Date(d.getTime()) : d == null || d === '' ? new Date() : new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00' : d);
  if (isNaN(t.getTime())) t = new Date();
  if (days) t.setDate(t.getDate() + Number(days));
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const p = (n, w = 2) => String(n).padStart(w, '0'); const h = t.getHours(), D = t.getDate();
  const iso = (() => { const x = new Date(Date.UTC(t.getFullYear(), t.getMonth(), D)); const dn = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - dn); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 864e5 + 1) / 7); })();
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const map = { YYYY: t.getFullYear(), YY: p(t.getFullYear() % 100), MMMM: MONTHS[t.getMonth()], MMM: MONTHS[t.getMonth()].slice(0, 3), MM: p(t.getMonth() + 1), M: t.getMonth() + 1, Do: ord(D), DD: p(D), D,
    dddd: DAYS[t.getDay()], ddd: DAYS[t.getDay()].slice(0, 3), d: t.getDay(), HH: p(h), H: h, hh: p(h % 12 || 12), h: h % 12 || 12, mm: p(t.getMinutes()), m: t.getMinutes(), ss: p(t.getSeconds()), s: t.getSeconds(),
    A: h < 12 ? 'AM' : 'PM', a: h < 12 ? 'am' : 'pm', ww: p(iso), w: iso, X: Math.floor(t.getTime() / 1000), x: t.getTime() };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|Do|DD|dddd|ddd|HH|hh|mm|ss|ww|M|D|d|H|h|m|s|A|a|w|X|x/g, (m, lit) => lit !== undefined ? lit : String(map[m]));
}

