// src/utils/teacherAttendancePdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

async function loadImage(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateTeacherAttendancePDF(
  data,
  monthLabel,
  options = {}          // { org, branch, theme }
) {
  const { org, branch } = options;

  const companyName = org?.company_name || "ShreeVidhya Academy";
  const orgAddress = org?.address || "";
  const phone = org?.phone || "";
  const email = org?.email || "";
  const gstin = org?.gstin || "";
  const logoUrl = org?.logo_dark_url || org?.logo_light_url || null;

  const branchName = branch?.branch_name || "";
  const branchAddress = branch?.address || "";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 14;

  // Load logo
  let logoBase64 = null;
  if (logoUrl) {
    logoBase64 = await loadImage(logoUrl);
  }

  // ── HEADER (all black) ────────────────────────────
  let y = margin;
  const logoWidth = 30;
  const logoHeight = 12;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
  }

  const textX = logoBase64 ? margin + logoWidth + 4 : margin;
  const textY = y + 1;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor("#000000");
  doc.text(companyName, textX, textY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor("#000000");
  let detailY = textY + 4.5;

  if (orgAddress) {
    const addrLines = doc.splitTextToSize(orgAddress, pageWidth - textX - margin - 10);
    doc.text(addrLines, textX, detailY);
    detailY += addrLines.length * 3.5 + 1;
  }

  if (branchName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor("#000000");
    doc.text(`Branch: ${branchName}`, textX, detailY);
    detailY += 3.5;
    if (branchAddress) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor("#000000");
      const brAddrLines = doc.splitTextToSize(branchAddress, pageWidth - textX - margin - 10);
      doc.text(brAddrLines, textX, detailY);
      detailY += brAddrLines.length * 3.5 + 1;
    }
  }

  if (phone || email || gstin) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    let infoLine = "";
    if (phone) infoLine += `Phone: ${phone}`;
    if (email) infoLine += `  |  Email: ${email}`;
    if (gstin) infoLine += `  |  GSTIN: ${gstin}`;
    doc.text(infoLine, textX, detailY);
    detailY += 3.5;
  }

  const headerHeight = Math.max(logoHeight + 2, detailY - textY + 4);
  y += headerHeight + 4;

  // Divider line (black)
  doc.setDrawColor("#000000");
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ── Title ──────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor("#000000");
  doc.text("Teacher Attendance Report", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor("#000000");
  doc.text(`Month: ${monthLabel}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  if (!data.length) {
    const footerY = pageHeight - margin - 5;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor("#000000");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${companyName}`, pageWidth - margin, footerY, { align: "right" });
    return doc;
  }

  const daysInMonth = data[0].days.length;

  // Build table headers
  const headers = ["Teacher", "Code"];
  for (let d = 1; d <= daysInMonth; d++) headers.push(String(d));

  // Build rows
  const rows = data.map((teacher) => {
    const row = [teacher.name, teacher.employee_code];
    teacher.days.forEach((day) => {
      row.push(
        day.status === "present" ? "P" :
        day.status === "absent" ? "A" :
        day.status === "leave" ? "L" :
        day.status === "half_day" ? "H" : "—"
      );
    });
    return row;
  });

  // Dynamic column widths
  const colStyles = {
    0: { cellWidth: 45, halign: "left" },
    1: { cellWidth: 18, halign: "center" },
  };
  const fixedWidth = 45 + 18;
  const remainingWidth = pageWidth - 2 * margin - fixedWidth;
  const dayColWidth = Math.min(8, Math.floor(remainingWidth / daysInMonth));
  for (let d = 0; d < daysInMonth; d++) {
    colStyles[2 + d] = { cellWidth: dayColWidth, halign: "center" };
  }

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: 1.5,
      textColor: [0, 0, 0],
      fillColor: [255, 255, 255],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontSize: 8,
      fontStyle: "bold",
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
    },
    columnStyles: colStyles,
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      const footerY = pageHeight - margin - 5;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.setTextColor("#000000");
      doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
      doc.text(`© ${companyName}`, pageWidth - margin, footerY, { align: "right" });
    },
  });

  // Footers on all pages (black)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - margin - 5;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor("#000000");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${companyName}`, pageWidth - margin, footerY, { align: "right" });

    doc.setFontSize(7);
    doc.setTextColor("#000000");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  doc.save(`Teacher_Attendance_${monthLabel.replace(/\s+/g, "_")}.pdf`);
}