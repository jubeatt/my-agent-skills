import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const RUN_TITLES = { before: "修前重現", after: "修後驗證" };
const STATUS_TEXT = { pass: "通過", fail: "失敗", blocked: "受阻", untested: "未測" };
const KIND_TEXT = { bug: "Bug", happy: "主流程", negative: "負向", boundary: "邊界", regression: "回歸" };

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const readJsonl = async (file) => {
  try {
    return (await readFile(file, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const statusOf = (steps) => {
  if (!steps?.length) return "untested";
  if (steps.some((s) => s.status === "fail")) return "fail";
  if (steps.some((s) => s.status === "blocked")) return "blocked";
  return "pass";
};

const proofOf = (criterion, before, after) => {
  if (!criterion.failsBefore) return null;
  if (before === "untested") return { tone: "warn", text: "未跑修前" };
  if (before === "pass") return { tone: "warn", text: "修前未重現" };
  if (before === "fail" && after === "pass") return { tone: "pass", text: "修前失敗 → 修後通過" };
  return { tone: "fail", text: `修前${STATUS_TEXT[before]} → 修後${STATUS_TEXT[after]}` };
};

const overallOf = (rows) => {
  if (rows.some((r) => r.after === "fail")) return { tone: "fail", text: "未通過" };
  if (rows.some((r) => r.after !== "pass" || (r.proof && r.proof.tone !== "pass"))) return { tone: "warn", text: "部分驗證" };
  return { tone: "pass", text: "通過" };
};

const badge = (tone, text) => `<span class="badge ${tone}">${esc(text)}</span>`;
const statusBadge = (status) => badge(status === "pass" ? "pass" : status === "fail" ? "fail" : "warn", STATUS_TEXT[status]);
const heading = (level, id, text) => `<h${level} id="${id}">${esc(text)}<a class="anchor" href="#${id}" aria-label="連結到此段">#</a></h${level}>`;

const loadImage = async (dir, rel) => {
  try {
    return `data:image/png;base64,${(await readFile(join(dir, rel))).toString("base64")}`;
  } catch {
    return null;
  }
};

const renderAssert = (step) => {
  if (step.blocked) return `<p class="assert"><strong>受阻：</strong>${esc(step.blocked)}</p>`;
  const a = step.assert ?? {};
  const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (isRecord(a.expected) && isRecord(a.actual)) {
    const keys = [...new Set([...Object.keys(a.expected), ...Object.keys(a.actual)])];
    const rows = keys
      .map((key) => {
        const expected = JSON.stringify(a.expected[key]);
        const actual = JSON.stringify(a.actual[key]);
        return `<tr class="${expected === actual ? "" : "mismatch"}"><th>${esc(key)}</th><td><code>${esc(expected ?? "—")}</code></td><td><code>${esc(actual ?? "—")}</code></td></tr>`;
      })
      .join("");
    return `<p class="assert-what"><span class="label">斷言</span>${esc(a.what)}</p>
<div class="table-wrap"><table class="assert-table"><thead><tr><th>欄位</th><th>預期</th><th>實際</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const show = (v) => (typeof v === "string" ? v : JSON.stringify(v));
  return `<dl class="assert">
  <dt>斷言</dt><dd>${esc(a.what)}</dd>
  <dt>預期</dt><dd><code>${esc(show(a.expected))}</code></dd>
  <dt>實際</dt><dd><code class="${show(a.expected) === show(a.actual) ? "" : "mismatch"}">${esc(show(a.actual))}</code></dd>
</dl>`;
};

const FOCUS_HEIGHT = 320;

const renderImage = (src, alt, frame, viewport) => {
  const img = `<img src="${src}" alt="${esc(alt)}">`;
  const [, width, height] = /^(\d+)x(\d+)/.exec(viewport ?? "") ?? [];
  if (!frame.rect || !width) return `<button type="button" class="zoom" aria-label="放大截圖">${img}</button>`;
  const cx = frame.rect.x + frame.rect.width / 2;
  const cy = frame.rect.y + frame.rect.height / 2;
  const top = Math.min(0, Math.max(FOCUS_HEIGHT - Number(height), FOCUS_HEIGHT / 2 - cy));
  const left = `clamp(calc(100% - ${width}px), max(calc(50% - ${Math.round(cx)}px), ${16 - frame.rect.x}px), 0px)`;
  return `<button type="button" class="zoom focus" aria-label="放大截圖" style="height:${FOCUS_HEIGHT}px"><img src="${src}" alt="${esc(alt)}" style="width:${width}px;left:${left};top:${Math.round(top)}px"></button>`;
};

const renderStep = async (dir, run, step, missing) => {
  const id = `${run}-${step.n}`;
  const frames = [];
  for (const frame of step.frames ?? []) {
    const src = frame.shot ? await loadImage(dir, frame.shot) : null;
    if (!src) {
      missing.push(frame.shot ?? `${id}（截圖失敗：${frame.error ?? "未知"}）`);
      frames.push(`<figure class="frame missing"><div>截圖缺失</div><figcaption>${esc(frame.label)}</figcaption></figure>`);
      continue;
    }
    const alt = `${RUN_TITLES[run] ?? run} 步驟 ${step.n}：${frame.label}`;
    frames.push(`<figure class="frame">${renderImage(src, alt, frame, step.viewport)}<figcaption>${esc(frame.label)}${frame.highlight ? ` · 框選 <code>${esc(frame.highlight)}</code>` : ""}${frame.rect ? " · 點擊看全圖" : ""}</figcaption></figure>`);
  }
  const anomalies = step.anomalies ?? [];
  return `<li class="step ${step.status}" id="${id}">
  <div class="step-head"><span class="num">${step.n}</span>${statusBadge(step.status)}<a class="crit" href="#${esc(step.criterion)}">${esc(step.criterion)}</a>${anomalies.length ? badge("warn", `${anomalies.length} 個異常`) : ""}</div>
  <p class="action">${esc(step.action)}</p>
  ${renderAssert(step)}
  <div class="frames">${frames.join("")}</div>
  <p class="meta"><code>${esc(step.url)}</code> · ${esc(step.viewport)} · ${esc(new Date(step.at).toLocaleString("zh-TW", { hour12: false }))}</p>
  ${anomalies.length ? `<details class="anomalies"><summary>Console / Network 異常（${anomalies.length}）</summary><ul>${anomalies.map((x) => `<li><code>${esc(x.kind)}</code> ${esc(x.text)}</li>`).join("")}</ul></details>` : ""}
</li>`;
};

const STYLE = `
:root{--bg:#fbfbfa;--fg:#1c1c1a;--muted:#6b6b66;--line:#e4e3df;--card:#fff;--pass:#15803d;--pass-bg:#dcfce7;--fail:#b91c1c;--fail-bg:#fee2e2;--warn:#a16207;--warn-bg:#fef3c7;--accent:#2563eb;--code:#f3f2ef}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#ecebe6;--muted:#9a9993;--line:#2e2d2a;--card:#1c1c1a;--pass:#4ade80;--pass-bg:#14321f;--fail:#f87171;--fail-bg:#3b1515;--warn:#fbbf24;--warn-bg:#3a2c0b;--accent:#60a5fa;--code:#262523}}
*{box-sizing:border-box}html{scroll-behavior:auto}a{color:var(--accent)}code.mismatch,tr.mismatch td:last-child code{color:var(--fail);background:var(--fail-bg)}.assert-what{margin:0 0 6px;font-size:14px}.assert-what .label{color:var(--muted);margin-right:12px}table.assert-table{margin:0 0 12px;font-size:13px}table.assert-table th,table.assert-table td{padding:4px 10px}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.65 -apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif}
.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:40px;max-width:1280px;margin:0 auto;padding:32px 24px}
nav.toc{position:sticky;top:24px;align-self:start;font-size:14px}nav.toc ol{list-style:none;padding:0;margin:0}nav.toc a{display:block;padding:4px 10px;border-left:2px solid var(--line);color:var(--muted);text-decoration:none}nav.toc a.active{border-color:var(--accent);color:var(--fg)}
main{min-width:0}.prose{max-width:78ch}
h1{font-size:28px;margin:0 0 8px}h2{font-size:21px;margin:48px 0 16px;padding-top:8px;border-top:1px solid var(--line)}h3{font-size:17px;margin:28px 0 12px}
h2,h3,.step,tr[id]{scroll-margin-top:16px}.anchor{margin-left:8px;color:var(--muted);text-decoration:none;opacity:0}h2:hover .anchor,h3:hover .anchor{opacity:1}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:4px;word-break:break-all}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:1px 9px;border-radius:999px;white-space:nowrap}.badge.pass{color:var(--pass);background:var(--pass-bg)}.badge.fail{color:var(--fail);background:var(--fail-bg)}.badge.warn{color:var(--warn);background:var(--warn-bg)}.badge.neutral{color:var(--muted);background:var(--code)}
.verdict{display:flex;align-items:center;gap:12px;margin:20px 0;padding:16px 20px;border-radius:12px;background:var(--card);border:1px solid var(--line)}.verdict .badge{font-size:16px;padding:4px 14px}
.counts{color:var(--muted)}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600;white-space:nowrap}
td .gwt{margin:0}td .gwt b{color:var(--muted);font-weight:600;margin-right:4px}
ol.timeline{list-style:none;padding:0;margin:0;border-left:2px solid var(--line)}
.step{position:relative;margin:0 0 28px 20px;padding:16px 18px;background:var(--card);border:1px solid var(--line);border-radius:12px}.step.fail{border-color:var(--fail)}
.step::before{content:"";position:absolute;left:-28px;top:22px;width:12px;height:12px;border-radius:50%;background:var(--line)}.step.pass::before{background:var(--pass)}.step.fail::before{background:var(--fail)}.step.blocked::before{background:var(--warn)}
.step-head{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:8px}.num{font-weight:700;color:var(--muted)}.crit{font-size:13px;font-weight:600;color:var(--accent);text-decoration:none}
.crit-preview{align-self:stretch;display:inline-flex;align-items:center}
.crit-preview .crit{text-decoration:underline dotted;text-underline-offset:3px}
.crit-tooltip{position:absolute;z-index:2;inset-inline-start:0;top:100%;width:min(100%,30rem);padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);box-shadow:0 6px 24px rgb(0 0 0/.2);font-size:14px;overflow-wrap:anywhere}
.crit-tooltip.above{top:auto;bottom:100%}
.crit-tooltip .gwt{display:grid;grid-template-columns:3.5em minmax(0,1fr);gap:8px;margin:0}
.crit-tooltip .gwt+.gwt{margin-top:4px}
.crit-tooltip b{color:var(--muted)}
.action{font-weight:600;margin:10px 0 6px}
dl.assert{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:2px 12px;margin:0 0 12px;font-size:14px}dl.assert dt{color:var(--muted)}dl.assert dd{margin:0}
.frames{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:12px}
.frame{margin:0;min-width:0}.frame button{all:unset;cursor:zoom-in;display:block;width:100%}.frame img{display:block;width:100%;border:1px solid var(--line);border-radius:8px}.frame .focus{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.frame .focus img{position:absolute;max-width:none;border:none;border-radius:0}.frame figcaption{font-size:13px;color:var(--muted);margin-top:4px}.frame.missing div{padding:40px;text-align:center;border:1px dashed var(--fail);border-radius:8px;color:var(--fail)}
.meta{font-size:12px;color:var(--muted);margin:10px 0 0}
details{margin-top:10px}summary{cursor:pointer;color:var(--muted);font-size:14px}details ul{margin:8px 0 0;padding-left:20px;font-size:13px}
.callout{padding:12px 16px;border-left:4px solid var(--warn);background:var(--warn-bg);border-radius:6px;margin:16px 0}
dialog{border:none;padding:0;background:transparent;max-width:96vw;max-height:96vh}dialog::backdrop{background:rgb(0 0 0/.8)}dialog img{max-width:96vw;max-height:96vh;display:block;cursor:zoom-out}
@media (max-width:860px){.layout{grid-template-columns:1fr;padding:20px 16px}nav.toc{position:static}nav.toc details{border:1px solid var(--line);border-radius:8px;padding:8px 12px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

const SCRIPT = `
const dlg=document.getElementById("zoom");const big=dlg.querySelector("img");
document.addEventListener("click",(e)=>{const b=e.target.closest("button.zoom");if(b){big.src=b.querySelector("img").src;big.alt=b.querySelector("img").alt;dlg.showModal();}});
dlg.addEventListener("click",()=>dlg.close());
document.querySelectorAll(".step-head .crit").forEach((link) => {
  const criterion = document.getElementById(link.getAttribute("href").slice(1));
  const fields = criterion?.querySelectorAll(".gwt");
  if (!fields?.length) return;

  const preview = document.createElement("span");
  preview.className = "crit-preview";
  const tip = document.createElement("span");
  tip.className = "crit-tooltip";
  tip.id = link.closest(".step").id + "-criterion";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  for (const field of fields) {
    const line = document.createElement("span");
    line.className = "gwt";
    for (const child of field.childNodes) line.append(child.cloneNode(true));
    tip.append(line);
  }
  link.setAttribute("aria-describedby", tip.id);
  link.before(preview);
  preview.append(link, tip);

  function show() {
    tip.hidden = false;
    tip.classList.remove("above");
    const head = preview.parentElement.getBoundingClientRect();
    const roomBelow = window.innerHeight - head.bottom;
    tip.classList.toggle("above", tip.offsetHeight > roomBelow && head.top > roomBelow);
  }
  preview.addEventListener("pointerenter", (event) => { if (event.pointerType !== "touch") show(); });
  preview.addEventListener("pointerleave", () => { if (!link.matches(":focus-visible")) tip.hidden = true; });
  link.addEventListener("focus", show);
  link.addEventListener("blur", () => { if (!preview.matches(":hover")) tip.hidden = true; });
  link.addEventListener("click", () => { tip.hidden = true; });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.querySelectorAll(".crit-tooltip:not([hidden])").forEach((tip) => { tip.hidden = true; });
});
const links=[...document.querySelectorAll("nav.toc a")];const map=new Map(links.map((a)=>[a.getAttribute("href").slice(1),a]));
const io=new IntersectionObserver((entries)=>{entries.forEach((en)=>{if(en.isIntersecting){links.forEach((l)=>l.classList.remove("active"));map.get(en.target.id)?.classList.add("active");}});},{rootMargin:"0px 0px -70% 0px"});
map.forEach((_,id)=>{const el=document.getElementById(id);if(el)io.observe(el);});
`;

const main = async () => {
  const dir = resolve(process.argv[2] ?? ".");
  const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
  const compare = meta.mode === "compare";
  const runNames = (await readdir(join(dir, "runs")).catch(() => []))
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.replace(/\.jsonl$/, ""));
  const runs = {};
  for (const name of runNames) runs[name] = await readJsonl(join(dir, "runs", `${name}.jsonl`));
  const order = ["before", "after", ...runNames.filter((n) => n !== "before" && n !== "after")].filter((n) => runs[n] && (compare || n !== "before"));

  const criteria = meta.criteria ?? [];
  const known = new Set(criteria.map((c) => c.id));
  const orphanSteps = order.flatMap((run) => runs[run].filter((s) => !known.has(s.criterion)).map((s) => `${run}#${s.n}→${s.criterion}`));

  const rows = criteria.map((c) => {
    const before = statusOf(runs.before?.filter((s) => s.criterion === c.id));
    const after = statusOf(runs.after?.filter((s) => s.criterion === c.id));
    return { c, before, after, proof: compare ? proofOf(c, before, after) : null };
  });
  const overall = overallOf(rows);
  const counts = Object.fromEntries(Object.keys(STATUS_TEXT).map((k) => [k, rows.filter((r) => r.after === k).length]));
  const hasBefore = compare && Boolean(runs.before);

  const missing = [];
  const runSections = [];
  for (const run of order) {
    const items = [];
    for (const step of runs[run]) items.push(await renderStep(dir, run, step, missing));
    const env = meta.env?.[run] ?? {};
    runSections.push(`<section aria-labelledby="run-${run}">
${heading(2, `run-${run}`, RUN_TITLES[run] ?? run)}
<p class="counts">${env.commit ? `commit <code>${esc(env.commit)}</code> · ` : ""}${env.url ? `<code>${esc(env.url)}</code> · ` : ""}${runs[run].length} 步</p>
<ol class="timeline" id="steps-${run}">${items.join("\n")}</ol>
</section>`);
  }

  const criteriaRows = rows
    .map(({ c, before, after, proof }) => {
      const stepLinks = order
        .flatMap((run) => runs[run].filter((s) => s.criterion === c.id).map((s) => `<a href="#${run}-${s.n}">${run === "before" ? "修前" : run === "after" ? "修後" : run} #${s.n}</a>`))
        .join("、");
      return `<tr id="${esc(c.id)}">
  <td><strong>${esc(c.id)}</strong><br>${badge("neutral", KIND_TEXT[c.kind] ?? c.kind ?? "")}</td>
  <td><p class="gwt"><b>Given</b>${esc(c.given)}</p><p class="gwt"><b>When</b>${esc(c.when)}</p><p class="gwt"><b>Then</b>${esc(c.then)}</p></td>
  ${hasBefore ? `<td>${c.failsBefore ? statusBadge(before) : "—"}</td>` : ""}
  <td>${statusBadge(after)}</td>
  ${hasBefore ? `<td>${proof ? badge(proof.tone, proof.text) : "—"}</td>` : ""}
  <td>${stepLinks || "—"}</td>
</tr>`;
    })
    .join("\n");

  const allAnomalies = order.flatMap((run) => runs[run].flatMap((s) => (s.anomalies ?? []).map((a) => ({ run, n: s.n, ...a }))));
  const sideEffects = meta.sideEffects ?? [];
  const gaps = meta.gaps ?? [];

  const toc = [
    ["summary", "結論"],
    ["criteria", "驗收判準"],
    ...order.map((run) => [`run-${run}`, RUN_TITLES[run] ?? run]),
    ["anomalies", "Console / Network 異常"],
    ["environment", "環境與來源"],
  ];
  const tocList = `<ol>${toc.map(([id, text]) => `<li><a href="#${id}">${esc(text)}</a></li>`).join("")}</ol>`;

  const html = `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.title)} · E2E 驗收</title>
<style>${STYLE}</style>
</head>
<body>
<div class="layout">
<nav class="toc" aria-label="目錄"><details open><summary>目錄</summary>${tocList}</details></nav>
<main>
<header class="prose">
<h1>${esc(meta.title)}</h1>
<p>${badge("neutral", meta.kind === "bug" ? "Bug 修正" : "功能驗收")} ${badge("neutral", compare ? "對照模式" : "驗收模式")} ${esc(meta.summary)}</p>
</header>

<section aria-labelledby="summary" class="prose">
${heading(2, "summary", "結論")}
<div class="verdict">${badge(overall.tone, overall.text)}<span class="counts">${criteria.length} 條判準：${Object.entries(counts).filter(([, v]) => v).map(([k, v]) => `${STATUS_TEXT[k]} ${v}`).join(" · ")}</span></div>
${rows.filter((r) => r.proof).map((r) => `<p><a href="#${esc(r.c.id)}">${esc(r.c.id)}</a> ${badge(r.proof.tone, r.proof.text)}</p>`).join("")}
${gaps.length ? `<div class="callout"><strong>未涵蓋範圍</strong><ul>${gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>` : ""}
${sideEffects.length ? `<div class="callout"><strong>測試留下的資料</strong><ul>${sideEffects.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>` : ""}
${missing.length || orphanSteps.length ? `<div class="callout"><strong>報告完整性問題</strong><ul>${missing.map((m) => `<li>截圖缺失：<code>${esc(m)}</code></li>`).join("")}${orphanSteps.map((o) => `<li>步驟對不到判準：<code>${esc(o)}</code></li>`).join("")}</ul></div>` : ""}
</section>

<section aria-labelledby="criteria">
${heading(2, "criteria", "驗收判準")}
<div class="table-wrap"><table>
<thead><tr><th>判準</th><th>Given / When / Then</th>${hasBefore ? "<th>修前</th>" : ""}<th>修後</th>${hasBefore ? "<th>證明</th>" : ""}<th>步驟</th></tr></thead>
<tbody>${criteriaRows}</tbody>
</table></div>
</section>

${runSections.join("\n")}

<section aria-labelledby="anomalies" class="prose">
${heading(2, "anomalies", "Console / Network 異常")}
${allAnomalies.length ? `<div class="table-wrap"><table><thead><tr><th>步驟</th><th>類型</th><th>內容</th></tr></thead><tbody>${allAnomalies.map((a) => `<tr><td><a href="#${a.run}-${a.n}">${a.run === "before" ? "修前" : a.run === "after" ? "修後" : a.run} #${a.n}</a></td><td><code>${esc(a.kind)}</code></td><td>${esc(a.text)}</td></tr>`).join("")}</tbody></table></div>` : "<p>整個驗收過程沒有收到 console error、未捕捉例外或失敗的 request。</p>"}
</section>

<section aria-labelledby="environment" class="prose">
${heading(2, "environment", "環境與來源")}
<div class="table-wrap"><table><tbody>
${Object.entries(meta.env ?? {}).map(([k, v]) => `<tr><th>${esc(RUN_TITLES[k] ?? k)}</th><td>${typeof v === "object" ? Object.entries(v).map(([kk, vv]) => `${esc(kk)}：<code>${esc(vv)}</code>`).join("<br>") : esc(v)}</td></tr>`).join("")}
<tr><th>產出時間</th><td>${esc(new Date().toLocaleString("zh-TW", { hour12: false }))}</td></tr>
</tbody></table></div>
${(meta.sources ?? []).length ? `<h3 id="sources">來源</h3><ul>${meta.sources.map((s) => `<li>${s.href ? `<a href="${esc(s.href)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}</li>`).join("")}</ul>` : ""}
</section>
</main>
</div>
<dialog id="zoom" aria-label="截圖放大檢視"><img alt=""></dialog>
<script>${SCRIPT}</script>
</body>
</html>`;

  const out = join(dir, "report.html");
  await writeFile(out, html);
  console.log(
    JSON.stringify(
      {
        report: out,
        sizeKB: Math.round((await stat(out)).size / 1024),
        verdict: overall.text,
        criteria: rows.map((r) => ({ id: r.c.id, before: hasBefore && r.c.failsBefore ? r.before : undefined, after: r.after, proof: r.proof?.text })),
        missingShots: missing,
        orphanSteps,
        anomalies: allAnomalies.length,
      },
      null,
      2,
    ),
  );
};

await main();
