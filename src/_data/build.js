const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const version = (file) => crypto.createHash("md5").update(fs.readFileSync(path.join(root, file))).digest("hex").slice(0, 8);

module.exports = {
    cssVersion: version("dist/app.min.css"),
    jsVersions: {
        githubStars: version("assets/js/github-stars.js"),
        stickerMap: version("assets/js/sticker-map.js"),
    },
};
