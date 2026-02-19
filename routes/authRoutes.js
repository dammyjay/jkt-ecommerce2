
const express = require("express");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const passport = require("../utils/passportSetup");
const {
  signup,
  verifyOtp,
  login,
  logout,
} = require("../controllers/authController");

const router = express.Router();

// ---------- Page Routes ----------
router.get("/signup", (req, res) => res.render("public/signup", {
  title: "Sign Up | JKT E-Commerce",
  description: "Create an account to shop quality products at affordable prices on JKT E-Commerce",
  keywords: "signup, register, jkt ecommerce"
}));

router.get("/login", (req, res) => res.render("public/login", {
  title: "Login | JKT E-Commerce",
  description: "Log in to your account to shop quality products at affordable prices on JKT E-Commerce",
  keywords: "login, signin, jkt ecommerce"
}));

router.get("/verifyOtp", (req, res) => res.render("public/verifyOtp", {
  title: "Verify OTP | JKT E-Commerce",
  description: "Verify your account with OTP to shop quality products at affordable prices on JKT E-Commerce",
  keywords: "otp verification, verify account, jkt ecommerce"
}));

// ---------- Auth Actions ----------
router.post("/signup", upload.single("profileImage"), signup);
router.post("/verifyOtp", verifyOtp);
router.post("/login", login);
router.get("/logout", logout);

// ---------- GOOGLE OAUTH ----------
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }), // ✅ fixed redirect path
   (req, res) => {
    // Set session manually
    req.session.user = {
      id: req.user.id,
      fullname: req.user.fullname,
      email: req.user.email,
      role: req.user.role, // important for admin
      phone: req.user.phone,
      address: req.user.address,
      city: req.user.city,
      state: req.user.state,
      profile_image: req.user.profile_image
    };
    
    // Redirect based on role
    if (req.user.role === "admin") {
      return res.redirect("/admin/dashboard");
    }
    res.redirect("/");
  }

);

// ---------- FACEBOOK OAUTH ----------
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login" }), // ✅ fixed
   (req, res) => {
    // Set session manually
    req.session.user = {
      id: req.user.id,
      fullname: req.user.fullname,
      email: req.user.email,
      role: req.user.role, // important for admin
      phone: req.user.phone,
      address: req.user.address,
      city: req.user.city,
      state: req.user.state,
      profile_image: req.user.profile_image
    };
    
    // Redirect based on role
    if (req.user.role === "admin") {
      return res.redirect("/admin/dashboard");
    }
    res.redirect("/");
  }

);

// ---------- LINKEDIN OAUTH ----------
router.get("/linkedin", passport.authenticate("linkedin", { state: true }));

router.get(
  "/linkedin/callback",
  passport.authenticate("linkedin", { failureRedirect: "/login" }), // ✅ fixed
   (req, res) => {
    // Set session manually
    req.session.user = {
      id: req.user.id,
      fullname: req.user.fullname,
      email: req.user.email,
      role: req.user.role, // important for admin
      phone: req.user.phone,
      address: req.user.address,
      city: req.user.city,
      state: req.user.state,
      profile_image: req.user.profile_image
    };
    
    // Redirect based on role
    if (req.user.role === "admin") {
      return res.redirect("/admin/dashboard");
    }
    res.redirect("/");
  }

);

module.exports = router;
