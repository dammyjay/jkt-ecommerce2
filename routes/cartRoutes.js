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

// Checkout & payment
router.get("/checkout", cartController.getCheckout);
router.post("/checkout", cartController.placeOrder);
router.get("/payment/callback", cartController.paymentCallback);

module.exports = router;
