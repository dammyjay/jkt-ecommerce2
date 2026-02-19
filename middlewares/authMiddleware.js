// middlewares/authMiddleware.js
// exports.isAuthenticated = (req, res, next) => {
//   if (req.session.user) {
//     next();
//   } else {
//     res.redirect("/auth/login");
//   }
// };

exports.isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }

  // Save original URL
  req.session.returnTo = req.originalUrl;

  return res.redirect("/auth/login");
};


exports.isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === "admin") {
    next();
  } else {
    res.status(403).send("Access Denied: Admins Only");
  }
};
