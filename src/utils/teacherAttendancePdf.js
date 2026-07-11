// src/utils/teacherAttendancePdf.js
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

export async function generateTeacherAttendancePDF(data, monthLabel, org = {}) {
  // Fetch organisation (for letterhead)
  const { data: orgData } = await supabase
    .from("organization")
    .select("company_name, letterhead_url")
    .eq("id", 1)
    .single();

  const academyName = orgData?.company_name || org?.company_name || "ShreeVidhya Academy";
  const letterheadUrl = orgData?.letterhead_url || org?.letterhead_url || null;

  // Load letterhead as base64
  let letterheadBase64 = null;
  if (letterheadUrl) {
    try {
      letterheadBase64 = await loadImage(letterheadUrl);
    } catch (e) {
      console.warn("Letterhead could not be loaded for attendance PDF", e);
    }
  }

  // A4 Portrait
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 14;
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
  doc.text("Teacher Attendance Report", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor("#333");
  doc.text(`Month: ${monthLabel}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  if (!data.length) return doc;

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

  // Calculate dynamic column styles to fit the portrait width
  const colStyles = {
    0: { cellWidth: 45, halign: "left" },   // Teacher name
    1: { cellWidth: 18, halign: "center" }, // Code
  };
  // Remaining space for day columns
  const fixedWidth = 45 + 18; // 63 mm
  const remainingWidth = pageWidth - 2 * margin - fixedWidth;
  const dayColWidth = Math.min(8, Math.floor(remainingWidth / daysInMonth)); // max 8mm per day
  for (let d = 0; d < daysInMonth; d++) {
    colStyles[2 + d] = { cellWidth: dayColWidth, halign: "center" };
  }

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5, halign: "center" },
    headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF", fontSize: 8, fontStyle: "bold" },
    columnStyles: colStyles,
    margin: { left: margin, right: margin },
    didDrawPage: (pageData) => {
      // Add letterhead on every new page created by autoTable
      addLetterhead();
      // Optional: tiny page number
      const pgNum = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setTextColor("#aaa");
      doc.text(`Page ${pgNum}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    },
  });

  // Final page numbers on all pages (if table didn't overflow, we still need page numbers)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor("#aaa");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  // Save
  doc.save(`Teacher_Attendance_${monthLabel.replace(/\s+/g, "_")}.pdf`);
}