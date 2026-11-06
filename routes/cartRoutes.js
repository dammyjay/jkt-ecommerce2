const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");

router.get("/", cartController.getCart);
router.post("/add/:id", cartController.addToCart);
router.post("/update", cartController.updateCart);
router.post("/remove", cartController.removeItem);

// Coupons
router.post("/coupon", cartController.applyCoupon);
router.post("/coupon/remove", cartController.removeCoupon);

// Checkout
router.get("/checkout", cartController.getCheckout);
router.post("/checkout", cartController.placeOrder);

module.exports = router;
