const pool = require("../utils/db");
const cloudinary = require("../utils/cloudinary");
const html_to_pdf = require("html-pdf-node");
const puppeteer = require("puppeteer");


// LIST PROJECTS
exports.listProjects = async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM projects WHERE is_active=true"
  );
  res.render("projects/index", { projects: rows });
};

exports.projectDetails = async (req, res) => {
  const projectId = req.params.id;

  if (isNaN(projectId)) {
    return res.status(400).send("Invalid project ID");
  }

  const project = await pool.query("SELECT * FROM projects WHERE id=$1", [projectId]);
  const images = await pool.query("SELECT * FROM project_images WHERE project_id=$1", [projectId]);
  const videos = await pool.query("SELECT * FROM project_videos WHERE project_id=$1", [projectId]);

  res.render("projects/details", {
    project: project.rows[0],
    images: images.rows,
    videos: videos.rows,
  });
};


exports.showBookingForm = async (req, res) => {
  const projectId = req.params.id;

  const { rows } = await pool.query(
    "SELECT * FROM projects WHERE id = $1",
    [projectId]
  );

  res.render("projects/book", {
    project: rows[0]
  });
};

exports.showCustomBookingForm = (req, res) => {
  // Render the form to book a brand new project
  res.render("projects/bookCustom");
};

