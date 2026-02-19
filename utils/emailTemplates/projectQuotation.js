// module.exports = ({
//   fullname,
//   project_title,
//   amount,
//   timeline,
//   company_name,
// }) => {
//   return {
//     subject: `Project Quotation – ${project_title}`,
//     html: `
//       <p>Hello <strong>${fullname}</strong>,</p>

//       <p>Thank you for your interest in our project.</p>

//       <p><strong>Project:</strong> ${project_title}</p>
//       <p><strong>Quoted Amount:</strong> ₦${amount}</p>
//       <p><strong>Delivery Timeline:</strong> ${timeline}</p>

//       <hr>

//       <p>You can view your quotation here:</p>
//       <p>
//         <a href="{{view_link}}">
//           View Quotation
//         </a>
//       </p>


//       <p>
//         You can review and approve the quotation by logging into your dashboard.
//       </p>
//       <img src="https://shopify.jkthub.com/images/JKT%20logo%20bg.png" alt="Quotation Image" style="width:100%; max-width:600px; margin:20px 0;" />
//       <p>
//         Best regards,<br/>
//         <strong>${company_name}</strong>
//         <a href="https://shopify.jkthub.com" style="display:inline-block; margin-top:10px; padding:10px 20px; background-color:#007BFF; color:#fff; text-decoration:none; border-radius:5px;">Visit Our Website</a>
//         <a href= "mailto:jaykirchtechhub@gmail.com" style="display:inline-block; margin-top:10px; padding:10px 20px; background-color:#28a745; color:#fff; text-decoration:none; border-radius:5px;">Contact Us</a>
//       </p>
//     `,
//   };
// };




module.exports = ({
  fullname,
  project_title,
  amount,
  timeline,
  company_name,
  view_link   // ✅ add this
}) => {
  return {
    subject: `Project Quotation – ${project_title}`,
    html: `
      <p>Hello <strong>${fullname}</strong>,</p>

      <p>Thank you for your interest in our project.</p>

      <p><strong>Project:</strong> ${project_title}</p>
      <p><strong>Quoted Amount:</strong> ₦${amount}</p>
      <p><strong>Delivery Timeline:</strong> ${timeline}</p>

      <hr>

      <p>You can view your quotation here:</p>

      <p>
        <a href="${view_link}">
          View Quotation
        </a>
      </p>

      <p>
        You can review and approve the quotation by logging into your dashboard.
      </p>

      <img src="https://shopify.jkthub.com/images/JKT%20logo%20bg.png"
           style="width:100%; max-width:600px; margin:20px 0;" />

      <p>
        Best regards,<br/>
        <strong>${company_name}</strong>
      </p>
    `,
  };
};

