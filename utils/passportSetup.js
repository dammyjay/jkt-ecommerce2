const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const pool = require("./db");

// ================= SERIALIZE & DESERIALIZE =================
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// passport.deserializeUser(async (id, done) => {
//   try {
//     const result = await pool.query("SELECT * FROM users2 WHERE id = $1", [id]);
//     done(null, result.rows[0]);
//   } catch (err) {
//     done(err, null);
//   }
// });

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query(
      "SELECT * FROM users2 WHERE id = $1",
      [id]
    );

    if (!result.rows.length) {
      return done(null, false); // 🔴 prevents crash
    }

    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
});


// ================= GOOGLE STRATEGY =================
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // callbackURL: "/auth/google/callback",
      callbackURL: process.env.GOOGLE_CALLBACK_URL

    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const photo = profile.photos?.[0]?.value || null;

        let result = await pool.query("SELECT * FROM users2 WHERE email = $1", [
          email,
        ]);
        if (result.rowCount === 0) {
          const insert = await pool.query(
            "INSERT INTO users2 (fullname, email, profile_image, is_verified) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, email, photo, true]
          );
          return done(null, insert.rows[0]);
        } else {
          // Update profile image if changed or previously empty
          await pool.query(
            "UPDATE users2 SET profile_image = $1 WHERE email = $2",
            [photo, email]
          );
          return done(null, result.rows[0]);
        }
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// ================= FACEBOOK STRATEGY =================
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: "/auth/facebook/callback",
      profileFields: ["id", "displayName", "emails", "photos"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails
          ? profile.emails[0].value
          : `${profile.id}@facebook.com`;
        const name = profile.displayName;
        const photo = profile.photos?.[0]?.value || null;

        let result = await pool.query("SELECT * FROM users2 WHERE email = $1", [
          email,
        ]);
        if (result.rowCount === 0) {
          const insert = await pool.query(
            "INSERT INTO users2 (fullname, email, profile_image, is_verified) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, email, photo, true]
          );
          return done(null, insert.rows[0]);
        } else {
          await pool.query(
            "UPDATE users2 SET profile_image = $1 WHERE email = $2",
            [photo, email]
          );
          return done(null, result.rows[0]);
        }
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// ================= LINKEDIN STRATEGY =================
passport.use(
  new LinkedInStrategy(
    {
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL: "/auth/linkedin/callback",
      scope: ["r_emailaddress", "r_liteprofile"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;
        const photo = profile.photos?.[0]?.value || null;

        let result = await pool.query("SELECT * FROM users2 WHERE email = $1", [
          email,
        ]);
        if (result.rowCount === 0) {
          const insert = await pool.query(
            "INSERT INTO users2 (fullname, email, profile_image, is_verified) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, email, photo, true]
          );
          return done(null, insert.rows[0]);
        } else {
          await pool.query(
            "UPDATE users2 SET profile_image = $1 WHERE email = $2",
            [photo, email]
          );
          return done(null, result.rows[0]);
        }
      } catch (err) {
        done(err, null);
      }
    }
  )
);

module.exports = passport;
