// The shell as a public API: run command lines against the VFS.
import { createShellEnv } from './internal/shell_core.js';

export class ShellSession {
  /** @param {object} env from createShellEnv; @param {{ cwd?: string, env?: object, timeoutMs?: number }} opts */
  constructor(core, { cwd = '/', env = {}, timeoutMs = 60000 } = {}, busybox = null, engine = () => 'auto') { this.core = core; this.bb = busybox; this.engine = engine; this.sh = new core.Shell({ cwd, env }); this.sh.timeoutMs = timeoutMs; }
  get cwd() { return this.sh.cwd; } set cwd(v) { this.sh.cwd = v; }
  get env() { return this.sh.env; }
  /**
   * Run a command line. Returns { stdout, stderr, code, output } (output is stdout and stderr interleaved).
   * @param {string} command @param {{ stdin?: string, timeoutMs?: number, onOutput?: (text: string, isErr: boolean) => void, signal?: AbortSignal }} [o]
   */
  async run(command, { stdin = '', timeoutMs, onOutput, signal } = {}) {
    // BusyBox starts with the first command when the kit did not start it already (it falls back to JS if it cannot)
    if (this.bb && !this.bb.ready && this.engine() !== 'js') await this.bb.load();
    const sh = this.sh; if (timeoutMs) sh.timeoutMs = timeoutMs;
    sh.onOutput = onOutput || null; sh.aborted = false;
    const ab = () => { sh.aborted = true; }; signal?.addEventListener?.('abort', ab);
    try {
      const r = await sh.run(String(command ?? ''), { stdin });
      const stdout = r.chunks.filter(c => !c.err).map(c => c.s).join(''), stderr = r.chunks.filter(c => c.err).map(c => c.s).join('');
      return { stdout, stderr, code: r.code, output: r.chunks.map(c => c.s).join('') };
    } finally { signal?.removeEventListener?.('abort', ab); sh.onOutput = null; }
  }
}

export function createShell({ vfs, busybox, engine = 'auto', commands = {} }) {
  const env = { vfs, busybox, engine, commands };
  const core = createShellEnv(env);
  return {
    core, commands,
    /** a shell with its own working directory and variables */
    session: (o) => new ShellSession(core, o, busybox, () => env.engine),
    /** 'auto' (BusyBox when loaded, else JS), 'wasm' (BusyBox only) or 'js' (JS applets only) */
    get engine() { return env.engine; }, set engine(e) { env.engine = e; },
  };
}
