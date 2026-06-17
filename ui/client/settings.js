// Settings panel — currently the home of the external Hermes researcher switch.
// Reads the key-free public config from /api/state, writes changes back via
// POST /api/settings (which merges the `hermes` block into .xenodot.json and takes
// effect immediately — the server re-reads the config per Hermes call). The API key
// is write-only here: it's never sent back to the browser (we show only whether one
// is saved), and a blank key field on save keeps the existing key.
import { $, $input, el } from "./dom.js";
import { fetchJSON, postJSON } from "../lib/json.js";

const CUSTOM = "__custom__";

/** Fill the model <select> with the server's curated ids + a "custom…" entry, and
 * select the current model (revealing the custom input when it's not in the list).
 * @param {string[]} models @param {string} current */
function fillModels(models, current) {
  const sel = /** @type {HTMLSelectElement} */ ($("hermes-model"));
  sel.replaceChildren();
  for (const id of models) {
    const opt = /** @type {HTMLOptionElement} */ (el("option", "", id));
    opt.value = id;
    sel.append(opt);
  }
  const customOpt = /** @type {HTMLOptionElement} */ (el("option", "", "custom…"));
  customOpt.value = CUSTOM;
  sel.append(customOpt);

  const known = models.includes(current);
  sel.value = known ? current : CUSTOM;
  toggleCustom(known ? "" : current);
}

/** Show/hide the free-text custom-model input and seed its value. @param {string} value */
function toggleCustom(value) {
  const custom = $input("hermes-model-custom");
  const isCustom = /** @type {HTMLSelectElement} */ ($("hermes-model")).value === CUSTOM;
  custom.style.display = isCustom ? "" : "none";
  if (isCustom && value) custom.value = value;
}

async function open() {
  $("settings-error").textContent = "";
  try {
    const state = /** @type {import("../lib/types.js").ProjectState} */ (
      await fetchJSON("/api/state")
    );
    const h = state.hermes;
    $input("hermes-enabled").checked = h.enabled;
    $input("hermes-url").value = h.apiUrl ?? "";
    $input("hermes-key").value = "";
    $input("hermes-key").placeholder = h.hasKey
      ? "key saved — leave blank to keep it"
      : "paste your Hermes API key";
    fillModels(h.models, h.model);
  } catch {
    $("settings-error").textContent = "Couldn't load settings — is the server up to date?";
  }
  $("settings-modal").style.display = "";
}

function close() {
  $("settings-modal").style.display = "none";
}

async function save() {
  const err = $("settings-error");
  err.textContent = "";
  const sel = /** @type {HTMLSelectElement} */ ($("hermes-model"));
  const model = sel.value === CUSTOM ? $input("hermes-model-custom").value.trim() : sel.value;
  const key = $input("hermes-key").value.trim();
  /** @type {{ enabled: boolean, apiUrl: string, model: string, apiKey?: string }} */
  const hermes = {
    enabled: $input("hermes-enabled").checked,
    apiUrl: $input("hermes-url").value.trim(),
    model,
  };
  if (key) hermes.apiKey = key; // blank → server keeps the saved key
  try {
    const res = /** @type {{ error?: string }} */ (await postJSON("/api/settings", { hermes }));
    if (res.error) {
      err.textContent = res.error;
      return;
    }
  } catch {
    err.textContent = "Save failed — restart the UI server (npm start) and try again.";
    return;
  }
  close();
}

export function initSettings() {
  $("settings-btn").onclick = () => {
    void open();
  };
  $("settings-cancel").onclick = close;
  $("settings-save").onclick = () => {
    void save();
  };
  $("hermes-model").addEventListener("change", () => {
    toggleCustom("");
  });
  // Click the dimmed backdrop (not the panel) to dismiss.
  $("settings-modal").addEventListener("click", (e) => {
    if (e.target === $("settings-modal")) close();
  });
}
