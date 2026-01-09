const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const { isAuthenticated, isAdmin } = require("../middlewares/authMiddleware");

// 👤 User Orders
router.get("/", isAuthenticated, orderController.getUserOrders);
router.post("/create", isAuthenticated, orderController.placeOrder);


// 🧑‍💼 Admin Orders
router.get("/admin/manage", isAdmin, orderController.getAllOrdersAdmin);
router.post(
  "/admin/create",
  isAuthenticated,
  isAdmin,
  orderController.adminCreateOrder
);

router.get(
  '/orders/admin/:id/edit-data',
  orderController.getOrderForEdit
);  

router.get(
  "/admin/:id/items",
  isAuthenticated,
  isAdmin,
  orderController.getOrderItems
);

router.post(
  "/admin/:id/items/update",
  isAuthenticated,
  isAdmin,
  orderController.updateOrderItems
);

router.post("/admin/:id/update", isAdmin, orderController.updateOrderStatus);
router.post("/admin/:id/delete", isAdmin, orderController.deleteOrder);
router.get(
  "/admin/:id",
  isAuthenticated,
  isAdmin,
  orderController.getOrderDetailsModal
);

module.exports = router;
