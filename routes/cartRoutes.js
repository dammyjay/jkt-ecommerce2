const pool = require("../utils/db");

// const express = require("express");
// const router = express.Router();
// const cartController = require("../controllers/cartController");

// router.post("/add/:id", cartController.addToCart);
// router.get("/", cartController.getCart);
// router.post("/update/:id", cartController.updateCart);
// router.get("/checkout", (req, res) => {
//   if (!req.session.cart || req.session.cart.items.length === 0) {
//     return res.redirect("/cart");
//   }

//   res.render("public/checkout", {
//     cart: req.session.cart,
//     user: req.session.user,
//     title: "Checkout | JKT E-Commerce"
//   });
// });



// module.exports = router;


const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");

router.post("/add/:id", cartController.addToCart);
router.get("/", cartController.getCart);

// Updated AJAX-friendly routes (no :id in URL)
router.post("/update", cartController.updateCart);
router.post("/remove", cartController.removeItem);

// router.get("/checkout", (req, res) => {
//   if (!req.session.cart || req.session.cart.items.length === 0) {
//     return res.redirect("/cart");
//   }

//   res.render("public/checkout", {
//     cart: req.session.cart,
//     user: req.session.user,
//     title: "Checkout | JKT E-Commerce"
//   });
// });

// GET checkout page
router.get("/checkout", async (req, res) => {
  const cart = req.session.cart;
  if (!cart || cart.items.length === 0) return res.redirect("/cart");

  let userData = {};

  if (req.session.user) {
    // Fetch user details from users2 table
    const result = await pool.query(
      "SELECT fullname, email, phone, address, city, state FROM users2 WHERE id = $1",
      [req.session.user.id]
    );
    if (result.rows.length > 0) {
      userData = result.rows[0];
    }
  }

  res.render("public/checkout", {
    cart,
    user: userData,
    title: "Checkout | JKT E-Commerce",
  });
});

// POST checkout form
router.post("/checkout", async (req, res) => {
  const { fullname, email, phone, address, city, state, payment_method } = req.body;
  const cart = req.session.cart;

  if (!cart || cart.items.length === 0) return res.redirect("/cart");

  // Here you would:
  // 1️⃣ Save the order in your database
  // 2️⃣ Redirect to payment page (Paystack / PayPal / Stripe)
  // 3️⃣ Clear cart after successful payment

  // Example: save order in orders table (you need to create this)
  // const order = await pool.query(
  //   "INSERT INTO orders(user_id, fullname, email, phone, address, city, state, total, payment_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
  //   [req.session.user?.id || null, fullname, email, phone, address, city, state, cart.totalPrice, payment_method]
  // );

  res.send(`Order received! Payment method: ${payment_method}`);
});


module.exports = router;
