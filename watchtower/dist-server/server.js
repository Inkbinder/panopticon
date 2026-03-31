import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

// Simple static file server for the built Vite app.
// Assumes Vite build output is in ../dist relative to this file.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readPanopticonConfig() {
	const filePath = path.join(process.cwd(), "panopticon.yaml");
	if (!fs.existsSync(filePath)) return {};
	const raw = fs.readFileSync(filePath, "utf8");
	try {
		const parsed = YAML.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

const config = readPanopticonConfig();

const root = path.resolve(__dirname, "..", "dist");
const port = Number(config.watchtower?.port ?? 5173);
const host = config.watchtower?.host ?? "0.0.0.0";

// Reverse-proxy target for API requests (sentinel).
// In prod, the Vite build calls /api/* on the same origin; this server must forward that.
const apiBaseUrl = new URL(config.watchtower?.apiBaseUrl ?? "http://localhost:8787");

const mime = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".ico": "image/x-icon",
	".map": "application/json; charset=utf-8",
};

function safeResolve(urlPath) {
	const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
	const rel = decoded.replace(/^\/+/, "");
	const p = path.resolve(root, rel);
	if (!p.startsWith(root)) return null;
	return p;
}

function proxyApi(req, res) {
	const isHttps = apiBaseUrl.protocol === "https:";
	const client = isHttps ? https : http;

	const upstreamHeaders = {
		...req.headers,
		host: apiBaseUrl.host,
	};

	const upstreamReq = client.request(
		{
			protocol: apiBaseUrl.protocol,
			hostname: apiBaseUrl.hostname,
			port: apiBaseUrl.port || (isHttps ? 443 : 80),
			method: req.method,
			path: req.url,
			headers: upstreamHeaders,
		},
		(upstreamRes) => {
			res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
			upstreamRes.pipe(res);
		},
	);

	upstreamReq.on("error", () => {
		if (!res.headersSent) {
			res.statusCode = 502;
			res.setHeader("Content-Type", "application/json; charset=utf-8");
		}
		res.end(JSON.stringify({ ok: false, error: "Bad Gateway" }));
	});

	req.pipe(upstreamReq);
}

const server = http.createServer((req, res) => {
	if (!req.url) {
		res.statusCode = 400;
		res.end("Bad Request");
		return;
	}

	// Proxy API routes to sentinel (supports SSE streaming).
	if (req.url.startsWith("/api")) {
		proxyApi(req, res);
		return;
	}

	let filePath = safeResolve(req.url);
	if (!filePath) {
		res.statusCode = 403;
		res.end("Forbidden");
		return;
	}

	try {
		let stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			filePath = path.join(filePath, "index.html");
			stat = fs.statSync(filePath);
		}
		const ext = path.extname(filePath);
		res.setHeader("Content-Type", mime[ext] ?? "application/octet-stream");
		fs.createReadStream(filePath).pipe(res);
	} catch {
		// SPA fallback to index.html
		try {
			res.setHeader("Content-Type", mime[".html"]);
			fs.createReadStream(path.join(root, "index.html")).pipe(res);
		} catch {
			res.statusCode = 404;
			res.end("Not Found");
		}
	}
});

server.listen(port, host, () => {
	console.log(`watchtower serving ${root} at http://${host}:${port}`);
	console.log(`watchtower proxying /api -> ${apiBaseUrl.toString()}`);
});
