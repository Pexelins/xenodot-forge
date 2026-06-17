// Optionally launch the Hermes gateway alongside the UI server, so `npm start` is the
// one command. Strictly opt-in and non-fatal — Hermes is optional by design:
//   • only when Hermes is ENABLED in config (off → do nothing);
//   • skipped if a gateway is ALREADY reachable (your own `hermes gateway` terminal, or
//     a prior start, keeps winning — we never start a second one / fight for the port);
//   • the gateway is Hermes' OWN external process; we run it as a managed child and kill
//     it on our exit so `npm start`/Ctrl+C doesn't leave an orphan;
//   • a missing `hermes` binary or a launch error only WARNS — the UI starts regardless.
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import { getHermesConfig, LOG_DIR } from "./config.js";
import { checkHermes } from "./hermes-check.js";

/** Kill a child gateway once, ignoring if it's already gone.
 * @param {import("node:child_process").ChildProcess} child */
function stopGateway(child) {
  if (!child.killed) child.kill("SIGTERM");
}

/** Wire process-exit + signal handlers so we don't orphan the spawned gateway. Node
 * suppresses the default signal-termination once a listener exists, so each handler must
 * exit explicitly. @param {import("node:child_process").ChildProcess} child */
function killOnExit(child) {
  process.once("exit", () => {
    stopGateway(child);
  });
  for (const sig of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
    process.once(sig, () => {
      stopGateway(child);
      process.exit(0);
    });
  }
}

/** Start `hermes gateway` if Hermes is enabled and not already up. Returns the child
 * process (so callers could manage it) or null if nothing was started. Resolves after the
 * launch DECISION — it does not block waiting for the gateway to finish booting; the UI's
 * Test-connection / `npm run hermes:check` confirm readiness.
 * @returns {Promise<import("node:child_process").ChildProcess | null>} */
export async function maybeStartHermesGateway() {
  const cfg = getHermesConfig();
  if (!cfg.enabled) return null;
  // Already running (hand-run terminal, or a previous start)? Leave it alone.
  const probe = await checkHermes(cfg, 2500);
  if (probe.reachable) {
    console.log(`Hermes: gateway already running at ${cfg.apiUrl} — not starting another.`);
    return null;
  }
  const logFile = path.join(LOG_DIR, "hermes-gateway.log");
  /** @type {import("node:child_process").ChildProcess} */
  let child;
  try {
    // Pass a real fd — a WriteStream's fd is null until its async 'open', which spawn rejects.
    const fd = openSync(logFile, "a");
    try {
      child = spawn("hermes", ["gateway"], { stdio: ["ignore", fd, fd] });
    } finally {
      closeSync(fd); // the child kept a dup of the fd; close our copy
    }
  } catch (e) {
    console.warn(
      `Hermes: could not launch \`hermes gateway\` (${e instanceof Error ? e.message : String(e)}). ` +
        `Start it yourself or disable Hermes in ⚙ Settings.`,
    );
    return null;
  }
  child.on("error", (err) => {
    // ENOENT etc. — binary missing / not on PATH. Don't take the UI down with it.
    console.warn(
      `Hermes: \`hermes\` not launchable (${err.message}). Installed + on PATH? UI continues.`,
    );
  });
  child.on("exit", (code) => {
    if (code) console.warn(`Hermes: gateway exited (code ${code}). See ${logFile}.`);
  });
  console.log(
    `Hermes: starting gateway → ${cfg.apiUrl ?? "http://localhost:8642"} (logs: ${logFile})`,
  );
  killOnExit(child);
  return child;
}
