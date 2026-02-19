const pool = require("../utils/db");
const cloudinary = require("../utils/cloudinary");

exports.getProfile = async (req, res) => {
  try {
    // Assuming you stored user info in session after login
    const userId = req.session.user?.id;

    if (!userId) {
      return res.redirect("/auth/login");
    }

    const result = await pool.query("SELECT * FROM users2 WHERE id = $1", [
      userId,
    ]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).send("User not found");
    }

    res.render("public/profile", { user,
      title: "Profile | JKT E-Commerce",
      description: "Shop quality products at affordable prices on JKT E-Commerce",
      keywords: "online shopping, jkt, ecommerce",
      ogImage: "/images/JKT logo bg.png",
     }); // your ejs file for profile
  } catch (error) {
    console.error("❌ Error loading profile:", error);
    res.status(500).send("Server error");
  }
};


// ✅ Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) return res.redirect("/auth/login");

    const { fullname, phone, address, city, state } = req.body;
    let profileImageUrl = null;

    if (req.file && req.file.path) {
      const upload = await cloudinary.uploader.upload(req.file.path, {
        folder: "JKT-ecommerce/users",
      });
      profileImageUrl = upload.secure_url;
    }

    await pool.query(
      `UPDATE users2 
       SET fullname = $1, phone = $2, address = $3, city = $4, state = $5,
           profile_image = COALESCE($6, profile_image)
       WHERE id = $7`,
      [fullname, phone, address, city, state, profileImageUrl, userId]
    );

    console.log("✅ Profile updated successfully");

    // Refresh session user data after update
    const updatedUser = await pool.query("SELECT * FROM users2 WHERE id = $1", [
      userId,
    ]);
    req.session.user = updatedUser.rows[0];

    res.redirect("/users/profile");
  } catch (err) {
    console.error("❌ Error updating profile:", err);
    res.status(500).send("Server error");
  }
};



exports.subscribe = async (req, res) => {
  try {
    const { email } = req.body;
    await pool.query('INSERT INTO newsletter (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]);
    res.redirect('/?subscribed=true'); // or flash message
  } catch (err) {
    console.error(err);
    res.status(500).send('Subscription failed');
  }
};

exports.getTestimonialForm = (req, res) => {
  res.render("public/testimonials", {
    title: "Add Testimonial | JKT E-Commerce",
  });
};


// Show the testimonial form
exports.getTestimonialForm = (req, res) => {
  res.render("public/testimonials", { // ✅ correct path
    title: "Add Testimonial | JKT E-Commerce",
  });
};

exports.createTestimonial = async (req, res) => {
  try {
    const { name, message, rating } = req.body;
    let imageUrl = null;

    // ✅ Upload image to Cloudinary (same pattern as updateProfile)
    if (req.file && req.file.path) {
      const upload = await cloudinary.uploader.upload(req.file.path, {
        folder: "JKT-ecommerce/testimonials",
      });
      imageUrl = upload.secure_url;
    }

    await pool.query(
      `INSERT INTO testimonials 
        (name, message, rating, image_url, is_approved)
       VALUES ($1, $2, $3, $4, false)`,
      [name, message, rating, imageUrl]
    );

    console.log("✅ Testimonial submitted (pending approval)");

    res.redirect("/users/testimonials?success=true");
  } catch (err) {
    console.error("❌ Error adding testimonial:", err);
    res.status(500).send("Error adding testimonial");
  }
};
