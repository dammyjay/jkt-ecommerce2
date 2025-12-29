const fs = require("fs");
const path = require("path");

exports.generateInvoice = ({ invoiceNo, fullname, items, total }) => {
  const content = `
INVOICE #: ${invoiceNo}

Customer: ${fullname}

Items:
${items.map((i) => `- ${i.title}: ₦${i.amount}`).join("\n")}

Total: ₦${total}
`;

  const filePath = path.join(__dirname, `../invoices/${invoiceNo}.txt`);
  fs.writeFileSync(filePath, content);

  return filePath;
};
