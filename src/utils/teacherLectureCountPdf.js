// src/utils/teacherLectureCountPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Helper: load an image from a URL and return base64
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

export async function generateTeacherLectureCountPDF(
  dailyData,
  teacherName,
  monthLabel,
  totalLectures,
  options = {}                // { org, branch, theme }
) {
  const { org, branch, theme } = options;

  // ── Organisation & styling ─────────────────────────
  const companyName = org?.company_name || "ShreeVidhya Academy";
  const orgAddress = org?.address || "";
  const phone = org?.phone || "";
  const email = org?.email || "";
  const gstin = org?.gstin || "";
  const logoUrl = org?.logo_dark_url || org?.logo_light_url || null;

  const branchName = branch?.branch_name || "";
  const branchAddress = branch?.address || "";

  const primaryColor = theme?.primary_color || "#0D47A1";
  const fontBody = theme?.font_body || "helvetica";

  // A4 Portrait
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 14;

  // Load logo
  let logoBase64 = null;
  if (logoUrl) {
    logoBase64 = await loadImage(logoUrl);
  }

  // ── HEADER ────────────────────────────────────────
  let y = margin;
  const logoWidth = 30;
  const logoHeight = 12;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
  }

  const textX = logoBase64 ? margin + logoWidth + 4 : margin;
  const textY = y + 1;
  doc.setFont(fontBody, "bold");
  doc.setFontSize(14);
  doc.setTextColor(primaryColor);
  doc.text(companyName, textX, textY);

  doc.setFont(fontBody, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor("#555");
  let detailY = textY + 4.5;

  // Org address
  if (orgAddress) {
    const addrLines = doc.splitTextToSize(orgAddress, pageWidth - textX - margin - 10);
    doc.text(addrLines, textX, detailY);
    detailY += addrLines.length * 3.5 + 1;
  }

  // Branch info
  if (branchName) {
    doc.setFont(fontBody, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(primaryColor);
    doc.text(`Branch: ${branchName}`, textX, detailY);
    detailY += 3.5;
    if (branchAddress) {
      doc.setFont(fontBody, "normal");
      doc.setFontSize(7);
      doc.setTextColor("#555");
      const brAddrLines = doc.splitTextToSize(branchAddress, pageWidth - textX - margin - 10);
      doc.text(brAddrLines, textX, detailY);
      detailY += brAddrLines.length * 3.5 + 1;
    }
  }

  // Contact / GSTIN line
  if (phone || email || gstin) {
    doc.setFont(fontBody, "normal");
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

  // Divider line
  doc.setDrawColor(primaryColor);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ── Title ──────────────────────────────────────────
  doc.setFont(fontBody, "bold");
  doc.setFontSize(16);
  doc.setTextColor(primaryColor);
  doc.text("Teacher Lecture Count Report", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFont(fontBody, "normal");
  doc.setFontSize(11);
  doc.setTextColor("#333");
  doc.text(`Teacher: ${teacherName}  |  Month: ${monthLabel}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  // ── Daily breakdown table ──
  if (dailyData.length > 0) {
    const headers = ["Date", "Lectures"];
    const rows = dailyData.map((d) => [d.date, d.count]);

    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows,
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 3, halign: "center" },
      headStyles: {
        fillColor: primaryColor,
        textColor: "#FFFFFF",
        fontSize: 10,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 60, halign: "left" },
        1: { cellWidth: 40 },
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        // Footer on every new page
        const footerY = pageHeight - margin - 5;
        doc.setFont(fontBody, "italic");
        doc.setFontSize(6);
        doc.setTextColor("#999");
        doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
        doc.text(`© ${companyName}`, pageWidth - margin, footerY, { align: "right" });
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Monthly total ──────────────────────────────────
  doc.setFontSize(14);
  doc.setFont(fontBody, "bold");
  doc.setTextColor(primaryColor);
  doc.text(`Total Lectures in ${monthLabel}: ${totalLectures}`, margin, y);
  y += 8;

  // ── Footer on all pages ────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - margin - 5;
    doc.setFont(fontBody, "italic");
    doc.setFontSize(6);
    doc.setTextColor("#999");
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, footerY);
    doc.text(`© ${companyName}`, pageWidth - margin, footerY, { align: "right" });

    // Optional: page numbers
    doc.setFontSize(7);
    doc.setTextColor("#aaa");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  // Save
  doc.save(`Lecture_Count_${teacherName}_${monthLabel.replace(/\s+/g, "_")}.pdf`);
}