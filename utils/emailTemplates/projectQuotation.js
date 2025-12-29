module.exports = ({
  fullname,
  project_title,
  amount,
  timeline,
  company_name,
}) => {
  return {
    subject: `Project Quotation – ${project_title}`,
    html: `
      <p>Hello ${fullname},</p>

      <p>Thank you for your interest in our project.</p>

      <p><strong>Project:</strong> ${project_title}</p>
      <p><strong>Quoted Amount:</strong> ₦${amount}</p>
      <p><strong>Delivery Timeline:</strong> ${timeline}</p>

      <p>
        You can review and approve the quotation by logging into your dashboard.
      </p>

      <p>
        Best regards,<br/>
        <strong>${company_name}</strong>
      </p>
    `,
  };
};
