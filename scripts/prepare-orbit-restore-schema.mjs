import { createReadStream, createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";

const [source, target] = process.argv.slice(2);
if (!source || !target || source === target) throw new Error("Expected distinct input and output files");
const marker = "CREATE SCHEMA public;";
const decoder = new StringDecoder("utf8");
let injected = false;
let pending = "";

await pipeline(createReadStream(source), new Transform({
  transform(chunk, _encoding, callback) {
    pending += decoder.write(chunk);
    const end = pending.lastIndexOf("\n");
    if (end < 0) return callback();
    const lines = pending.slice(0, end).split("\n");
    pending = pending.slice(end + 1);
    if (!injected) {
      const index = lines.indexOf(marker);
      if (index >= 0) {
        lines[index] += "\nCREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;";
        injected = true;
      }
    }
    callback(null, lines.join("\n") + "\n");
  },
  flush(callback) {
    if (!injected) return callback(new Error("Public schema declaration is missing from the verified dump."));
    callback(null, pending + decoder.end());
  },
}), createWriteStream(target, { flags: "wx", mode: 0o600 }));
