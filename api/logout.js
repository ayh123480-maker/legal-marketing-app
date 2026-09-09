const { buildClearCookie } = require("../lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Set-Cookie", buildClearCookie());
  res.status(200).json({ ok: true });
};
