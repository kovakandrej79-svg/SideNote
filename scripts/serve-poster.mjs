// 只为预览海报用的极简静态服务
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const PORT = 5180;
createServer((req, res) => {
  try {
    const body = readFileSync("poster/index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(PORT, () => console.log(`poster preview: http://localhost:${PORT}`));
