// const express = require("express");
// const router = express.Router();
// const productController = require("../controllers/productController");
// const { isAuthenticated, isAdmin } = require("../middlewares/authMiddleware");
// const multer = require("multer");
// const upload = multer({ dest: "uploads/" });

// // 🌐 Public & User Routes
// router.get("/", productController.getAllProducts); // Everyone can see products
// router.get("/:id", productController.getProductById);

// // 🧑‍💼 ADMIN ROUTES (single view for CRUD)
// router.get("/admin/manage", isAdmin, productController.getAllProductsAdmin);
// router.post("/admin/create", upload.single("image"), isAdmin, productController.createProduct);
// router.post("/admin/:id/update", isAdmin, productController.updateProduct);
// router.post("/admin/:id/delete", isAdmin, productController.deleteProduct);

// module.exports = router;



const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const { isAuthenticated, isAdmin } = require("../middlewares/authMiddleware");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

// 🧑‍💼 ADMIN ROUTES (single view for CRUD) - put first!
router.get("/admin/manage", isAdmin, productController.getAllProductsAdmin);
router.post("/admin/create", upload.single("image"), isAdmin, productController.createProduct);
router.post("/admin/:id/update", upload.single("image"), isAdmin, productController.updateProduct);
router.post("/admin/:id/delete", isAdmin, productController.deleteProduct);

// 🌐 Public & User Routes
router.get("/", productController.getAllProducts); // Everyone can see products
router.get("/:id", productController.getProductById);

module.exports = router;
