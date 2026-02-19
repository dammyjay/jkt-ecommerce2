const express = require("express");
const router = express.Router();
const user = require("../controllers/userProjectController");
const { isAuthenticated } = require("../middlewares/authMiddleware");

router.get("/", user.listProjects);

// router.get("/dashboard/userProjects", isAuthenticated, user.userProjects);
// router.get(
//   "/quotation/:id",
//   isAuthenticated,
//   user.viewQuotation
// );
// router.get("/quotation/download/:id", isAuthenticated, user.downloadQuotation);
// router.post("/quotation/accept/:id", isAuthenticated, user.acceptQuotation);

// router.post("/book-custom", isAuthenticated, user.showCustomBookingForm);
// router.post("/book-custom", isAuthenticated, user.bookCustomProject);

// router.get("/:id/book", isAuthenticated, user.showBookingForm);
// router.post("/:id/book", isAuthenticated, user.bookProject);

// router.get("/:id", user.projectDetails);


// module.exports = router;

// Dashboard
router.get("/dashboard/userProjects", isAuthenticated, user.userProjects);

// Quotation routes
router.get("/quotation/:id", isAuthenticated, user.viewQuotation);
// router.get("/quotation/:id", user.viewQuotation);
router.get("/quotation/download/:id", isAuthenticated, user.downloadQuotation);
router.post("/quotation/accept/:id", isAuthenticated, user.acceptQuotation);

// Custom project booking (no ID needed)
router.get("/book-custom", isAuthenticated, user.showCustomBookingForm);
router.post("/book-custom", isAuthenticated, user.bookCustomProject);

// Existing project booking (requires numeric project ID)
router.get("/:id/book", isAuthenticated, user.showBookingForm);
router.post("/:id/book", isAuthenticated, user.bookProject);

// View existing project details
router.get("/:id", user.projectDetails);

module.exports = router;

