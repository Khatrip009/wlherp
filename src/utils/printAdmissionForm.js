// src/utils/admissionPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";

// ---------------------------------------------------------------------------
// Helper: load an image from a URL and return a base64 data URL
// ---------------------------------------------------------------------------
async function loadImageAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load image: ${url}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Main PDF generation
// ---------------------------------------------------------------------------
export async function generateAdmissionPdf(studentId, options = {}) {
  const { format = "a4", theme = {}, orgId = 3 } = options;

  // ── Theme colors ───────────────────────────────────────────────────
  const primaryColor = theme.primary_color || "#0D47A1";
  const accentColor = theme.accent_color || "#FF1070";
  const fontHeading = theme.font_heading || "times";
  const fontBody = theme.font_body || "helvetica";

  // ---------- 1. Organisation details (no letterhead) ----------
  const { data: org } = await supabase
    .from("organization")
    .select("*")
    .eq("id", orgId)
    .single();

  const orgName = org?.company_name || "ShreeVidhya Academy";
  const orgAddress = org?.address || "";
  const orgPhone = org?.phone || "";
  const orgEmail = org?.email || "";
  const orgGstin = org?.gstin || "";
  const orgWebsite = org?.website || "";
  const logoUrl = org?.logo_dark_url || null;

  // ---------- 2. Student data ----------
  const { data: student } = await supabase
    .from("students")
    .select("*, mediums(name)")
    .eq("id", studentId)
    .single();
  if (!student) throw new Error("Student not found");

  const mediumName = student.mediums?.name || "";

  // ---------- 3. Parents ----------
  const { data: parentLinks } = await supabase
    .from("student_parents")
    .select("parent_id, relation, parents(*)")
    .eq("student_id", studentId);
  const parents = parentLinks?.map((l) => l.parents) || [];

  // ---------- 4. Enrolled batches ----------
  const { data: batches } = await supabase
    .from("student_batches")
    .select(`batch_id, enrollment_date, batches(course_id, courses(course_name), batch_name)`)
    .eq("student_id", studentId)
    .eq("status", "active");

  // ---------- 5. Fee summary ----------
  const { data: fees } = await supabase
    .from("student_fees")
    .select("id, final_fee, status, fee_structures(fee_amount)")
    .eq("student_id", studentId);

  let totalFee = 0;
  let paidAmount = 0;
  if (fees) {
    for (const f of fees) {
      totalFee += Number(f.final_fee);
      const { data: payments } = await supabase
        .from("fee_payments")
        .select("amount")
        .eq("student_fee_id", f.id);
      paidAmount += payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    }
  }
  const pendingAmount = totalFee - paidAmount;

  // ---------- 6. Load logo ----------
  let logoBase64 = null;
  if (logoUrl) {
    try {
      logoBase64 = await loadImageAsBase64(logoUrl);
    } catch (err) {
      console.warn("Logo could not be loaded for PDF", err);
    }
  }

  // Load student photo
  let photoBase64 = null;
  if (student.photo_url) {
    try {
      photoBase64 = await loadImageAsBase64(student.photo_url);
    } catch (err) {
      console.warn("Student photo could not be loaded for PDF", err);
    }
  }

  // ---------- 7. Page setup ----------
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;

  let y = margin;

  // ---------- 8. Draw header (same style as invoice) ----------
  const logoWidth = 36;
  const logoHeight = 14;

  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y, logoWidth, logoHeight);
  }

  const textX = margin + (logoBase64 ? logoWidth + 6 : 0);
  const textY = y + 2;

  doc.setFont(fontHeading, "bold");
  doc.setFontSize(16);
  doc.setTextColor(primaryColor);
  doc.text(orgName, textX, textY);

  doc.setFont(fontBody, "normal");
  doc.setFontSize(8);
  doc.setTextColor("#000");
  let detailY = textY + 5;

  if (orgAddress) {
    const addrLines = doc.splitTextToSize(orgAddress, pageWidth - textX - margin - 10);
    doc.text(addrLines, textX, detailY);
    detailY += addrLines.length * 4 + 1;
  }
  if (orgGstin) {
    doc.text(`GSTIN: ${orgGstin}`, textX, detailY);
    detailY += 4.5;
  }
  if (orgPhone) {
    doc.text(`Phone: ${orgPhone}`, textX, detailY);
    detailY += 4.5;
  }
  if (orgEmail) {
    doc.text(`Email: ${orgEmail}`, textX, detailY);
    detailY += 4.5;
  }
  if (orgWebsite) {
    doc.text(`Web: ${orgWebsite}`, textX, detailY);
    detailY += 4.5;
  }

  const headerHeight = Math.max(logoHeight + 6, detailY - textY + 8);
  y += headerHeight + 4;

  // Separator line
  doc.setDrawColor(primaryColor);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ---------- 9. Form Title ----------
  doc.setFont(fontHeading, "bold");
  doc.setFontSize(20);
  doc.setTextColor(primaryColor);
  doc.text("ADMISSION FORM", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setDrawColor(primaryColor);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // --- Student Photo (top right) ---
  if (photoBase64) {
    doc.addImage(photoBase64, "PNG", pageWidth - margin - 25, y, 25, 25);
    doc.rect(pageWidth - margin - 25, y, 25, 25);
  }

  // --- Student Information Table ---
  const infoRows = [
    ["Admission No", student.admission_no?.toUpperCase() || "-"],
    ["Name", `${student.first_name?.toUpperCase()} ${student.last_name?.toUpperCase()}`],
    ["Gender", student.gender?.toUpperCase() || "-"],
    ["Date of Birth", student.dob || "-"],
    ["Mobile", student.mobile],
    ["WhatsApp", student.whatsapp || "-"],
    ["Email", student.email || "-"],
    ["Address", `${student.address?.toUpperCase() || ""}, ${student.city?.toUpperCase() || ""}, ${student.state?.toUpperCase() || ""} ${student.pincode || ""}`],
    ["School", student.school_name?.toUpperCase() || "-"],
    ["Board", student.board?.toUpperCase() || "-"],
    ["Standard", student.standard?.toUpperCase() || "-"],
    ["Joining Date", student.joining_date || "-"],
    ["Status", student.status?.toUpperCase() || "-"],
  ];
  if (mediumName) infoRows.push(["Medium", mediumName.toUpperCase()]);

  const photoWidth = photoBase64 ? 30 : 0;

  autoTable(doc, {
    startY: y,
    body: infoRows.map(([label, value]) => [
      { content: label, styles: { fontStyle: "bold", fillColor: "#E3F2FD", textColor: primaryColor } },
      value,
    ]),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2, font: fontBody },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: "auto" } },
    margin: { left: margin, right: margin + photoWidth },
  });
  y = doc.lastAutoTable.finalY + 10;

  // --- Parent Details ---
  if (parents.length > 0) {
    for (const p of parents) {
      const parentRows = [
        ["Father Name", p.father_name?.toUpperCase() || "-"],
        ["Mother Name", p.mother_name?.toUpperCase() || "-"],
        ["Mobile", p.mobile || "-"],
        ["WhatsApp", p.whatsapp || "-"],
        ["Email", p.email || "-"],
        ["Occupation", p.occupation?.toUpperCase() || "-"],
        ["Address", p.address?.toUpperCase() || "-"],
      ];

      // Ensure space for parent section header + at least a few rows
      if (y + 15 > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }

      doc.setFont(fontHeading, "bold");
      doc.setFontSize(14);
      doc.setTextColor(primaryColor);
      doc.text("PARENT / GUARDIAN DETAILS", margin, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        body: parentRows.map(([label, value]) => [
          { content: label, styles: { fontStyle: "bold", fillColor: "#E3F2FD", textColor: primaryColor } },
          value,
        ]),
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 2, font: fontBody },
        columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: "auto" } },
        margin: { left: margin, right: margin },
        showHead: false,
      });
      y = doc.lastAutoTable.finalY + 10;
    }
  }

  // --- Batches, Fees, Rules (new page if needed) ---
  if (y > pageHeight - margin - 60) {
    doc.addPage();
    y = margin;
  }

  // --- Enrolled Batches ---
  if (batches?.length) {
    doc.setFont(fontHeading, "bold");
    doc.setFontSize(15);
    doc.setTextColor(primaryColor);
    doc.text("ENROLLED BATCHES", margin, y);
    y += 7;

    const batchBody = batches.map((b) => [
      b.batches?.batch_name?.toUpperCase() || "-",
      b.batches?.courses?.course_name?.toUpperCase() || "-",
      b.enrollment_date || "-",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["BATCH NAME", "COURSE", "ENROLLMENT DATE"]],
      body: batchBody,
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 3, font: fontBody },
      headStyles: { fillColor: primaryColor, textColor: "#FFFFFF", fontStyle: "bold", font: fontHeading },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 50 }, 2: { cellWidth: 35 } },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // --- Fee Summary ---
  if (y + 30 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }

  doc.setFont(fontHeading, "bold");
  doc.setFontSize(15);
  doc.setTextColor(primaryColor);
  doc.text("FEE SUMMARY", margin, y);
  y += 7;

  autoTable(doc, {
    startY: y,
    head: [["TOTAL FEE", "PAID", "PENDING", "STATUS"]],
    body: [[
      `Rs. ${totalFee.toLocaleString()}`,
      `Rs. ${paidAmount.toLocaleString()}`,
      `Rs. ${pendingAmount.toLocaleString()}`,
      pendingAmount <= 0 ? "PAID" : "PENDING",
    ]],
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 3, font: fontBody },
    headStyles: { fillColor: primaryColor, textColor: "#FFFFFF", fontStyle: "bold", font: fontHeading },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 40 }, 2: { cellWidth: 40 }, 3: { cellWidth: 30 } },
    margin: { left: margin },
  });
  y = doc.lastAutoTable.finalY + 12;

  // --- Rules & Regulations ---
  if (y + 50 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }

  doc.setFont(fontHeading, "bold");
  doc.setFontSize(15);
  doc.setTextColor(primaryColor);
  doc.text("RULES & REGULATIONS", margin, y);
  y += 7;

  const rules = [
    "1. Minimum 75% attendance is mandatory to appear in exams.",
    "2. Fees must be paid on or before the 10th of every month.",
    "3. Mobile phones are strictly prohibited inside classrooms.",
    "4. Students must wear the prescribed uniform and carry ID card.",
    "5. Disciplinary action will be taken for any misconduct.",
    "6. Parents must attend parent-teacher meetings regularly.",
    "7. Any damage to institute property will be charged accordingly.",
    "8. The institute reserves the right to amend these rules at any time.",
  ];

  doc.setFont(fontBody, "normal");
  doc.setFontSize(9);
  doc.setTextColor("#333");

  rules.forEach((rule, idx) => {
    if (y + 5 > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(rule, margin, y);
    y += 5.5;
  });
  y += 5;

  // --- Signature Section ---
  if (y + 25 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }

  doc.setFont(fontHeading, "bold");
  doc.setFontSize(15);
  doc.setTextColor(primaryColor);
  doc.text("SIGNATURES", margin, y);
  y += 12;

  doc.setDrawColor(primaryColor);
  doc.line(margin, y, margin + 60, y);
  doc.setFont(fontBody, "normal");
  doc.setFontSize(9);
  doc.text("AUTHORISED SIGNATORY", margin + 30, y + 5, { align: "center" });

  doc.line(pageWidth - margin - 60, y, pageWidth - margin, y);
  doc.text("PARENT / GUARDIAN", pageWidth - margin - 30, y + 5, { align: "center" });

  // ---------- 10. Save ----------
  doc.save(`Admission_${student.admission_no || studentId}.pdf`);
}