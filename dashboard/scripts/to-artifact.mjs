// Turn dist/index.html into dist/artifact.html: the same page without the document
// wrapper (<!doctype>, <html>, <head>, <body>), which the artifact host adds itself.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? "";
const metaSides = html.match(/<meta name="claude:viewport-fit-sides"[^>]*>/)?.[0] ?? "";
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join("\n");
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join("\n");
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1].replace(/<script[\s\S]*?<\/script>/g, "").trim() ?? "";

writeFileSync("dist/artifact.html", [title, metaSides, styles, body, scripts].join("\n"));
console.log(`dist/artifact.html: ${(Buffer.byteLength(readFileSync("dist/artifact.html")) / 1024).toFixed(0)} KB`);
