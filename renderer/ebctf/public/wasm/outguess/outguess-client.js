/*
 * outguess-client.js - main-thread helper that drives outguess.worker.js.
 *
 * Responsibilities:
 *   - spawn the module Worker (single-threaded; no SharedArrayBuffer, so no
 *     COOP/COEP headers are required),
 *   - transfer carrier/payload buffers to the worker,
 *   - enforce a timeout and expose cancellation via AbortSignal (both are
 *     implemented as Worker.terminate(), which is the only way to stop a
 *     synchronous WASM job),
 *   - reject with a structured error instead of returning a residual file.
 *
 * This file makes no assumption about where it is served from beyond
 * `workerUrl`.
 */

export class OutguessError extends Error {
  constructor(message, info) {
    super(message);
    this.name = "OutguessError";
    this.info = info || {};
  }
}

let seq = 0;

/**
 * @param {object} job
 * @param {"encode"|"decode"} job.op
 * @param {Uint8Array} job.carrier        carrier image bytes
 * @param {Uint8Array} [job.payload]      payload bytes (encode only)
 * @param {string} job.ext                "jpg" | "ppm" | "pnm" (upstream dispatch key)
 * @param {string} [job.key]              passphrase ("" is a legal key)
 * @param {number} [job.quality]          JPEG quality 75..100
 * @param {boolean} [job.ecc]
 * @param {boolean} [job.noFoil]
 * @param {string} workerUrl              URL of outguess.worker.js
 * @param {number} [timeoutMs]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{bytes: Uint8Array, rc: number, log: string[]}>}
 */
export function runOutguessJob(job, workerUrl, opts = {}) {
  const { timeoutMs = 0, signal } = opts;
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const worker = new Worker(workerUrl, { type: "module" });

    let settled = false;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const done = (res) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(res);
    };
    const onAbort = () => fail(new OutguessError("cancelled", { reason: "abort" }));

    if (signal) {
      if (signal.aborted) return fail(new OutguessError("cancelled", { reason: "abort" }));
      signal.addEventListener("abort", onAbort, { once: true });
    }
    if (timeoutMs > 0) {
      timer = setTimeout(
        () => fail(new OutguessError("timeout after " + timeoutMs + " ms", { reason: "timeout" })),
        timeoutMs
      );
    }

    worker.onerror = (ev) => {
      fail(new OutguessError("worker error: " + (ev.message || "unknown"), { reason: "worker" }));
    };
    worker.onmessage = (ev) => {
      const r = ev.data;
      if (r.error) {
        fail(new OutguessError("worker job failed: " + r.error, { reason: "job", info: r }));
        return;
      }
      if (!r.ok) {
        fail(
          new OutguessError(
            "outguess failed (rc=" + r.rc + (r.trapped ? ", trapped" : "") + ")",
            { reason: "rc", rc: r.rc, log: r.log, trapped: r.trapped }
          )
        );
        return;
      }
      done({ bytes: new Uint8Array(r.bytes), rc: r.rc, log: r.log || [] });
    };

    // Copy before transferring.  postMessage with a transfer list detaches the
    // caller's ArrayBuffer, which would break any caller that reuses the same
    // carrier/payload for a second job (e.g. one payload embedded into several
    // images).  The copies are what we transfer; the caller's arrays survive.
    const carrier = job.carrier.slice();
    const payload = job.payload ? job.payload.slice() : null;
    const transfer = [carrier.buffer];
    if (payload) transfer.push(payload.buffer);
    worker.postMessage(
      {
        id,
        op: job.op,
        carrier,
        payload,
        ext: job.ext,
        key: job.key,
        quality: job.quality,
        ecc: !!job.ecc,
        noFoil: !!job.noFoil,
      },
      transfer
    );
  });
}

/**
 * Carrier type from real magic bytes.
 *
 * Upstream get_handler() dispatches on the *file name* only, and accepts
 * ".jpg" for JPEG and ".ppm"/".pnm" for the PNM family.  We therefore map the
 * real bytes to the extension upstream recognises, instead of forwarding the
 * user's file name.
 *
 * PNM magic: P1/P4 = PBM (bitmap) - NOT supported by upstream pnm.c, so they
 * map to null here; P2/P5 = PGM, P3/P6 = PPM - supported.
 */
export function carrierExt(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes.length >= 2 && bytes[0] === 0x50) {
    const d = bytes[1];
    if (d === 0x32 || d === 0x35 || d === 0x33 || d === 0x36) return "ppm";
  }
  return null;
}
