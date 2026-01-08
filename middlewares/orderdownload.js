exports.canDownloadInvoice = async (req, res, next) => {
  const { orderId } = req.params;

  const result = await pool.query(
    "SELECT * FROM orders WHERE id = $1",
    [orderId]
  );

  const order = result.rows[0];

  if (
    req.session.user.role === "admin" ||
    order.user_id === req.session.user.id
  ) {
    return next();
  }

  return res.status(403).send("Unauthorized");
};
