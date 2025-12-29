const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { isAuthenticated, isAdmin } = require("../middlewares/authMiddleware");

// 👤 User Orders
router.get("/", isAuthenticated, orderController.getUserOrders);
router.post("/create", isAuthenticated, orderController.placeOrder);

// 🧑‍💼 Admin Orders
router.get("/admin/manage", isAdmin, orderController.getAllOrdersAdmin);
router.post("/admin/:id/update", isAdmin, orderController.updateOrderStatus);
router.post("/admin/:id/delete", isAdmin, orderController.deleteOrder);

module.exports = router;
