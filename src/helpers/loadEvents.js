import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(__filename);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export default function loadEvents(client, eventsDir) {
  const files = walk(eventsDir).filter((f) => f.endsWith(".js"));

  const rows = [];
  for (const file of files) {
    const name = path.basename(file);

    try {
      const mod = require(file);
      const evt = mod?.default ?? mod;

      if (!evt?.name || typeof evt.execute !== "function") {
        rows.push([name, "❌"]);
        continue;
      }

      if (evt.once) client.once(evt.name, (...args) => evt.execute(...args));
      else client.on(evt.name, (...args) => evt.execute(...args));

      rows.push([name, "✅"]);
    } catch (e) {
      rows.push([name, "❌"]);
      console.error(`[loadEvents] Failed to load ${file}`, e);
    }
  }

  console.log(".-------------------------------.");
  console.log("|            Events             |");
  console.log("|-------------------------------|");
  console.log("|        Event         | Status |");
  console.log("|----------------------|--------|");
  for (const [file, status] of rows.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`| ${file.padEnd(20)} | ${status.padEnd(6)} |`);
  }
  console.log("'-------------------------------'");
}
