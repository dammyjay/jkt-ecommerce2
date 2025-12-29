const pool = require("../utils/db");
const cloudinary = require("../utils/cloudinary");
const html_to_pdf = require("html-pdf-node");

// LIST PROJECTS
exports.listProjects = async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM projects WHERE is_active=true"
  );
  res.render("projects/index", { projects: rows });
};

// PROJECT DETAILS
exports.projectDetails = async (req, res) => {
  const projectId = req.params.id;

  const project = await pool.query("SELECT * FROM projects WHERE id=$1", [
    projectId,
  ]);

  const images = await pool.query(
    "SELECT * FROM project_images WHERE project_id=$1",
    [projectId]
  );

  const videos = await pool.query(
    "SELECT * FROM project_videos WHERE project_id=$1",
    [projectId]
  );

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


// BOOK PROJECT
// exports.bookProject = async (req, res) => {
//   const { description, expected_budget, timeline } = req.body;
//   const projectId = req.params.id;
//   console.log("Session user:", req.session.user);


//   await pool.query(
//     `INSERT INTO project_bookings
//      (project_id, user_id, description, expected_budget, timeline)
//      VALUES ($1,$2,$3,$4,$5)`,
//     [projectId, req.session.user.id, description, expected_budget, timeline]
//   );

//   res.redirect("/dashboard/userProjects");
// };

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


  // LIST BOOKED PROJECTS FOR DASHBOARD
  exports.userProjects = async (req, res) => {
    const userId = req.session.user.id;

    const { rows } = await pool.query(
      `SELECT pb.*, p.title, p.thumbnail_image
      FROM project_bookings pb
      JOIN projects p ON pb.project_id = p.id
      WHERE pb.user_id = $1
      ORDER BY pb.created_at DESC`,
      [userId]
    );

    res.render("dashboard/userProjects", { bookings: rows });
  };


  exports.viewQuotation = async (req, res) => {
  const bookingId = req.params.id;
  const userId = req.session.user.id;

  const result = await pool.query(
    ` 
      SELECT 
      q.quoted_amount,
      q.delivery_timeline,
      q.quotation_html,
      p.title,
      pb.description,
      pb.status
      FROM project_bookings pb
      JOIN project_quotations q ON q.booking_id = pb.id
      JOIN projects p ON p.id = pb.project_id
      WHERE pb.id = $1 AND pb.user_id = $2
    `,
    [bookingId, userId]
  );

  if (result.rows.length === 0) {
    return res.redirect("/projects/dashboard/userProjects");
  }

  res.render("dashboard/viewQuotation", {
    quotation: result.rows[0],
    bookingId,
  });
};


// exports.downloadQuotation = async (req, res) => {
//   const bookingId = req.params.id;
//   const userId = req.session.user.id;

//   const result = await pool.query(
//     `
//     SELECT 
//       q.quotation_html,
//       p.title
//     FROM project_quotations q
//     JOIN project_bookings pb ON pb.id = q.booking_id
//     JOIN projects p ON p.id = pb.project_id
//     WHERE pb.id = $1 AND pb.user_id = $2
//     `,
//     [bookingId, userId]
//   );

//   if (result.rows.length === 0) {
//     return res.status(403).send("Access denied");
//   }

//   const quotation = result.rows[0];

//   const html = `
//     <html>
//       <head>
//         <style>
//           body { font-family: Arial; padding: 30px; }
//         </style>
//       </head>
//       <body>
//         <h2>${quotation.title} – Project Quotation</h2>
//         ${quotation.quotation_html}
//       </body>
//     </html>
//   `;

//   const file = { content: html };
//   const pdfBuffer = await html_to_pdf.generatePdf(file, { format: "A4" });

//   res.set({
//     "Content-Type": "application/pdf",
//     "Content-Disposition": `attachment; filename="quotation_${bookingId}.pdf"`
//   });

//   res.send(pdfBuffer);
// };


// exports.downloadQuotation = async (req, res) => {
//   const bookingId = req.params.id;
//   const userId = req.session.user.id;

//   const result = await pool.query(
//     `
//     SELECT q.quotation_file
//     FROM project_quotations q
//     JOIN project_bookings pb ON pb.id = q.booking_id
//     WHERE pb.id = $1 AND pb.user_id = $2
//     `,
//     [bookingId, userId]
//   );

//   if (result.rows.length === 0) {
//     return res.status(403).send("Access denied");
//   }

//   const publicId = result.rows[0].quotation_file;

//   const fileUrl = cloudinary.url(publicId, {
//     resource_type: "raw",
//     sign_url: true,
//   });

//   res.redirect(fileUrl);
// };


// ACCEPT QUOTATION

exports.downloadQuotation = async (req, res) => {
  const bookingId = req.params.id;
  const userId = req.session.user.id;

  const result = await pool.query(
    `
    SELECT 
      q.quotation_html,
      q.is_locked,
      p.title
    FROM project_quotations q
    JOIN project_bookings pb ON pb.id = q.booking_id
    JOIN projects p ON p.id = pb.project_id
    WHERE pb.id = $1 AND pb.user_id = $2
    `,
    [bookingId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(403).send("Access denied");
  }

  const quotation = result.rows[0];

  const html = `
  <html>
    <head>
      <style>
        body {
          font-family: Arial;
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

        .signature {
          margin-top: 40px;
        }

        .signature img {
          width: 160px;
        }
      </style>
    </head>

    <body>

      <div class="watermark">
        <img src="https://your-domain.com/logo.png" />
        <h1>JKT Technologies</h1>
      </div>

      <div class="content">
        <h2>${quotation.title} – Project Quotation</h2>

        ${quotation.quotation_html}

        <div class="footer">
          <hr>
          <p><strong>Company:</strong> JKT Technologies</p>
          <p><strong>Email:</strong> info@jkttech.com</p>

          <div class="signature">
            <p><strong>Authorized Signature</strong></p>
            <img src="https://your-domain.com/signature.png" />
            <p>Management</p>
          </div>
        </div>
      </div>

    </body>
  </html>
  `;

  const pdfBuffer = await html_to_pdf.generatePdf(
    { content: html },
    { format: "A4" }
  );

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="quotation_${bookingId}.pdf"`
  });

  res.send(pdfBuffer);
};


// exports.acceptQuotation = async (req, res) => {
//   const bookingId = req.params.id;

//   await pool.query(
//     `UPDATE project_bookings
//      SET status = 'accepted'
//      WHERE id = $1 AND user_id = $2`,
//     [bookingId, req.session.user.id]
//   );

//   res.redirect("/projects/dashboard/userProjects");

// };


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
