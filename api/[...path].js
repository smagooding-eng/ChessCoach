const BACKEND = "https://chess-performance-analyzer.replit.app";

export default async function handler(req, res) {
  const path = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : req.query.path || "";

  const url = `${BACKEND}/api/${path}`;

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      typeof value === "string" &&
      key !== "host" &&
      key !== "connection" &&
      key !== "transfer-encoding"
    ) {
      headers[key] = value;
    }
  }

  const fetchOptions = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    fetchOptions.body = JSON.stringify(req.body);
    headers["content-type"] = headers["content-type"] || "application/json";
  }

  try {
    const response = await fetch(url, fetchOptions);

    res.status(response.status);

    const skipHeaders = new Set([
      "content-encoding",
      "transfer-encoding",
      "connection",
    ]);
    for (const [key, value] of response.headers.entries()) {
      if (!skipHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    const data = await response.text();
    res.send(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to proxy request to backend" });
  }
}