exports.bookCustomProject = async (req, res) => {
  try {
    const userId = req.session.user.id; // use session user
    const { custom_title, description, expected_budget, timeline } = req.body;

    await pool.query(
      `INSERT INTO project_bookings
       (user_id, custom_title, description, expected_budget, timeline, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [userId, custom_title, description, expected_budget || null, timeline || null]
    );

    res.redirect("/projects/dashboard/userProjects");
  } catch (err) {
    console.error("Custom project booking error:", err);
    res.status(500).send("Server error");
  }
};


  exports.bookProject = async (req, res) => {
    try {
      if (!req.session.user || !req.session.user.id) {
        return res.redirect("/login");
      }

      const { description, expected_budget, timeline } = req.body;
      const projectId = req.params.id;
      const userId = req.session.user.id;

      // 🔍 Confirm user exists
      const userCheck = await pool.query(
        "SELECT id FROM users2 WHERE id = $1",
        [userId]
      );

      if (userCheck.rowCount === 0) {
        return res.status(400).send("Invalid user account");
      }

      await pool.query(
        `INSERT INTO project_bookings
        (project_id, user_id, description, expected_budget, timeline)
        VALUES ($1,$2,$3,$4,$5)`,
        [projectId, userId, description, expected_budget, timeline]
      );

      res.redirect("/projects/dashboard/userProjects");

    } catch (err) {
      console.error("❌ Booking error:", err);
      res.status(500).send("Server error");
    }
  };


exports.userProjects = async (req, res) => {
  const userId = req.session.user.id;

  const { rows } = await pool.query(
    `SELECT pb.*, 
            COALESCE(p.title, pb.custom_title) AS project_title,
            p.thumbnail_image
     FROM project_bookings pb
     LEFT JOIN projects p ON pb.project_id = p.id
     WHERE pb.user_id = $1
     ORDER BY pb.created_at DESC`,
    [userId]
  );

  res.render("dashboard/userProjects", { bookings: rows });
};


// exports.viewQuotation = async (req, res) => {
//   const bookingId = req.params.id;
//   const userId = req.session.user.id;

//   const result = await pool.query(
//     `
//     SELECT
//       q.*,
//       pb.status AS booking_status,
//       COALESCE(p.title, pb.custom_title) AS project_title
//     FROM project_quotations q
//     JOIN project_bookings pb ON pb.id = q.booking_id
//     LEFT JOIN projects p ON p.id = pb.project_id
//     WHERE pb.id = $1
//       AND pb.user_id = $2
//     `,
//     [bookingId, userId]
//   );

//   if (result.rows.length === 0) {
//     return res.status(404).send("Quotation not found");
//   }

//   res.render("dashboard/viewQuotation", {
//     quotation: result.rows[0],
//     bookingId
//   });
// };

exports.viewQuotation = async (req, res) => {
  const bookingId = req.params.id;

  // Check if logged in
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const userId = req.session.user.id;
  const userRole = req.session.user.role; // admin or user

  const result = await pool.query(
    `
    SELECT 
      pq.*,
      pb.user_id,
      pb.status AS booking_status,
      COALESCE(p.title, pb.custom_title) AS title
    FROM project_quotations pq
    JOIN project_bookings pb ON pb.id = pq.booking_id
    LEFT JOIN projects p ON p.id = pb.project_id
    WHERE pq.booking_id = $1
    `,
    [bookingId]
  );

  if (result.rows.length === 0) {
    return res.status(404).send("Quotation not found");
  }

  const quotation = result.rows[0];

  // 🔒 SECURITY CHECK
  if (quotation.user_id !== userId && userRole !== "admin") {
    return res.status(403).send("Access denied");
  }

  res.render("viewQuotation", {
    quotation,
    bookingId
  });
};


exports.downloadQuotation = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.session.user.id;

    const result = await pool.query(
      `
      SELECT q.quotation_html,
             COALESCE(p.title, pb.custom_title) AS title
      FROM project_quotations q
      JOIN project_bookings pb ON pb.id = q.booking_id
      LEFT JOIN projects p ON p.id = pb.project_id
      WHERE pb.id = $1 AND pb.user_id = $2
      `,
      [bookingId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).send("Access denied");
    }

    const quotation = result.rows[0];

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: Calibri, sans-serif;
              padding: 40px;
              position: relative;
            }

            /* WATERMARK */
            .watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              opacity: 0.07;
              text-align: center;
              z-index: 0;
            }

            .watermark img {
              width: 300px;
            }

            .watermark h1 {
              font-size: 42px;
              margin-top: 10px;
            }

            .content {
              position: relative;
              z-index: 2;
            }

            .footer {
              margin-top: 80px;
            }

            .signature img {
              width: 160px;
            }
          </style>
        </head>

        <body>
          <div class="watermark">
            <img src="https://shopify.jkthub.com/images/JKT logo.png" />
            <h1>JKT Hub Shopify</h1>
          </div>

          <div class="content">
            <h2>${quotation.title} – Project Quotation</h2>
            ${quotation.quotation_html}

            <div class="footer">
              <hr>
              <p><strong>Company:</strong> JKT Hub Shopify</p>
              <p><strong>Email:</strong> Jaykirchtechhub@gmail.com</p>

              <div class="signature">
                <p><strong>Authorized Signature</strong></p>
                <img src="https://shopify.jkthub.com/images/JKT logo.png" />
                <p>Management</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${quotation.title} documentation.pdf"`,
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).send("Failed to generate PDF");
  }
};


exports.acceptQuotation = async (req, res) => {
  const bookingId = req.params.id;
  const userId = req.session.user.id;

  await pool.query(
    `
    UPDATE project_bookings
    SET status = 'accepted'
    WHERE id = $1 AND user_id = $2
    `,
    [bookingId, userId]
  );

  await pool.query(
    `
    UPDATE project_quotations
    SET is_locked = TRUE
    WHERE booking_id = $1
    `,
    [bookingId]
  );

  const quotationRes = await pool.query(
  `
  SELECT quoted_amount
  FROM project_quotations
  WHERE booking_id = $1
  `,
  [bookingId]
);

const total = quotationRes.rows[0].quoted_amount;

await pool.query(
  `
  INSERT INTO project_milestones (booking_id, title, amount)
  VALUES
  ($1,'Initial Payment (30%)',$2),
  ($1,'Mid Project Payment (40%)',$3),
  ($1,'Final Delivery (30%)',$4)
  `,
  [
    bookingId,
    total * 0.3,
    total * 0.4,
    total * 0.3
  ]
);

  res.redirect("/projects/dashboard/userProjects");
};
