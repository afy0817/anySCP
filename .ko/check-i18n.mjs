// en/ko 번역 파일 키 일치 검사. 복수형 접미사(_one/_other 등)는 같은 키로 본다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/i18n/locales/", import.meta.url).pathname;
const PLURAL = /_(zero|one|two|few|many|other)$/;
const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
const keys = (lng, ns) => {
  const entries = flat(JSON.parse(readFileSync(join(root, lng, `${ns}.json`), "utf8")));
  return { set: new Set(entries.map(([k]) => k.replace(PLURAL, ""))), entries };
};

let problems = 0;
for (const file of readdirSync(join(root, "en")).sort()) {
  const ns = file.replace(/\.json$/, "");
  const en = keys("en", ns);
  const ko = keys("ko", ns);
  const missing = [...en.set].filter((k) => !ko.set.has(k));
  const extra = [...ko.set].filter((k) => !en.set.has(k));
  const empty = ko.entries.filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
  const vars = (s) => [...String(s).matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort().join(",");
  const enMap = new Map(en.entries.map(([k, v]) => [k.replace(PLURAL, ""), v]));
  const varMismatch = ko.entries
    .filter(([k, v]) => enMap.has(k.replace(PLURAL, "")) && vars(enMap.get(k.replace(PLURAL, ""))) !== vars(v))
    .map(([k]) => k);
  for (const [label, list] of [["ko에 없음", missing], ["en에 없음", extra], ["빈 값", empty], ["{{변수}} 불일치", varMismatch]]) {
    if (list.length) {
      problems += list.length;
      console.log(`${ns}: ${label} ${list.length}개 → ${list.slice(0, 10).join(", ")}${list.length > 10 ? " …" : ""}`);
    }
  }
  console.log(`${ns}: en ${en.set.size}개 / ko ${ko.set.size}개`);
}
if (problems) {
  console.log(`\n문제 ${problems}건`);
  process.exit(1);
}
console.log("\nOK: en/ko 키 일치");
