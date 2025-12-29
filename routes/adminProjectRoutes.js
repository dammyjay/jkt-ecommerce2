const express = require("express");
const router = express.Router();
const admin = require("../controllers/adminProjectController");
const { isAdmin } = require("../middlewares/authMiddleware");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

router.get("/projects", isAdmin, admin.getProjects);
router.get("/projects/bookings", isAdmin, admin.getBookings);

router.get("/projects/:id", isAdmin, admin.getProjectDetails);
router.get("/projects/create", isAdmin, (req, res) =>
  res.render("admin/projects/create")
);

router.post("/projects/create", isAdmin, upload.single("thumbnail_image"), admin.createProject);

router.post(
  "/projects/:id/update",
  isAdmin,
  upload.single("thumbnail_image"),
  admin.updateProject
);

router.post(
  "/projects/:id/delete",
  isAdmin,
  admin.deleteProject
);

router.post(
  "/projects/:id/images",
  isAdmin,
  upload.array("images", 30), // multiple files, max 10
  admin.addProjectImages
);
router.post("/projects/images/:id/delete", isAdmin, admin.deleteProjectImage);

router.post(
  "/projects/:id/videos",
  isAdmin,
  upload.single("video_file"), // for Cloudinary video
  admin.addProjectVideo
);
router.post('/projects/videos/:id/delete', isAdmin, admin.deleteProjectVideo);

// router.post("/projects/quotation", isAdmin, admin.sendQuotation);
router.post(
  "/projects/quotation",
  isAdmin,
  upload.single("quotation"), // 👈 REQUIRED
  admin.sendQuotation
);


router.post("/projects/milestones/create", isAdmin, admin.createMilestone);

router.post("/projects/progress/update", isAdmin, admin.updateProgress);

module.exports = router;
