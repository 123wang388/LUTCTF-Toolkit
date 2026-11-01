// Shared decoding for the registry's {text, files:[{name,mime,bytes|dataUrl}]} contract.
import { bytesToEscapedText } from "./bytesIo.js";
export function parseProductDataUrl(url) {
  if (typeof url !== "string" || !url.startsWith("data:")) throw new Error("Invalid data URL");
  const comma = url.indexOf(",");
  if (comma < 0) throw new Error("Missing data URL separator");
  const [type, ...params] = url.slice(5, comma).split(";");
  if (type && !/^[\w.+-]+\/[\w.+-]+$/.test(type)) throw new Error("Invalid data URL MIME type");
  const data = url.slice(comma + 1);
  const decoded = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] === "%") {
      const hex = data.slice(i + 1, i + 3);
      if (!/^[\da-f]{2}$/i.test(hex)) throw new Error("Invalid data URL percent escape");
      decoded.push(parseInt(hex, 16));
      i += 2;
    } else {
      const code = data.charCodeAt(i);
      if (code > 126 || (code < 32 && !/[\t\n\f\r]/.test(data[i]))) throw new Error("Invalid data URL character");
      decoded.push(code);
    }
  }
  let bytes = Uint8Array.from(decoded);
  if (params.includes("base64")) {
    const clean = new TextDecoder().decode(bytes).replace(/[\t\n\f\r ]/g, "");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean)) throw new Error("Invalid data URL base64");
    bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
  }
  return { bytes, mime: type || "application/octet-stream" };
}

export function productFileEntries(out) {
  if (!out || typeof out !== "object" || !("files" in out)) return [];
  if (!Array.isArray(out.files)) throw new Error("Product files must be an array");
  const files = [];
  for (const f of out.files) {
    if (!f || typeof f !== "object") continue;
    let bytes, mime = f.mime;
    try {
      if (f.bytes !== undefined) {
        if (f.bytes instanceof Uint8Array) bytes = f.bytes;
        else if (Array.isArray(f.bytes)) {
          for (const b of f.bytes) if (!Number.isInteger(b) || b < 0 || b > 255) throw new Error("bytes must contain integers in 0..255");
          bytes = Uint8Array.from(f.bytes);
        }
        else throw new Error("bytes must contain integers in 0..255");
      } else if (f.dataUrl !== undefined) {
        const parsed = parseProductDataUrl(f.dataUrl);
        bytes = parsed.bytes;
        mime ||= parsed.mime;
      } else continue;
    } catch (e) { throw new Error(`File ${f.name || "download.bin"}: ${e.message}`); }
    files.push({ name: String(f.name || "download.bin"), mime: mime || "application/octet-stream", bytes });
  }
  return files;
}

export function productBytesBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function transitTextOf(out) {
  if (out == null) return "";
  if (typeof out !== "object") return String(out);
  if (!("text" in out) && !("files" in out)) return JSON.stringify(out);
  const text = String(out.text ?? "");
  const files = productFileEntries(out);
  if (!files.length && !(out.files?.length)) return text;
  // 护栏本意：**不许把「报告」当作文件内容**传给下一步（报告是描述，不是内容）。
  // 因此只接受三种**无损**形态之一：base64 / hex / \xNN 转义（三者都能精确还原同一批字节）。
  // 校验在全部文件上做，任一文件的形态都不匹配才拒绝 —— 残缺的同批产物不得被放行。
  if (files.some(f => text === productBytesBase64(f.bytes)
    || text.toLowerCase() === Array.from(f.bytes, b => b.toString(16).padStart(2, "0")).join("")
    || text === bytesToEscapedText(f.bytes))) return text;
  throw new Error("配方链中转受限：文件产物的 text 不是原字节的无损表示（Base64 / Hex / \\xNN 转义）。请在链末端下载文件后另起配方，不能把报告当作文件内容。");
}

/**
 * 配方链中转载荷（F02 契约）：与 `transitTextOf` 同源，但**额外交回原始字节**。
 *
 * 返回 `{ text, bytes }`：
 *   · `bytes !== null` ⇒ 上游产物带 `files`（真字节），`text` 是它的**无损表示**
 *     （Base64 / Hex / `\xNN` 转义，护栏与 `transitTextOf` 一致）；
 *   · `bytes === null` ⇒ 上游是纯文本 / JSON，`text` 即内容本身。
 *
 * 调用方（配方执行器）据此决定：
 *   · 下游 `acceptsBytes` ⇒ 注入 `params.rawBytes`，字节**无损**进 op；
 *   · 否则 ⇒ 对 `bytes` 做**严格 UTF-8 解码**：解得出来就照常走文本，
 *     解不出来**显式拒绝** —— 绝不再把 `\xNN` 转义串当内容喂给下游（F02 根因）。
 */
export function transitPayloadOf(out) {
  if (out == null) return { text: "", bytes: null };
  if (typeof out !== "object") return { text: String(out), bytes: null };
  if (!("text" in out) && !("files" in out)) return { text: JSON.stringify(out), bytes: null };
  const text = String(out.text ?? "");
  const files = productFileEntries(out);
  // 无文件产物：维持原文本行为。多文件产物：显式拒绝——字节通道只能承载「唯一一段内容」，
  // 多文件既不能无损合并（拼接等于静默篡改数据），也不该悄悄只取其一（其余内容被静默丢弃）。
  if (files.length !== 1) {
    if (!files.length && !(out.files?.length)) return { text, bytes: null };
    if (files.length > 1) {
      throw new Error(`配方链中转：上游产物包含 ${files.length} 个文件，无法当作单一输入继续串链。请先在链末端下载所需文件后另起配方，或改用只产出一个文件的上游节点。`);
    }
    return { text: transitTextOf(out), bytes: null };
  }
  const bytes = files[0].bytes;
  // 护栏原样保留：text 必须是该批字节的无损表示，否则它是「报告」，不能当内容
  if (text === productBytesBase64(bytes)
    || text.toLowerCase() === Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")
    || text === bytesToEscapedText(bytes)) {
    return { text, bytes };
  }
  throw new Error("配方链中转受限：文件产物的 text 不是原字节的无损表示（Base64 / Hex / \\xNN 转义）。请在链末端下载文件后另起配方，不能把报告当作文件内容。");
}

export function recipeDisplayText(out) {
  if (out == null) return "";
  if (typeof out !== "object") return String(out);
  if (!("text" in out) && !("files" in out)) return JSON.stringify(out, null, 2);
  const files = productFileEntries(out);
  const text = String(out.text ?? "");
  return text + (files.length ? "\n[Files: " + files.map(f => `${f.name} (${f.bytes.length} B)`).join(", ") + "]" : "");
}

export function recipeTerminalText(out) {
  if (out && typeof out === "object" && !("text" in out) && !("files" in out)) {
    return JSON.stringify(Object.fromEntries(Object.entries(out).map(([key, value]) => [key, recipeDisplayText(value)])), null, 2);
  }
  return recipeDisplayText(out);
}
