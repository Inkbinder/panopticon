import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Simple static file server for the built Vite app.
// Assumes Vite build output is in ../dist relative to this file.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..", "dist");
const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? "0.0.0.0";

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

const server = http.createServer((req, res) => {
	if (!req.url) {
		res.statusCode = 400;
		res.end("Bad Request");
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
});
