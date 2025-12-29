// import brevo from "brevo";
// import dotenv from "dotenv";
// dotenv.config();

// export const sendEmail = async (to, subject, htmlContent) => {
//   try {
//     const client = new brevo.TransactionalEmailsApi();
//     client.setApiKey(
//       brevo.TransactionalEmailsApiApiKeys.apiKey,
//       process.env.BREVO_API_KEY
//     );

//     const email = {
//       sender: { email: process.env.BREVO_SENDER_EMAIL, name: "E-Commerce App" },
//       to: [{ email: to }],
//       subject,
//       htmlContent,
//     };

//     await client.sendTransacEmail(email);
//     console.log("📧 Email sent successfully to", to);
//   } catch (error) {
//     console.error("❌ Error sending email:", error);
//   }
// };


// utils/sendEmail.js
const Brevo = require("@getbrevo/brevo");

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

async function sendEmail(to, subject, htmlContent) {
  try {
    const sendSmtpEmail = {
      to: [{ email: to }],
      sender: { email: process.env.BREVO_FROM, name: "JKT Hub" },
      subject,
      htmlContent,
    };

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("✅ Email sent:", data.messageId || data);
    return data;
  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    throw error;
  }
}

module.exports = sendEmail;
