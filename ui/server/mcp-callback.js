// The Hive-side MCP server that external Hermes runs call BACK into — the other half of the
// fire-and-forget loop. The Hive starts a run (hermes-tool.js) and returns immediately; Hermes,
// as it works inside its own agent loop, calls these tools to stream progress into the UI feed
// and to deliver its final findings to the Hive. Nothing blocks; the human keeps working.
//
//   • Transport: stateless Streamable HTTP — Hermes' default for a `url` MCP server (a fresh
//     server+transport per request, the SDK's recommended stateless shape).
//   • Mounted by index.js at MCP_CALLBACK_PATH on this same UI server.
//   • Auth: a static shared secret (mcpKey). Hermes presents it as the Authorization header we
//     configure in ~/.hermes/config.yaml `mcp_servers.xenodot.headers`. No key → no access.
//   • Routing: a tool call carries the per-run `token` (injected into the run's instructions and
//     echoed back as an arg — Hermes passes no caller context to an MCP tool). We look the run up
//     in the run registry and fire its onUpdate/onFindings closures (which reach the right
//     session's feed + inbox).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getHermesConfig } from "./config.js";
import { getRun, clearRun } from "./hermes-runs.js";

/** A tool text result in the shape the MCP SDK expects. @param {string} text */
const ok = (text) => ({ content: [{ type: /** @type {const} */ ("text"), text }] });

/** A fresh stateless MCP server exposing the two callback tools. New per request (stateless
 * Streamable HTTP) to avoid cross-request id collisions. @returns {McpServer} */
function buildServer() {
  const server = new McpServer({ name: "xenodot", version: "0.1.0" });

  server.registerTool(
    "post_update",
    {
      description:
        "Post a short progress update to your human's Xenodot UI so they can watch you work. " +
        "Call it whenever you reach a milestone. ALWAYS pass the `token` from your instructions.",
      inputSchema: {
        token: z.string().describe("The callback token given to you in your instructions."),
        text: z.string().describe("One short progress line (what you just did / are doing)."),
      },
    },
    async ({ token, text }) => {
      const run = getRun(token);
      if (!run) return ok("No live run for that token (it may have ended) — update dropped.");
      run.onUpdate(text);
      return ok("Posted to the UI.");
    },
  );

  server.registerTool(
    "deliver_findings",
    {
      description:
        "Deliver your FINAL findings to the Xenodot Hive when the investigation is complete. " +
        "Call this exactly once, at the end. ALWAYS pass the `token` from your instructions.",
      inputSchema: {
        token: z.string().describe("The callback token given to you in your instructions."),
        text: z.string().describe("Your complete findings, in markdown."),
      },
    },
    async ({ token, text }) => {
      const run = getRun(token);
      if (!run) return ok("No live run for that token (it may have ended) — findings dropped.");
      run.onFindings(text);
      clearRun(token);
      return ok("Delivered to the Hive. Done — thank you.");
    },
  );

  return server;
}

/** Handle one HTTP request to the callback MCP endpoint (stateless). Validates the shared secret,
 * then hands off to a fresh MCP server + transport. @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res @param {unknown} body @returns {Promise<void>} */
export async function handleMcpRequest(req, res, body) {
  const key = getHermesConfig().mcpKey;
  if (!key || req.headers.authorization !== `Bearer ${key}`) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      }),
    );
    return;
  }
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
