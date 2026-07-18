import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Helper: load image as base64 ──────────────────────────
async function loadImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Could not load image:", err);
    return null;
  }
}

// ─── Helper: get status colour ─────────────────────────────
function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case "approved": return "#2E7D32";
    case "rejected": return "#C62828";
    case "pending": return "#ED6C02";
    default: return "#666";
  }
}

// ─── Helper: format date ──────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

// ─── Helper: calculate days between two dates ────────────
function calculateDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// ─── Main PDF generator ──────────────────────────────────
export async function generateLeaveApplicationPdf(leaveRecord, teacher, org, options = {}) {
  const { autoPrint = false } = options;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  let y = 12;

  // ── Load organisation logo ──
  let logoBase64 = null;
  if (org?.logo_dark_url) {
    logoBase64 = await loadImageAsBase64(org.logo_dark_url);
  }

  // ── Letterhead background ──
  if (org?.letterhead_url) {
    const letterheadBase64 = await loadImageAsBase64(org.letterhead_url);
    if (letterheadBase64) {
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    }
  }

  const primaryColor = "#0D47A1";

  // ── Header (if no letterhead) ──────────────────────────────────
  if (!org?.letterhead_url) {
    if (logoBase64) {
      doc.addImage(logoBase64, "PNG", margin, y, 40, 16);
    }
    const textX = logoBase64 ? margin + 44 : margin;
    const textY = y + 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(primaryColor);
    doc.text(org?.company_name || "ShreeVidhya Academy", textX, textY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor("#555");
    let detailY = textY + 5;
    if (org?.address) {
      const addrLines = doc.splitTextToSize(org.address, pageWidth - textX - margin - 10);
      doc.text(addrLines, textX, detailY);
      detailY += addrLines.length * 4 + 1;
    }
    if (org?.phone) {
      doc.text(`Phone: ${org.phone}`, textX, detailY);
      detailY += 4.5;
    }
    if (org?.email) {
      doc.text(`Email: ${org.email}`, textX, detailY);
      detailY += 4.5;
    }
    if (org?.gstin) {
      doc.text(`GSTIN: ${org.gstin}`, textX, detailY);
    }

    const headerHeight = Math.max(logoBase64 ? 20 : 0, detailY - textY + 6);
    y += headerHeight + 6;
    doc.setDrawColor(primaryColor);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
  } else {
    // With letterhead, start lower
    y = 38;
  }

  // ── Status badge ─────────────────────────────────────────────
  const statusText = leaveRecord.status?.toUpperCase() || "PENDING";
  const statusColor = getStatusColor(leaveRecord.status);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(statusColor);
  doc.text(`STATUS: ${statusText}`, pageWidth - margin, y, { align: "right" });
  y += 8;

  // ── Sender details ──────────────────────────────────────────
  const teacherName = `${teacher?.first_name || ""} ${teacher?.last_name || ""}`.trim() || "N/A";
  const empCode = teacher?.employee_code || "";
  const mobile = teacher?.mobile || "";
  const email = teacher?.email || "";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#333");
  doc.text(`From:`, margin, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text(teacherName, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  if (empCode) doc.text(`Employee Code: ${empCode}`, margin, y);
  if (mobile) doc.text(`Mobile: ${mobile}`, margin + 60, y);
  y += 5;
  if (email) doc.text(`Email: ${email}`, margin, y);
  y += 8;

  // ── Date ────────────────────────────────────────────────────
  const applicationDate = leaveRecord.created_at ? formatDate(leaveRecord.created_at) : formatDate(new Date());
  doc.text(`Date: ${applicationDate}`, pageWidth - margin, y, { align: "right" });
  y += 10;

  // ── To: (Recipient) ─────────────────────────────────────────
  const branchName = org?.branches?.find(b => b.id === leaveRecord.branch_id)?.branch_name || "";
  doc.setFont("helvetica", "normal");
  doc.text(`To,`, margin, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text(`The Branch Manager`, margin, y);
  y += 5;
  doc.text(`${branchName || "Branch"}`, margin, y);
  y += 5;
  doc.text(`${org?.company_name || "Academy"}`, margin, y);
  y += 10;

  // ── Subject ──────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.text(`Subject: Leave Application`, margin, y);
  y += 8;

  // ── Salutation ──────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.text(`Respected Sir/Madam,`, margin, y);
  y += 8;

  // ── Body ────────────────────────────────────────────────────
  const startDate = formatDate(leaveRecord.start_date);
  const endDate = formatDate(leaveRecord.end_date);
  const days = calculateDays(leaveRecord.start_date, leaveRecord.end_date);
  const reason = leaveRecord.reason || "Not specified";

  const bodyLines = [
    `I, ${teacherName} (${empCode}), am writing to request leave from ${startDate} to ${endDate} (${days} day${days > 1 ? "s" : ""}).`,
    `Reason: ${reason}.`,
    `I kindly request you to grant me leave for the mentioned period.`,
    `I will ensure that my pending tasks are handed over properly before the leave.`,
  ];

  doc.setFont("helvetica", "normal");
  bodyLines.forEach((line, i) => {
    const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 5 + 2;
  });
  y += 4;

  // ── Admin remarks (if any) ──────────────────────────────────
  if (leaveRecord.admin_remarks) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor("#666");
    doc.text(`Admin Remarks: ${leaveRecord.admin_remarks}`, margin, y);
    y += 8;
    doc.setTextColor("#333");
    doc.setFont("helvetica", "normal");
  }

  // ── Request for approval ────────────────────────────────────
  doc.text(`I request you to kindly approve my leave application.`, margin, y);
  y += 8;
  doc.text(`Thanking you,`, margin, y);
  y += 8;

  // ── Signature ───────────────────────────────────────────────
  const sigY = y;
  doc.setFont("helvetica", "bold");
  doc.text(`Yours sincerely,`, margin, sigY);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.text(`( ${teacherName} )`, margin, y);
  y += 4;
  doc.text(`Signature: ________________________`, margin, y);
  y += 10;

  // ── For office use ──────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryColor);
  doc.text("FOR OFFICE USE", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#333");
  doc.text(`Status: ${statusText}`, margin, y);
  y += 5;
  doc.text(`Approved / Rejected by: ________________________`, margin, y);
  y += 5;
  doc.text(`Date: ____________`, margin, y);

  // ── Footer ──────────────────────────────────────────────────
  const footerY = pageHeight - 12;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor("#999");
  const dateStr = new Date().toLocaleString();
  doc.text(`Generated on ${dateStr}`, margin, footerY);
  doc.text(`© ${org?.company_name || "Academy"}`, pageWidth / 2, footerY, { align: "center" });

  // ── Auto print ──────────────────────────────────────────────
  if (autoPrint) {
    doc.autoPrint();
  }

  return doc;
}