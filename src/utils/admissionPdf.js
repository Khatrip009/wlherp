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
// Main PDF generation – full‑page letterhead background
// ---------------------------------------------------------------------------
export async function generateAdmissionPdf(studentId, options = {}) {
  const { format = "a4" } = options;   // 'a4' or 'a5'

  // ---------- 1. Organisation (only letterhead needed) ----------
  const { data: org } = await supabase
    .from("organization")
    .select("company_name, letterhead_url")
    .eq("id", 1)
    .single();

  const academyName = org?.company_name?.toUpperCase() || "SHREEVIDHYA ACADEMY";
  const letterheadUrl = org?.letterhead_url || null;

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

  // ---------- 6. Load images ----------
  let letterheadBase64 = null;
  if (letterheadUrl) {
    try {
      letterheadBase64 = await loadImageAsBase64(letterheadUrl);
    } catch (err) {
      console.warn("Letterhead could not be loaded for PDF", err);
    }
  }

  let photoBase64 = null;
  if (student.photo_url) {
    try {
      photoBase64 = await loadImageAsBase64(student.photo_url);
    } catch (err) {
      console.warn("Student photo could not be loaded for PDF", err);
    }
  }

  // ---------- 7. Page setup & margins ----------
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Margins – top margin leaves space for the letterhead header,
  // bottom margin leaves space for any pre‑printed footer.
  const topMargin = format === "a5" ? 38 : 48;
  const bottomMargin = format === "a5" ? 14 : 20;
  const sideMargin = format === "a5" ? 12 : 16;

  // ---------- 8. Helper to add letterhead background ----------
  const addLetterhead = () => {
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }
  };
  addLetterhead();   // first page

  let y = topMargin;

  // ---------- 9. Content ----------

  // --- Form Title ---
  doc.setFont("times", "bold");
  doc.setFontSize(20);
  doc.setTextColor("#0D47A1");
  doc.text("ADMISSION FORM", pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.setDrawColor("#0D47A1");
  doc.setLineWidth(0.6);
  doc.line(sideMargin, y, pageWidth - sideMargin, y);
  y += 8;

  // --- Student Photo (top right) ---
  if (photoBase64) {
    doc.addImage(photoBase64, "PNG", pageWidth - sideMargin - 25, y, 25, 25);
    doc.rect(pageWidth - sideMargin - 25, y, 25, 25);
  }

  // --- Student Information ---
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
      { content: label, styles: { fontStyle: "bold", fillColor: "#E3F2FD", textColor: "#0D47A1" } },
      value,
    ]),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: "auto" } },
    margin: { left: sideMargin, right: sideMargin + photoWidth },
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

      doc.setFont("times", "bold");
      doc.setFontSize(14);
      doc.setTextColor("#0D47A1");
      doc.text("PARENT / GUARDIAN DETAILS", sideMargin, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        body: parentRows.map(([label, value]) => [
          { content: label, styles: { fontStyle: "bold", fillColor: "#E3F2FD", textColor: "#0D47A1" } },
          value,
        ]),
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: "auto" } },
        margin: { left: sideMargin, right: sideMargin },
        showHead: false,
      });
      y = doc.lastAutoTable.finalY + 10;
    }
  }

  // --- New page for Batches, Fees, Rules ---
  doc.addPage();
  addLetterhead();   // letterhead on second page
  y = topMargin;

  // --- Enrolled Batches ---
  if (batches?.length) {
    doc.setFont("times", "bold");
    doc.setFontSize(15);
    doc.setTextColor("#0D47A1");
    doc.text("ENROLLED BATCHES", sideMargin, y);
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
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF", fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 50 }, 2: { cellWidth: 35 } },
      margin: { left: sideMargin, right: sideMargin },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // --- Fee Summary ---
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.setTextColor("#0D47A1");
  doc.text("FEE SUMMARY", sideMargin, y);
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
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF", fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 40 }, 2: { cellWidth: 40 }, 3: { cellWidth: 30 } },
    margin: { left: sideMargin },
  });
  y = doc.lastAutoTable.finalY + 12;

  // --- Rules & Regulations ---
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.setTextColor("#0D47A1");
  doc.text("RULES & REGULATIONS", sideMargin, y);
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
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#333");
  rules.forEach((rule, idx) => {
    doc.text(rule, sideMargin, y + idx * 5.5);
  });
  y += rules.length * 5.5 + 10;

  // --- Signature Section ---
  doc.setFont("times", "bold");
  doc.setFontSize(15);
  doc.setTextColor("#0D47A1");
  doc.text("SIGNATURES", sideMargin, y);
  y += 12;

  doc.setDrawColor("#0D47A1");
  doc.line(sideMargin, y, sideMargin + 60, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("AUTHORISED SIGNATORY", sideMargin + 30, y + 5, { align: "center" });

  doc.line(pageWidth - sideMargin - 60, y, pageWidth - sideMargin, y);
  doc.text("PARENT / GUARDIAN", pageWidth - sideMargin - 30, y + 5, { align: "center" });

  // ---------- 10. Save ----------
  doc.save(`Admission_${student.admission_no || studentId}.pdf`);
}