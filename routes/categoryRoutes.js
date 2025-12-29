// routes/categoryRoutes.js

const express = require("express");
const router = express.Router();
const { createCategory, getAllCategoriesView, updateCategory, deleteCategory } = require("../controllers/categoryController");

// GET all categories page
router.get("/admin/categories", getAllCategoriesView);

// POST create category
router.post("/admin/categories/create", createCategory);
router.post("/admin/categories/update/:id", updateCategory);
router.post("/admin/categories/delete/:id", deleteCategory);

module.exports = router;

