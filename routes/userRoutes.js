const express = require("express");
const router = express.Router();
const { getProfile } = require("../controllers/userController");
const userController = require("../controllers/userController");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const { updateProfile } = require("../controllers/userController");

// Profile page route
// router.get("/profile", getProfile);
router.get("/profile", (req, res) => {
  // Ensure user is logged in
  if (!req.user && !req.session.user) {
    return res.redirect("/auth/login");
  }

  const user = req.user || req.session.user;

  // Render correct profile view
  if (user.role === "admin") {
    res.render("admin/profile", { user });
  } else {
    res.render("public/profile", { user });
  }
});


// Update profile
router.post("/profile", upload.single("profileImage"), updateProfile);

router.post("/subscribe", userController.subscribe);
router.post("/testimonials/create", upload.single("image"), userController.createTestimonial);
router.get("/testimonials", userController.getTestimonialForm);


module.exports = router;


