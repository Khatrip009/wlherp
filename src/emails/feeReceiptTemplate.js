export function feeReceiptTemplate({
  studentName,
  receiptNo,
  amount,
  paymentDate,
  paymentMode,
  transactionNo,
  balanceDue,
  academyName,
}) {
  return `
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
      <div style="background:#0D47A1;padding:20px;text-align:center;">
        <h2 style="color:#fff;margin:0;">${academyName}</h2>
        <p style="color:#B3D4FF;margin:5px 0 0;">Fee Payment Receipt</p>
      </div>
      <div style="padding:20px;border:1px solid #ddd;">
        <p>Dear <strong>${studentName}</strong>,</p>
        <p>We have received your fee payment. Here are the details:</p>
        <table style="width:100%;border-collapse:collapse;margin:15px 0;">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Receipt No</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${receiptNo}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Amount</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">₹ ${amount}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Payment Date</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${paymentDate}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Payment Mode</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${paymentMode}</td></tr>
          ${transactionNo ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Transaction No</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${transactionNo}</td></tr>` : ""}
          ${balanceDue > 0 ? `<tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Balance Due</strong></td><td style="padding:8px;border-bottom:1px solid #eee;color:#c62828;">₹ ${balanceDue}</td></tr>` : ""}
        </table>
        <p>Thank you,<br>${academyName}</p>
      </div>
    </div>
  `;
}