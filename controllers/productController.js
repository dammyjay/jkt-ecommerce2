const pool = require("../utils/db");
const cloudinary = require("../utils/cloudinary");
const { withPricing, getTiers } = require("../utils/pricing");
const { projectsUsingProduct } = require("../utils/projectParts");

// Normalise optional sale fields from the admin form
function saleFields(body) {
  const salePrice = parseFloat(body.sale_price);
  return [
    salePrice > 0 ? salePrice : null,
    body.sale_starts_at || null,
    body.sale_ends_at || null,
  ];
}

/**
 * Replace a product's bulk price tiers from the admin form
 * (tier_min[] / tier_price[]). Rows that are blank, below 2 pcs,
 * not cheaper than the regular price, or duplicated are ignored.
 */
async function saveTiers(productId, regularPrice, body) {
  const mins = [].concat(body.tier_min ?? []);
  const prices = [].concat(body.tier_price ?? []);
  const regular = Number(regularPrice);
  const seen = new Set();
  const tiers = [];
  mins.forEach((m, i) => {
    const min_qty = parseInt(m, 10);
    const price = Number(prices[i]);
    if (!(min_qty >= 2) || !(price > 0) || !(price < regular) || seen.has(min_qty)) return;
    seen.add(min_qty);
    tiers.push({ min_qty, price });
  });

  await pool.query("DELETE FROM product_price_tiers WHERE product_id = $1", [productId]);
  for (const t of tiers.slice(0, 5)) {
    await pool.query(
      "INSERT INTO product_price_tiers (product_id, min_qty, price) VALUES ($1, $2, $3)",
      [productId, t.min_qty, t.price]
    );
  }
}

/** Attach `tiers` [{min_qty, price}] to each product row. */
async function withTiers(products) {
  const map = await getTiers(products.map(p => p.id));
  products.forEach(p => { p.tiers = map.get(p.id) || []; });
  return products;
}

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
      products: await withTiers(await withPricing(products.rows)),
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
      products: await withTiers(await withPricing(products.rows)),
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
    const created = await pool.query(
      `INSERT INTO products
        (name, description, price, image_url, stock, category_id, sale_price, sale_starts_at, sale_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [name, description, price, ImageUrl, stock, category_id, ...saleFields(req.body)]
    );
    await saveTiers(created.rows[0].id, price, req.body);
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
      `UPDATE products SET name=$1, description=$2, price=$3, image_url=$4, stock=$5, category_id=$6,
         sale_price=$7, sale_starts_at=$8, sale_ends_at=$9
       WHERE id=$10`,
      [name, description, price, ImageUrl, stock, category_id, ...saleFields(req.body), id]
    );
    await saveTiers(id, price, req.body);
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
    await withPricing([product]); // sets product.pricing
    await withTiers([product]);   // sets product.tiers

    const related = await pool.query(
      `
      SELECT id, name, price, image_url, category_id, sale_price, sale_starts_at, sale_ends_at
      FROM products
      WHERE id <> $1 AND category_id IS NOT DISTINCT FROM $2
      ORDER BY created_at DESC
      LIMIT 4
      `,
      [id, product.category_id]
    );

    res.render("public/detail", {
      product,
      relatedProducts: await withPricing(related.rows),
      usedInProjects: await projectsUsingProduct(product.id),
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
