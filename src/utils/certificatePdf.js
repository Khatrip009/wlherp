// src/utils/certificatePdf.js
import { jsPDF } from "jspdf";
import { supabase } from "../api/supabase";

// Helper: load an image from a URL and return a base64 data URL
async function loadImageAsBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateCertificatePdf(certificate) {
  // 1. Fetch organisation details (including letterhead)
  const { data: org } = await supabase
    .from("organization")
    .select("company_name, letterhead_url")
    .eq("id", 1)
    .single();

  const academyName = org?.company_name || "ShreeVidhya Academy";
  const letterheadUrl = org?.letterhead_url || null;

  // Load letterhead as base64
  let letterheadBase64 = null;
  if (letterheadUrl) {
    try {
      letterheadBase64 = await loadImageAsBase64(letterheadUrl);
    } catch (err) {
      console.warn("Letterhead could not be loaded for certificate PDF", err);
    }
  }

  // 2. Create PDF in landscape A4
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 297 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
  const margin = 15;
  const topMargin = 60;   // push content below the letterhead header

  // ---------- Add full‑page letterhead background ----------
  if (letterheadBase64) {
    doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
  }

  let y = topMargin;

  // ---- Outer decorative border (double line) ----
  doc.setDrawColor("#0D47A1");
  doc.setLineWidth(1.5);
  doc.rect(margin, margin, pageWidth - 2 * margin, pageHeight - 2 * margin);
  doc.setLineWidth(0.3);
  doc.rect(margin + 2, margin + 2, pageWidth - 2 * margin - 4, pageHeight - 2 * margin - 4);

  // ---- Subtitle (no logo or academy name – letterhead covers that) ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.setTextColor("#444");
  doc.text("Certificate of Completion", pageWidth / 2, y, { align: "center" });
  y += 12;

  // ---- Decorative line ----
  doc.setDrawColor("#0D47A1");
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 60, y, pageWidth / 2 + 60, y);
  y += 12;

  // ---- Certificate body text ----
  doc.setFont("times", "normal");
  doc.setFontSize(15);
  doc.setTextColor("#333");
  doc.text("This is to certify that", pageWidth / 2, y, { align: "center" });
  y += 12;

  // ---- Student name (large, bold, serif) ----
  doc.setFont("times", "bold");
  doc.setFontSize(32);
  doc.setTextColor("#0D47A1");
  const studentName = `${certificate.students?.first_name} ${certificate.students?.last_name}`;
  doc.text(studentName, pageWidth / 2, y, { align: "center" });
  y += 14;

  // ---- Course completion text ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor("#333");
  doc.text("has successfully completed the course", pageWidth / 2, y, { align: "center" });
  y += 12;

  // ---- Course name ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor("#0D47A1");
  const courseName = certificate.courses?.course_name || "";
  const courseLines = doc.splitTextToSize(courseName, pageWidth - 2 * margin - 40);
  doc.text(courseLines, pageWidth / 2, y, { align: "center" });
  y += courseLines.length * 9 + 6;

  // ---- Level (if present) ----
  if (certificate.course_levels?.level_name) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor("#555");
    doc.text(`Level: ${certificate.course_levels.level_name}`, pageWidth / 2, y, { align: "center" });
    y += 12;
  }

  // ---- Issue date and certificate number (two columns) ----
  y += 6;
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.setTextColor("#666");
  doc.text(`Issue Date: ${certificate.issue_date}`, margin + 20, y);
  doc.text(`Certificate No: ${certificate.certificate_no}`, pageWidth - margin - 20, y, { align: "right" });
  y += 18;

  // ---- Signature lines ----
  doc.setDrawColor("#0D47A1");
  doc.setLineWidth(0.5);
  // Left signature
  doc.line(margin + 30, y, margin + 80, y);
  // Right signature
  doc.line(pageWidth - margin - 80, y, pageWidth - margin - 30, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#666");
  doc.text("Authorized Signatory", margin + 55, y, { align: "center" });
  doc.text("Student", pageWidth - margin - 55, y, { align: "center" });
  y += 14;

  // ---- Seal (circle with text, centred bottom) ----
  const sealCenterY = pageHeight - margin - 14;
  doc.setDrawColor("#0D47A1");
  doc.setLineWidth(0.8);
  doc.circle(pageWidth / 2, sealCenterY, 10);
  doc.setFontSize(6);
  doc.setTextColor("#0D47A1");
  doc.text("SHREEVIDHYA", pageWidth / 2, sealCenterY - 3, { align: "center" });
  doc.text("ACADEMY", pageWidth / 2, sealCenterY + 1, { align: "center" });
  doc.setFontSize(7);
  doc.text("SEAL", pageWidth / 2, sealCenterY + 5, { align: "center" });

  // ---- Footer (no extra text, letterhead footer is enough) ----
  // (We can omit the computer‑generated line; the letterhead handles branding.)

  // Save
  doc.save(`Certificate_${certificate.certificate_no}.pdf`);
}