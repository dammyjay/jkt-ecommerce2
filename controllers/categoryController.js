  // controllers/categoryController.js

  const pool = require("../utils/db");
  const cloudinary = require('../utils/cloudinary');
  const multer = require('multer');
  const upload = multer({ dest: 'tmp/' }); // temp storage

  /* Get all categories */
  exports.getAllCategories = async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM categories ORDER BY name ASC"
    );
    return rows;
  };

// Create category
exports.createCategory = [
  upload.single("image"),
  async (req, res) => {
    try {
      const { name } = req.body;
      let image_url = null;

      if (!name) throw new Error("Category name is required");

      // Check duplicate
      const existing = await pool.query("SELECT * FROM categories WHERE name = $1", [name]);
      if (existing.rows.length > 0) throw new Error(`Category "${name}" already exists`);

      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: "categories" });
        image_url = result.secure_url;
      }

      await pool.query("INSERT INTO categories (name, image_url) VALUES ($1, $2)", [name, image_url]);
      res.redirect("/admin/categories");
    } catch (err) {
      console.error(err);
      const categories = await getCategories();
      res.render("admin/categories", { categories, error: err.message });
    }
  },
];

// Update category
exports.updateCategory = [
  upload.single("image"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      let image_url = null;

      if (!name) throw new Error("Category name is required");

      // Check duplicate name excluding current
      const existing = await pool.query("SELECT * FROM categories WHERE name = $1 AND id != $2", [name, id]);
      if (existing.rows.length > 0) throw new Error(`Category "${name}" already exists`);

      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, { folder: "categories" });
        image_url = result.secure_url;
        await pool.query("UPDATE categories SET name=$1, image_url=$2 WHERE id=$3", [name, image_url, id]);
      } else {
        await pool.query("UPDATE categories SET name=$1 WHERE id=$2", [name, id]);
      }

      res.redirect("/admin/categories");
    } catch (err) {
      console.error(err);
      const categories = await getCategories();
      res.render("admin/categories", { categories, error: err.message });
    }
  }
];

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM categories WHERE id=$1", [id]);
    res.redirect("/admin/categories");
  } catch (err) {
    console.error(err);
    const categories = await getCategories();
    res.render("admin/categories", { categories, error: "Error deleting category" });
  }
};

  // Helper to fetch categories
  async function getCategories() {
    const { rows } = await pool.query("SELECT * FROM categories ORDER BY name ASC");
    return rows;
  }


  // Render admin categories page
  exports.getAllCategoriesView = async (req, res) => {
    try {
      const { rows: categories } = await pool.query(
        "SELECT * FROM categories ORDER BY name ASC"
      );

      res.render("admin/categories", {
        title: "Categories | JKT E-Commerce",
        description: "Manage product categories",
        keywords: "categories, ecommerce, admin",
        ogImage: "/images/JKT logo bg.png",
        user: req.session.user,
        categories,
      });
    } catch (err) {
      console.error("Error fetching categories:", err);
      res.status(500).send("Server error");
    }
  };
