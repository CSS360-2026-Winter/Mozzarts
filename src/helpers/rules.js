// helpers/rules.js
import fs from "node:fs";
import path from "node:path";

const RULES_PATH = path.join(process.cwd(), "config", "rules.json");

export const getRules = () => {
  const raw = fs.readFileSync(RULES_PATH, "utf-8");
  return JSON.parse(raw);
};
