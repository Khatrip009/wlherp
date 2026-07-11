// src/utils/dailyTeacherAttendancePdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../api/supabase";

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

export async function generateDailyTeacherAttendancePDF(data, startDate, endDate, org = {}) {
  // Fetch organisation (for letterhead) if not already provided
  let letterheadUrl = org?.letterhead_url || null;
  let academyName = org?.company_name || "ShreeVidhya Academy";

  if (!letterheadUrl) {
    const { data: orgData } = await supabase
      .from("organization")
      .select("company_name, letterhead_url")
      .eq("id", 1)
      .single();
    if (orgData) {
      letterheadUrl = orgData.letterhead_url;
      academyName = orgData.company_name || academyName;
    }
  }

  // Load letterhead as base64
  let letterheadBase64 = null;
  if (letterheadUrl) {
    try {
      letterheadBase64 = await loadImage(letterheadUrl);
    } catch (e) {
      console.warn("Letterhead could not be loaded for daily attendance PDF", e);
    }
  }

  // A4 Portrait
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 16;
  const topMargin = 85;   // consistent with other A4 reports

  // Add full‑page letterhead background on every page
  const addLetterhead = () => {
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }
  };
  addLetterhead();   // first page

  let y = topMargin;

  // ── Report Title ──
  doc.setFont("times", "bold");
  doc.setFontSize(22);
  doc.setTextColor("#0D47A1");
  doc.text("Teacher Daily Attendance Report", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor("#333");
  doc.text(`Period: ${startDate} to ${endDate}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  if (!data.length) {
    // Save empty file (or just return doc)
    return doc;
  }

  // Build table
  const headers = ["Date", "Teacher", "Code", "Status"];
  const rows = data.map((r) => [
    r.date,
    r.teacher_name,
    r.employee_code,
    r.status === "present" ? "Present" :
    r.status === "absent" ? "Absent" :
    r.status === "leave" ? "Leave" :
    r.status === "half_day" ? "Half Day" : "—",
  ]);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3, halign: "center" },
    headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF", fontSize: 10, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 30, halign: "left" },
      1: { cellWidth: 60, halign: "left" },
      2: { cellWidth: 25 },
      3: { cellWidth: 35 },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      // Add letterhead on every new page
      addLetterhead();
      // Tiny page number
      const pgNum = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setTextColor("#aaa");
      doc.text(`Page ${pgNum}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    },
  });

  // Ensure page numbers on all pages (if the table didn't overflow, we still need them)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor("#aaa");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  // Save
  doc.save(`Daily_Teacher_Attendance_${startDate}_to_${endDate}.pdf`);
}