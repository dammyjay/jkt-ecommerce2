const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const myOrders = require("../controllers/myOrdersController");
const { isAuthenticated, isAdmin } = require("../middlewares/authMiddleware");

// 👤 User Orders
router.get("/", isAuthenticated, myOrders.list);
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
router.post("/admin/:id/mark-paid", isAdmin, orderController.markPaid);
router.post("/admin/:id/delete", isAdmin, orderController.deleteOrder);
router.get(
  "/admin/:id",
  isAuthenticated,
  isAdmin,
  orderController.getOrderDetailsModal
);

router.get('/invoice/:id', isAdmin, orderController.downloadInvoice);


// Customer order pages (declared last so /admin/... routes match first)
router.get("/:id", isAuthenticated, myOrders.detail);
router.post("/:id/pay", isAuthenticated, myOrders.payNow);
router.post("/:id/reorder", isAuthenticated, myOrders.reorder);

module.exports = router;
