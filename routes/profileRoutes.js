const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  if (!req.user && !req.session.user) {
    return res.redirect("/auth/login");
  }
  const user = req.user || req.session.user;
  res.render("public/profile", { user });
});

module.exports = router;
