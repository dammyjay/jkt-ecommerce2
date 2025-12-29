const pool = require("../utils/db");
const cloudinary = require("../utils/cloudinary");

// 🛍️ Show all products (for users)
exports.getAllProducts = async (req, res) => {
  try {
    const products = await pool.query(`
      SELECT products.*, categories.name AS category_name
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
      ORDER BY products.created_at DESC
    `);

    const categories = await pool.query(
      "SELECT * FROM categories ORDER BY name ASC"
    );

    res.render("public/shop", {
      title: "Product | JKT E-Commerce",
      description: "View products at affordable prices on JKT E-Commerce",
      keywords: "online shopping, jkt, ecommerce",
      image: "/images/JKT logo bg.png",
      products: products.rows,
      categories: categories.rows,
      user: req.session.user
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Server error");
  }
};


// 🧑‍💼 ADMIN: Get all products
exports.getAllProductsAdmin = async (req, res) => {
  try {
    const products = await pool.query(`
      SELECT products.*, categories.name AS category_name
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
      ORDER BY products.id DESC
    `);

    const categories = await pool.query(
      "SELECT * FROM categories ORDER BY name ASC"
    );

    res.render("admin/products", {
      title: "Product | JKT E-Commerce",
      description: "Manage products on JKT E-Commerce",
      keywords: "online shopping, jkt, ecommerce",
      image: "/images/JKT logo bg.png",
      products: products.rows,
      categories: categories.rows,
      user: req.session.user
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).send("Server error");
  }
};


// 🧑‍💼 ADMIN: Create new product
exports.createProduct = async (req, res) => {
  try {
    const { name, description, price, stock, category_id } = req.body;
    let ImageUrl = null;
    if (req.file && req.file.path) {
          const upload = await cloudinary.uploader.upload(req.file.path, {
            folder: "JKT-ecommerce/products",
          });
          ImageUrl = upload.secure_url || null;
        }
    await pool.query(
      "INSERT INTO products (name, description, price, image_url, stock, category_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [name, description, price, ImageUrl, stock, category_id]
    );
    res.redirect("/products/admin/manage");
  } catch (err) {
    console.error("Error adding product:", err);
    res.status(500).send("Server error");
  }
};

// 🧑‍💼 ADMIN: Update product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, stock, category_id } = req.body;
    let ImageUrl;

    if (req.file && req.file.path) {
      const upload = await cloudinary.uploader.upload(req.file.path, {
        folder: "JKT-ecommerce/products",
      });
      ImageUrl = upload.secure_url;
    } else {
      const existing = await pool.query(
        "SELECT image_url FROM products WHERE id=$1",
        [id]
      );
      ImageUrl = existing.rows[0].image_url;
    }


    await pool.query(
      "UPDATE products SET name=$1, description=$2, price=$3, image_url=$4, stock=$5, category_id=$6 WHERE id=$7",
      [name, description, price, ImageUrl, stock, category_id, id]
    );
    res.redirect("/products/admin/manage");
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).send("Server error");
  }
};

// 🧑‍💼 ADMIN: Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM products WHERE id=$1", [id]);
    res.redirect("/products/admin/manage");
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).send("Server error");
  }
};


exports.getProductById = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).send("Invalid product ID");

  try {
    const result = await pool.query(
      `
      SELECT products.*, categories.name AS category_name
      FROM products
      LEFT JOIN categories ON products.category_id = categories.id
      WHERE products.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Product not found");
    }

    const product = result.rows[0];

    res.render("public/detail", {
      product,
      user: req.session.user,

      // ✅ Dynamic SEO
      title: `${product.name} | JKT E-Commerce`,
      description: product.description
        ? product.description.substring(0, 160)
        : `Buy ${product.name} at the best price on JKT E-Commerce`,
      keywords: `${product.name}, ${product.category_name || "products"}, online shopping, JKT`,
      ogImage: product.image_url,

    });

  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).send("Server error");
  }
};
