const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "..", "dist", "app.min.css"));

module.exports = {
    cssVersion: crypto.createHash("md5").update(css).digest("hex").slice(0, 8),
};
