const pool = require("../utils/db");
const sendEmail = require("../utils/sendEmail");
const quotationTemplate = require("../utils/emailTemplates/projectQuotation");
const cloudinary = require("../utils/cloudinary");
const { getProjectParts } = require("../utils/projectParts");


// 🧑‍💼 ADMIN: Create new project
exports.createProject = async (req, res) => {
  try {
    const {
      title,
      short_description,
      full_description,
      category,
      complexity_level,
      estimated_price,
      price_type,
    } = req.body;

    let thumbnailUrl = null;

    // Upload thumbnail to Cloudinary if file exists
    if (req.file) {
      const upload = await cloudinary.uploader.upload(req.file.path, {
        folder: "JKT-ecommerce/projects",
      });
      thumbnailUrl = upload.secure_url || null;
    }

    await pool.query(
      `INSERT INTO projects
       (title, short_description, full_description, category, complexity_level, estimated_price, price_type, thumbnail_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        title,
        short_description,
        full_description,
        category,
        complexity_level,
        estimated_price,
        price_type,
        thumbnailUrl,
      ]
    );

    res.redirect("/admin/projects");
  } catch (err) {
    console.error("❌ Error creating project:", err);
    res.status(500).send("Server error");
  }
};

// 🧑‍💼 ADMIN: Update project
exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      short_description,
      full_description,
      category,
      complexity_level,
      estimated_price,
      price_type,
    } = req.body;

    let thumbnailUrl = null;

    // Upload new thumbnail if selected
    if (req.file) {
      const upload = await cloudinary.uploader.upload(req.file.path, {
        folder: "JKT-ecommerce/projects",
      });
      thumbnailUrl = upload.secure_url;
    }

    if (thumbnailUrl) {
      await pool.query(
        `UPDATE projects SET
          title=$1,
          short_description=$2,
          full_description=$3,
          category=$4,
          complexity_level=$5,
          estimated_price=$6,
          price_type=$7,
          thumbnail_image=$8
         WHERE id=$9`,
        [
          title,
          short_description,
          full_description,
          category,
          complexity_level,
          estimated_price,
          price_type,
          thumbnailUrl,
          id,
        ]
      );
    } else {
      await pool.query(
        `UPDATE projects SET
          title=$1,
          short_description=$2,
          full_description=$3,
          category=$4,
          complexity_level=$5,
          estimated_price=$6,
          price_type=$7
         WHERE id=$8`,
        [
          title,
          short_description,
          full_description,
          category,
          complexity_level,
          estimated_price,
          price_type,
          id,
        ]
      );
    }

    res.redirect("/admin/projects");
  } catch (err) {
    console.error("❌ Error updating project:", err);
    res.status(500).send("Server error");
  }
};

// 🧑‍💼 ADMIN: Delete project
exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    // Optional: get image URL first (for future Cloudinary delete)
    const result = await pool.query(
      "SELECT thumbnail_image FROM projects WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Project not found");
    }

    // Delete project
    await pool.query("DELETE FROM projects WHERE id = $1", [id]);

    res.redirect("/admin/projects");
  } catch (err) {
    console.error("❌ Error deleting project:", err);
    res.status(500).send("Server error");
  }
};


// 🖼️ Add images to project gallery
exports.addProjectImages = async (req, res) => {
  try {
    const projectId = req.params.id;

    if (!req.files || req.files.length === 0) {
      return res.status(400).send("No images uploaded");
    }

    // Upload each image to Cloudinary
    for (const file of req.files) {
      const upload = await cloudinary.uploader.upload(file.path, {
        folder: `JKT-ecommerce/projects/${projectId}/gallery`,
      });

      await pool.query(
        `INSERT INTO project_images (project_id, image_url)
         VALUES ($1, $2)`,
        [projectId, upload.secure_url]
      );
    }

    res.redirect(`/admin/projects/${projectId}`);
  } catch (err) {
    console.error("❌ Error adding project images:", err);
    res.status(500).send("Server error");
  }
};
// Delete Project Image
exports.deleteProjectImage = async (req, res) => {
  try {
    const imageId = req.params.id;

    // Get project ID to redirect back
    const result = await pool.query(
      "SELECT project_id FROM project_images WHERE id = $1",
      [imageId]
    );

    if (result.rows.length === 0) return res.status(404).send("Image not found");
    const projectId = result.rows[0].project_id;

    // Delete from DB
    await pool.query("DELETE FROM project_images WHERE id = $1", [imageId]);

    res.redirect(`/admin/projects/${projectId}`);
  } catch (err) {
    console.error("❌ Error deleting project image:", err);
    res.status(500).send("Server error");
  }
};

// 🎬 Add demo video to project
exports.addProjectVideo = async (req, res) => {
  try {
    const projectId = req.params.id;
    const { video_type } = req.body; // 'youtube' or 'cloudinary'
    let videoUrl = null;

    if (video_type === "cloudinary") {
      if (!req.file) return res.status(400).send("No video file uploaded");

      const upload = await cloudinary.uploader.upload(req.file.path, {
        resource_type: "video",
        folder: `JKT-ecommerce/projects/${projectId}/videos`,
      });
      videoUrl = upload.secure_url;
    } else if (video_type === "youtube") {
      videoUrl = req.body.video_url;
    }

    if (!videoUrl) return res.status(400).send("Video URL missing");

    await pool.query(
      `INSERT INTO project_videos (project_id, video_type, video_url)
       VALUES ($1, $2, $3)`,
      [projectId, video_type, videoUrl]
    );

    res.redirect(`/admin/projects/${projectId}`);
  } catch (err) {
    console.error("❌ Error adding project video:", err);
    res.status(500).send("Server error");
  }
};

// Delete Project Video
exports.deleteProjectVideo = async (req, res) => {
  try {
    const videoId = req.params.id;

    // Get project ID to redirect back
    const result = await pool.query(
      "SELECT project_id FROM project_videos WHERE id = $1",
      [videoId]
    );

    if (result.rows.length === 0) return res.status(404).send("Video not found");
    const projectId = result.rows[0].project_id;

    // Delete from DB
    await pool.query("DELETE FROM project_videos WHERE id = $1", [videoId]);

    res.redirect(`/admin/projects/${projectId}`);
  } catch (err) {
    console.error("❌ Error deleting project video:", err);
    res.status(500).send("Server error");
  }
};

// VIEW ALL PROJECTS
exports.getProjects = async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM projects ORDER BY created_at DESC"
  );
  res.render("admin/projects/index", { projects: rows });
};

exports.getProjectDetails = async (req, res) => {
  const projectId = parseInt(req.params.id);

  if (isNaN(projectId)) {
    return res.status(400).send("Invalid project ID");
  }

  const projectRes = await pool.query(
    "SELECT * FROM projects WHERE id=$1",
    [projectId]
  );

  const imagesRes = await pool.query(
    "SELECT * FROM project_images WHERE project_id=$1",
    [projectId]
  );

  const videosRes = await pool.query(
    "SELECT * FROM project_videos WHERE project_id=$1",
    [projectId]
  );

  const [partsList, productsRes] = await Promise.all([
    getProjectParts(projectId),
    pool.query("SELECT id, name, price, stock FROM products ORDER BY name ASC"),
  ]);

  const partsError = req.session.partsError || null;
  delete req.session.partsError;

  res.render("admin/projects/details", {
    project: projectRes.rows[0],
    images: imagesRes.rows,
    videos: videosRes.rows,
    partsList,
    products: productsRes.rows,
    partsError,
  });
};

// ---------- Parts list ----------

const partsBack = (req, res, projectId, error) => {
  if (error) req.session.partsError = error;
  res.redirect(`/admin/projects/${projectId}#parts`);
};

// Add a product to a project's parts list (adding it again updates the quantity)
exports.addProjectPart = async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const productId = parseInt(req.body.product_id, 10);
  const quantity = parseInt(req.body.quantity, 10);
  const note = String(req.body.note || "").trim().slice(0, 120) || null;
  if (!productId) return partsBack(req, res, projectId, "Choose a product to add.");
  if (!(quantity > 0)) return partsBack(req, res, projectId, "Quantity must be at least 1.");
  try {
    await pool.query(
      `INSERT INTO project_parts (project_id, product_id, quantity, note, sort_order)
       VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(sort_order) + 1 FROM project_parts WHERE project_id = $1), 0))
       ON CONFLICT (project_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, note = EXCLUDED.note`,
      [projectId, productId, quantity, note]
    );
    partsBack(req, res, projectId);
  } catch (err) {
    console.error("Error adding project part:", err);
    partsBack(req, res, projectId, "Could not add that part.");
  }
};

exports.updateProjectPart = async (req, res) => {
  const partId = parseInt(req.params.partId, 10);
  const quantity = parseInt(req.body.quantity, 10);
  const note = String(req.body.note || "").trim().slice(0, 120) || null;
  try {
    const { rows } = await pool.query(
      "UPDATE project_parts SET quantity = $2, note = $3 WHERE id = $1 AND $2 > 0 RETURNING project_id",
      [partId, quantity, note]
    );
    const projectId = rows[0]?.project_id || parseInt(req.body.project_id, 10);
    partsBack(req, res, projectId, rows.length ? null : "Quantity must be at least 1.");
  } catch (err) {
    console.error("Error updating project part:", err);
    res.status(500).send("Server error");
  }
};

exports.deleteProjectPart = async (req, res) => {
  const partId = parseInt(req.params.partId, 10);
  try {
    const { rows } = await pool.query("DELETE FROM project_parts WHERE id = $1 RETURNING project_id", [partId]);
    partsBack(req, res, rows[0]?.project_id || parseInt(req.body.project_id, 10));
  } catch (err) {
    console.error("Error removing project part:", err);
    res.status(500).send("Server error");
  }
};

// VIEW BOOKINGS (ADMIN)
exports.getBookings = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        pb.id,
        pb.status,
        pb.expected_budget,
        pb.timeline,
        pb.created_at,
        pb.custom_title,
        pb.project_id,
        pb.description,

        u.fullname,

        COALESCE(p.title, pb.custom_title) AS project_title,

        q.id AS quotation_id,
        q.is_locked,
        q.quoted_amount,
        q.delivery_timeline,
        q.quotation_html

      FROM project_bookings pb
      JOIN users2 u ON u.id = pb.user_id
      LEFT JOIN projects p ON p.id = pb.project_id
      LEFT JOIN project_quotations q ON q.booking_id = pb.id
      ORDER BY pb.created_at DESC
    `);

    res.render("admin/projects/bookings", {
      bookings: rows,
    });
  } catch (err) {
    console.error("❌ Error fetching project bookings:", err);
    res.status(500).send("Failed to load bookings");
  }
};

exports.updateProgress = async (req, res) => {
  const { booking_id, status } = req.body;

  await pool.query("UPDATE project_bookings SET status=$1 WHERE id=$2", [
    status,
    booking_id,
  ]);

  res.redirect("/admin/projects/bookings");
};

exports.sendQuotation = async (req, res) => {
  const { booking_id, quoted_amount, delivery_timeline, quotation_html } = req.body;

  // 🔍 Check if quotation exists
  const existing = await pool.query(
    `
    SELECT id, is_locked
    FROM project_quotations
    WHERE booking_id = $1
    `,
    [booking_id]
  );

  // 🔒 Block if already accepted
  if (existing.rows.length > 0 && existing.rows[0].is_locked) {
    return res.status(403).send("Quotation already accepted and locked");
  }

  if (existing.rows.length > 0) {
    // ✏️ UPDATE quotation (edit)
    await pool.query(
      `
      UPDATE project_quotations
      SET 
        quoted_amount = $2,
        delivery_timeline = $3,
        quotation_html = $4,
        updated_at = NOW()
      WHERE booking_id = $1
      `,
      [booking_id, quoted_amount, delivery_timeline, quotation_html]
    );
  } else {
    // 🆕 INSERT quotation (first time)
    await pool.query(
      `
      INSERT INTO project_quotations
      (booking_id, quoted_amount, delivery_timeline, quotation_html)
      VALUES ($1,$2,$3,$4)
      `,
      [booking_id, quoted_amount, delivery_timeline, quotation_html]
    );
  }

  // Update booking status
  await pool.query(
    "UPDATE project_bookings SET status='quoted' WHERE id=$1",
    [booking_id]
  );


  const userRes = await pool.query(
    `
  SELECT 
    u.email,
    u.fullname,
    COALESCE(p.title, pb.custom_title) AS project_title
  FROM project_bookings pb
  JOIN users2 u ON u.id = pb.user_id
  LEFT JOIN projects p ON p.id = pb.project_id
  WHERE pb.id = $1
  `,
    [booking_id]
  );

  if (userRes.rows.length === 0) {
    console.error("No user found for booking:", booking_id);
    return res.status(404).send("User not found for booking");
  }

  const user = userRes.rows[0];

  const viewLink = `${process.env.BASE_URL}/projects/quotation/${booking_id}`;

  await sendEmail(
    user.email,
    `Updated Quotation for ${user.project_title}`,
    quotationTemplate({
      fullname: user.fullname,
      project_title: user.project_title,
      amount: quoted_amount,
      timeline: delivery_timeline,
      company_name: "JKT Technologies Hub",
      view_link: viewLink
    }).html
  );

  await sendEmail(
    "jaykirchtechhub@gmail.com",
    `Updated Quotation for ${user.project_title}`,
    quotationTemplate({
      fullname: user.fullname,
      project_title: user.project_title,
      amount: quoted_amount,
      timeline: delivery_timeline,
      company_name: "JKT Technologies Hub",
      view_link: viewLink
      
    }).html
  );


  res.redirect("/admin/projects/bookings");
};

exports.createMilestone = async (req, res) => {
  const { booking_id, title, amount } = req.body;
  await pool.query(
    `INSERT INTO project_milestones (booking_id, title, amount)
     VALUES ($1,$2,$3)`,
    [booking_id, title, amount]
  );
  res.redirect("/admin/projects/bookings");
};
