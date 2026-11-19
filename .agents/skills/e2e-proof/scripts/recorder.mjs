import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const IGNORED_URL = /\/favicon\.ico(\?|$)/;
const ACTION_COLOR = "#e11d48";
const ASSERT_COLOR = "#16a34a";

const summarizeEvents = (events) =>
  events.flatMap(({ method, params = {} }) => {
    if (method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(params.type)) {
      const text = (params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" ");
      return [{ kind: `console.${params.type}`, text }];
    }
    if (method === "Runtime.exceptionThrown") {
      const details = params.exceptionDetails ?? {};
      return [{ kind: "exception", text: details.exception?.description ?? details.text ?? "" }];
    }
    if (method === "Network.responseReceived" && params.response.status >= 400 && !IGNORED_URL.test(params.response.url)) {
      return [{ kind: `http ${params.response.status}`, text: `${params.type ?? ""} ${params.response.url}`.trim() }];
    }
    if (method === "Network.loadingFailed" && !params.canceled) {
      return [{ kind: "network", text: `${params.errorText} (${params.type ?? "request"})` }];
    }
    return [];
  });

const drawHighlight = (page, selector, color) =>
  page.evaluate(
    ({ selector, color }) => {
      document.getElementById("__e2e_proof_hl")?.remove();
      const target = document.querySelector(selector);
      if (!target) return null;
      target.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = target.getBoundingClientRect();
      const box = document.createElement("div");
      box.id = "__e2e_proof_hl";
      Object.assign(box.style, {
        position: "fixed",
        left: `${rect.left - 4}px`,
        top: `${rect.top - 4}px`,
        width: `${rect.width + 8}px`,
        height: `${rect.height + 8}px`,
        outline: `3px solid ${color}`,
        borderRadius: "6px",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      document.documentElement.append(box);
      return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
    },
    { selector, color },
  );

const clearHighlight = (page) => page.evaluate(() => document.getElementById("__e2e_proof_hl")?.remove());

const countLines = async (file) => {
  try {
    return (await readFile(file, "utf8")).split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
};

export const createRecorder = async ({ page, dir, run }) => {
  const runFile = join(dir, "runs", `${run}.jsonl`);
  await mkdir(join(dir, "runs"), { recursive: true });
  await mkdir(join(dir, "shots"), { recursive: true });

  // egoAutomated resets on every ego-browser invocation, so console capture must be re-armed per script.
  await page.cdp("egoAutomated.disable");
  await page.cdp("Runtime.enable");
  await page.cdp("Network.enable");

  let frames = [];

  const capture = async (label, selector, color) => {
    const stepNo = (await countLines(runFile)) + 1;
    const file = `shots/${run}-${String(stepNo).padStart(2, "0")}-${frames.length + 1}.png`;
    const rect = selector ? await drawHighlight(page, selector, color) : null;
    let shot = file;
    try {
      await page.screenshot({ path: join(dir, file) });
    } catch {
      try {
        await page.screenshot({ path: join(dir, file) });
      } catch (error) {
        shot = null;
        frames.push({ label, shot, error: String(error?.message ?? error) });
      }
    }
    if (rect) await clearHighlight(page);
    if (shot) frames.push({ label, shot, highlight: rect ? selector : null, rect });
  };

  const frame = (label, { highlight } = {}) => capture(label, highlight, ACTION_COLOR);

  const step = async ({ criterion, action, assert, blocked, highlight, label = "結果" }) => {
    await capture(label, highlight, ASSERT_COLOR);
    const status = blocked ? "blocked" : assert?.pass === true ? "pass" : "fail";
    const record = {
      n: (await countLines(runFile)) + 1,
      at: new Date().toISOString(),
      criterion,
      action,
      assert: assert ?? null,
      blocked: blocked ?? null,
      status,
      url: await page.url(),
      viewport: await page.evaluate(() => `${innerWidth}x${innerHeight}@${devicePixelRatio}x`),
      frames,
      anomalies: summarizeEvents(await page.events()),
    };
    await appendFile(runFile, `${JSON.stringify(record)}\n`);
    frames = [];
    return { n: record.n, status, anomalies: record.anomalies.length };
  };

  return { frame, step };
};
