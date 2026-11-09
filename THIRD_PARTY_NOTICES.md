# Third-party notices

Jade Agent Kit's own code is MIT (see `LICENSE`). Several parts are adapted from Jade Vault (also MIT). It ships or
loads the components below, which keep their own licenses.

## Shipped in this repository (`assets/`)

| Component | Version | License | Notes |
| --- | --- | --- | --- |
| BusyBox (compiled to WebAssembly with Emscripten) | 1.37.0 | **GPL-2.0** | `assets/busybox.wasm` and `assets/busybox.glue.js`. See "BusyBox source" below. BusyBox runs as a separate program (each command is its own WebAssembly instance); the rest of the kit only talks to it through arguments, stdin/stdout and files. |
| Emscripten runtime (in `assets/busybox.glue.js`) | — | MIT / University of Illinois NCSA | |
| SQLite | 3.53.4 | Public domain | `assets/sqlite3.wasm`, built from the amalgamation; build inputs in `third_party/sqlite-wasm/`. |
| sqlite-vec | 0.1.9 | MIT OR Apache-2.0 (Alex Garcia) | linked into `assets/sqlite3.wasm`. |
| wasi-libc (linked into the SQLite build) | — | Apache-2.0 WITH LLVM-exception / MIT / BSD | |
| Jade Lisp (from Jade Vault) | 1.0.0 | MIT | `assets/lisp/`: the interpreter, its library, examples and skill. |
| Jade knowledge engine (`jade-kg`, Rust, from Jade Vault) | — | MIT | `assets/jade_kg.wasm`. Built with `serde_json` (MIT OR Apache-2.0) and the Rust standard library (MIT OR Apache-2.0). |

### BusyBox source

The BusyBox binary is the unmodified BusyBox 1.37.0 sources built for WebAssembly with Emscripten.
Source: https://busybox.net/downloads/busybox-1.37.0.tar.bz2 . A written offer: the maintainers will provide the
complete corresponding source (including the build configuration) on request for three years from each release.

## Loaded on demand from jsDelivr (not in this repository)

| Component | Version | License |
| --- | --- | --- |
| MicroPython (`@micropython/micropython-webassembly-pyscript`) | 1.27.0 | MIT |
| TensorFlow.js (`@tensorflow/tfjs`, `@tensorflow/tfjs-backend-webgpu`) | 4.22.0 | Apache-2.0 |
| ONNX Runtime Web (`onnxruntime-web`) | 1.31.1 | MIT (Microsoft) |
| LiteRT.js (`@litertjs/core`) | 2.5.3 | Apache-2.0 |

## Services

The agent, `search` and `fetch` use Ollama Cloud (https://ollama.com) with your own API key, under Ollama's terms.
