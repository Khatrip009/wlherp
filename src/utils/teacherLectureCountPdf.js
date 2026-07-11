// src/utils/teacherLectureCountPdf.js
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

export async function generateTeacherLectureCountPDF(
  dailyData,
  teacherName,
  monthLabel,
  totalLectures,
  org = {}
) {
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
      console.warn("Letterhead could not be loaded for lecture count PDF", e);
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
  doc.text("Teacher Lecture Count Report", pageWidth / 2, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
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
      headStyles: { fillColor: "#0D47A1", textColor: "#FFFFFF", fontSize: 10, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 60, halign: "left" },
        1: { cellWidth: 40 },
      },
      margin: { left: margin, right: margin },
      didDrawPage: () => {
        // Add letterhead on any overflow page
        addLetterhead();
        // Tiny page number
        const pgNum = doc.internal.getCurrentPageInfo().pageNumber;
        doc.setFontSize(7);
        doc.setTextColor("#aaa");
        doc.text(`Page ${pgNum}`, pageWidth - margin, pageHeight - 8, { align: "right" });
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Monthly total ──
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#0D47A1");
  doc.text(`Total Lectures in ${monthLabel}: ${totalLectures}`, margin, y);
  y += 8;

  // ── Page numbers (no footer branding) ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor("#aaa");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  // Save
  doc.save(`Lecture_Count_${teacherName}_${monthLabel.replace(/\s+/g, "_")}.pdf`);
}