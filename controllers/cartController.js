const pool = require("../utils/db");

exports.getCart = (req, res) => {
  const cart = req.session.cart || {
    items: [],
    totalQty: 0,
    totalPrice: 0
  };

  res.render("public/cart", {
    cart: req.session.cart || { items: [], totalPrice: 0, totalQty: 0 },
    user: req.session.user,
    title: "Your Cart | JKT E-Commerce"
  });
};


exports.addToCart = async (req, res) => {
  const productId = parseInt(req.params.id);
  const quantity = parseInt(req.body.quantity) || 1;

  if (!req.session.cart) {
    req.session.cart = { items: [], totalQty: 0, totalPrice: 0 };
  }

  const cart = req.session.cart;

  const itemIndex = cart.items.findIndex(i => i.product_id === productId);
  const productResult = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);

  if (productResult.rows.length === 0) return res.status(404).json({ error: "Product not found" });

  const prod = productResult.rows[0];

  if (itemIndex > -1) {
    cart.items[itemIndex].quantity += quantity;
  } else {
    cart.items.push({
      product_id: prod.id,
      name: prod.name,
      price: prod.price,
      image_url: prod.image_url,
      quantity,
    });
  }

  cart.totalQty += quantity;
  cart.totalPrice += prod.price * quantity;

  res.json({ success: true, message: `${prod.name} added to cart!`, cart });
};


// Update quantity
exports.updateCart = (req, res) => {
  const productId = parseInt(req.body.product_id);
  const quantity = parseInt(req.body.quantity);

  const cart = req.session.cart;
  if (!cart) return res.status(400).json({ error: "Cart is empty" });

  const item = cart.items.find(i => i.product_id === productId);
  if (!item) return res.status(404).json({ error: "Item not found" });

  cart.totalPrice -= item.price * item.quantity;
  cart.totalQty -= item.quantity;

  item.quantity = quantity;

  cart.totalPrice += item.price * item.quantity;
  cart.totalQty += item.quantity;

  res.json({ success: true, cart });
};

// Remove item
exports.removeItem = (req, res) => {
  const productId = parseInt(req.body.product_id);
  const cart = req.session.cart;
  if (!cart) return res.status(400).json({ error: "Cart is empty" });

  const itemIndex = cart.items.findIndex(i => i.product_id === productId);
  if (itemIndex > -1) {
    const item = cart.items[itemIndex];
    cart.totalPrice -= item.price * item.quantity;
    cart.totalQty -= item.quantity;

    cart.items.splice(itemIndex, 1);
  }

  res.json({ success: true, cart });
};

