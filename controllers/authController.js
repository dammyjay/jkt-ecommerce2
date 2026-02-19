


// controllers/authController.js
const pool = require("../utils/db");
const bcrypt = require("bcryptjs");
const sendEmail = require("../utils/sendEmail");
const cloudinary = require("../utils/cloudinary");

const ADMIN_EMAIL = "admin@jkthub.com";
const ADMIN_PASSWORD = "admin123";

// ================== SIGNUP ==================
const signup = async (req, res) => {
  try {
    console.log("🟢 Signup request received");
    console.log("Body:", req.body);
    console.log("File:", req.file);

    const { fullname, email, password } = req.body;
    const file = req.file;

    if (!fullname || !email || !password) {
      console.log("❌ Missing required fields");
      return res
        .status(400)
        .json({
          message: "All fields are required (fullname, email, password).",
        });
    }

    const existingUser = await pool.query(
      "SELECT * FROM users2 WHERE email = $1",
      [email]
    );
    if (existingUser.rowCount > 0) {
      console.log("⚠️ Email already exists:", email);
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("🔐 Password hashed");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("📨 Generated OTP:", otp);

    let profileImage = null;
    if (file && file.path) {
      console.log("☁️ Uploading to Cloudinary...");
      const upload = await cloudinary.uploader.upload(file.path, {
        folder: "JKT-ecommerce/users",
      });
      profileImage = upload.secure_url;
      console.log("✅ Uploaded:", profileImage);
    }

    await pool.query(
      `INSERT INTO users2 (fullname, email, password, otp, role, profile_image)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [fullname, email, hashedPassword, otp, "user", profileImage]
    );

    console.log("✅ User inserted into DB");

    await sendEmail(
      email,
      "Verify Your JKT Hub Account",
      `<p>Your OTP code is <b>${otp}</b></p>`
    );
    console.log("📧 Email sent to:", email);

    res.status(200).json({ message: "OTP sent to your email." });
  } catch (error) {
    console.error("❌ Signup Error:", error);
    res.status(500).json({
      message: "Signup failed. Please try again.",
      error: error.message,
    });
  }
};


// ================== VERIFY OTP ==================

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await pool.query(
      "SELECT * FROM users2 WHERE email=$1 AND otp=$2",
      [email, otp]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    await pool.query(
      "UPDATE users2 SET is_verified=true, otp=NULL WHERE email=$1",
      [email]
    );

    res.json({ success: true, message: "Verification successful" });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while verifying OTP",
    });
  }
};



// ================== LOGIN ==================

// const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;


//     if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {

//       req.session.user = {
//         id: 0, // ✅ add this
//         fullname: "Admin",
//         email,
//         role: "admin"
//       };

//       const redirectUrl = req.session.returnTo || "/admin/dashboard";
//       delete req.session.returnTo;

//       return res.json({
//         success: true,
//         role: "admin",
//         redirectUrl
//       });
//     }



//     // 👤 Regular user
//     const result = await pool.query(
//       "SELECT * FROM users2 WHERE email=$1",
//       [email]
//     );

//     if (result.rowCount === 0) {
//       return res.status(401).json({
//         success: false,
//         message: "No user found"
//       });
//     }

//     const user = result.rows[0];
//     const validPassword = await bcrypt.compare(password, user.password);

//     if (!validPassword) {
//       return res.status(401).json({
//         success: false,
//         message: "Incorrect password"
//       });
//     }

//     // 🚨 Not verified → frontend opens OTP modal
//     if (!user.is_verified) {
//       return res.status(403).json({
//         needsVerification: true,
//         email: user.email
//       });
//     }


//     // ✅ Verified user
//     req.session.user = {
//       id: user.id,
//       fullname: user.fullname,
//       email: user.email,
//       role: user.role,
//       phone: user.phone,
//       address: user.address,
//       city: user.city,
//       state: user.state,
//       profile_image: user.profile_image
//     };

//     // Get saved return URL
//     const redirectUrl = req.session.returnTo || "/";
//     delete req.session.returnTo;

//     return res.json({
//       success: true,
//       role: user.role,
//       redirectUrl
//     });


//   } catch (error) {
//     console.error("Login Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Login failed, please try again"
//     });
//   }
// };

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    /* =====================================================
       🔐 ADMIN LOGIN
    ====================================================== */
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {

      req.session.user = {
        id: 0,
        fullname: "Admin",
        email,
        role: "admin"
      };

      const redirectUrl = req.session.returnTo || "/admin/dashboard";
      // delete req.session.returnTo;

      return req.session.save(err => {
        if (err) {
          console.error("Session Save Error:", err);
          return res.status(500).json({
            success: false,
            message: "Login failed"
          });
        }

        return res.json({
          success: true,
          role: "admin",
          redirectUrl
        });
      });
    }

    /* =====================================================
       👤 REGULAR USER LOGIN
    ====================================================== */
    const result = await pool.query(
      "SELECT * FROM users2 WHERE email=$1",
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "No user found"
      });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password"
      });
    }

    // 🚨 If user not verified
    if (!user.is_verified) {
      return res.status(403).json({
        needsVerification: true,
        email: user.email
      });
    }

    /* =====================================================
       ✅ VERIFIED USER
    ====================================================== */
    req.session.user = {
      id: user.id,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      city: user.city,
      state: user.state,
      profile_image: user.profile_image
    };

    const redirectUrl = req.session.returnTo || "/";
    delete req.session.returnTo;

    return req.session.save(err => {
      if (err) {
        console.error("Session Save Error:", err);
        return res.status(500).json({
          success: false,
          message: "Login failed"
        });
      }

      return res.json({
        success: true,
        role: user.role,
        redirectUrl
      });
    });

  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed, please try again"
    });
  }
};



// ================== LOGOUT ==================
const logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
};

// ✅ Export all functions
module.exports = { signup, verifyOtp, login, logout };
