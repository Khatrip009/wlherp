// src/utils/teacherResumePdf.js
import { jsPDF } from "jspdf";
import { supabase } from "../api/supabase";

// ─── Helpers ────────────────────────────────────────────────────────────────
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

export async function generateTeacherResumePdf(teacherId, options = {}) {
  const { org, branch, theme } = options;

  // ── Use context values (with fallbacks) ──
  const primaryColor = theme?.primary_color || "#0D47A1";
  const fontBody = theme?.font_body || "helvetica";
  const companyName = org?.company_name || "ShreeVidhya Academy";
  const letterheadUrl = org?.letterhead_url || null;
  const orgAddress = org?.address || "";
  const orgPhone = org?.phone || "";
  const orgEmail = org?.email || "";

  // 1. Teacher base record
  const { data: teacher, error: teacherError } = await supabase
    .from("teachers")
    .select("*")
    .eq("id", teacherId)
    .single();
  if (teacherError) throw teacherError;
  if (!teacher) throw new Error("Teacher not found");

  // 2. Mediums (via junction)
  const { data: mediumLinks } = await supabase
    .from("teacher_mediums")
    .select("mediums(name)")
    .eq("teacher_id", teacherId);
  const mediums = mediumLinks?.map(l => l.mediums?.name).filter(Boolean) || [];

  // 3. Courses (via junction)
  const { data: courseLinks } = await supabase
    .from("teacher_courses")
    .select("courses(course_name)")
    .eq("teacher_id", teacherId);
  const courses = courseLinks?.map(l => l.courses?.course_name).filter(Boolean) || [];

  // 4. Subjects (via junction)
  const { data: subjectLinks } = await supabase
    .from("teacher_subjects")
    .select("subjects(subject_name)")
    .eq("teacher_id", teacherId);
  const subjects = subjectLinks?.map(l => l.subjects?.subject_name).filter(Boolean) || [];

  // Load letterhead as base64 (from context)
  let letterheadBase64 = null;
  if (letterheadUrl) {
    try {
      letterheadBase64 = await loadImageAsBase64(letterheadUrl);
    } catch (e) {
      console.warn("Letterhead could not be loaded for resume PDF", e);
    }
  }

  // 5. Batches (active assignments)
  const { data: batchAssignments } = await supabase
    .from("batch_teachers")
    .select(`
      batch_id,
      subjects(subject_name),
      batches(batch_name, start_time, end_time, days, courses(course_name))
    `)
    .eq("teacher_id", teacherId);

  const batchMap = new Map();
  (batchAssignments || []).forEach(b => {
    const bid = b.batch_id;
    if (!batchMap.has(bid)) {
      batchMap.set(bid, {
        name: b.batches?.batch_name || "Unnamed Batch",
        course: b.batches?.courses?.course_name || "",
        schedule: `${b.batches?.start_time || "?"} – ${b.batches?.end_time || "?"}  |  ${b.batches?.days || ""}`,
        subjects: [],
      });
    }
    const entry = batchMap.get(bid);
    if (b.subjects?.subject_name) entry.subjects.push(b.subjects.subject_name);
  });
  const batchList = Array.from(batchMap.values());

  // ─── PDF Setup ────────────────────────────────────────────────────────────
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();   // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm

  // Margins & layout constants
  const leftColWidth = 52;
  const marginLeft = 6;
  const marginRight = 6;
  const mainLeft = leftColWidth + 4;
  const mainWidth = pageWidth - mainLeft - marginRight;
  const topMargin = 85;   // space for letterhead header in right content area

  // Draw full-page letterhead background (behind everything)
  if (letterheadBase64) {
    doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
  }

  // ── LEFT SIDEBAR (solid primary color, hides letterhead in that area) ────
  doc.setFillColor(primaryColor);
  doc.rect(0, 0, leftColWidth, pageHeight, "F");

  let yLeft = 20;

  // Teacher Name (in sidebar)
  doc.setFont(fontBody, "bold");
  doc.setFontSize(14);
  doc.setTextColor("#FFFFFF");
  const fullName = `${teacher.first_name} ${teacher.last_name}`;
  const nameLines = doc.splitTextToSize(fullName, leftColWidth - 8);
  doc.text(nameLines, marginLeft + 2, yLeft);
  yLeft += nameLines.length * 7 + 4;

  // Title
  doc.setFont(fontBody, "normal");
  doc.setFontSize(9);
  doc.setTextColor("#B3D4FF");
  doc.text("TEACHER", marginLeft + 2, yLeft);
  yLeft += 10;

  // Small line
  doc.setDrawColor("#FFFFFF");
  doc.setLineWidth(0.3);
  doc.line(marginLeft + 2, yLeft, leftColWidth - 4, yLeft);
  yLeft += 6;

  // Contact details
  const addLeftItem = (icon, text, yStart) => {
    doc.setFont(fontBody, "normal");
    doc.setFontSize(8);
    doc.setTextColor("#E3F2FD");
    const lines = doc.splitTextToSize(text, leftColWidth - 12);
    doc.text(lines, marginLeft + 6, yStart);
    return yStart + lines.length * 4 + 3;
  };

  yLeft = addLeftItem("📞", teacher.mobile || "—", yLeft);
  if (teacher.email) yLeft = addLeftItem("✉️", teacher.email, yLeft);
  yLeft = addLeftItem("📍", orgAddress || "—", yLeft);
  yLeft += 4;

  // Mediums section
  doc.setFont(fontBody, "bold");
  doc.setFontSize(9);
  doc.setTextColor("#FFFFFF");
  doc.text("MEDIUMS", marginLeft + 2, yLeft);
  yLeft += 5;
  doc.setFont(fontBody, "normal");
  doc.setFontSize(8);
  doc.setTextColor("#E3F2FD");
  if (mediums.length) {
    mediums.forEach(m => {
      doc.text(`• ${m}`, marginLeft + 6, yLeft);
      yLeft += 4.5;
    });
  } else {
    doc.text("—", marginLeft + 6, yLeft);
    yLeft += 5;
  }
  yLeft += 4;

  // Courses section
  doc.setFont(fontBody, "bold");
  doc.setFontSize(9);
  doc.setTextColor("#FFFFFF");
  doc.text("COURSES", marginLeft + 2, yLeft);
  yLeft += 5;
  doc.setFont(fontBody, "normal");
  doc.setFontSize(8);
  doc.setTextColor("#E3F2FD");
  if (courses.length) {
    courses.forEach(c => {
      doc.text(`• ${c}`, marginLeft + 6, yLeft);
      yLeft += 4.5;
    });
  } else {
    doc.text("—", marginLeft + 6, yLeft);
    yLeft += 5;
  }
  yLeft += 4;

  // Subjects section
  doc.setFont(fontBody, "bold");
  doc.setFontSize(9);
  doc.setTextColor("#FFFFFF");
  doc.text("SUBJECTS", marginLeft + 2, yLeft);
  yLeft += 5;
  doc.setFont(fontBody, "normal");
  doc.setFontSize(8);
  doc.setTextColor("#E3F2FD");
  if (subjects.length) {
    subjects.forEach(s => {
      doc.text(`• ${s}`, marginLeft + 6, yLeft);
      yLeft += 4.5;
    });
  } else {
    doc.text("—", marginLeft + 6, yLeft);
    yLeft += 5;
  }

  // ── MAIN CONTENT (Right side, starts below letterhead header) ──────────────
  let yMain = topMargin + 10;  // 95mm

  // Professional Summary
  doc.setFont(fontBody, "bold");
  doc.setFontSize(16);
  doc.setTextColor(primaryColor);
  doc.text("PROFESSIONAL SUMMARY", mainLeft, yMain);
  yMain += 8;

  doc.setDrawColor(primaryColor);
  doc.setLineWidth(0.5);
  doc.line(mainLeft, yMain, mainLeft + mainWidth - 2, yMain);
  yMain += 6;

  const summaryText = `Dedicated educator with ${batchList.length ? "experience teaching " + batchList.map(b => b.name).join(", ") : "a passion for teaching"} at ${companyName}. ${teacher.qualification ? "Holds " + teacher.qualification + ". " : ""}Skilled in classroom management, student engagement, and curriculum delivery.`;
  const summaryLines = doc.splitTextToSize(summaryText, mainWidth - 4);
  doc.setFont(fontBody, "normal");
  doc.setFontSize(10);
  doc.setTextColor("#333");
  doc.text(summaryLines, mainLeft, yMain);
  yMain += summaryLines.length * 5 + 8;

  // Teaching Experience
  doc.setFont(fontBody, "bold");
  doc.setFontSize(16);
  doc.setTextColor(primaryColor);
  doc.text("TEACHING EXPERIENCE", mainLeft, yMain);
  yMain += 8;

  doc.setDrawColor(primaryColor);
  doc.setLineWidth(0.5);
  doc.line(mainLeft, yMain, mainLeft + mainWidth - 2, yMain);
  yMain += 6;

  if (batchList.length === 0) {
    doc.setFont(fontBody, "normal");
    doc.setFontSize(10);
    doc.setTextColor("#333");
    doc.text("No active batches assigned.", mainLeft, yMain);
    yMain += 8;
  } else {
    batchList.forEach(batch => {
      doc.setFont(fontBody, "bold");
      doc.setFontSize(11);
      doc.setTextColor(primaryColor);
      doc.text(`${batch.name}  (${batch.course})`, mainLeft, yMain);
      yMain += 6;

      doc.setFont(fontBody, "normal");
      doc.setFontSize(9);
      doc.setTextColor("#666");
      doc.text(`Schedule: ${batch.schedule}`, mainLeft + 6, yMain);
      yMain += 5;

      if (batch.subjects.length) {
        doc.text(`Subjects: ${batch.subjects.join(", ")}`, mainLeft + 6, yMain);
        yMain += 5;
      }
      yMain += 3;
    });
  }

  // Additional Details
  yMain += 6;
  doc.setFont(fontBody, "bold");
  doc.setFontSize(16);
  doc.setTextColor(primaryColor);
  doc.text("ADDITIONAL DETAILS", mainLeft, yMain);
  yMain += 8;

  doc.setDrawColor(primaryColor);
  doc.setLineWidth(0.5);
  doc.line(mainLeft, yMain, mainLeft + mainWidth - 2, yMain);
  yMain += 6;

  const details = [
    ["Employee Code", teacher.employee_code || "—"],
    ["Qualification", teacher.qualification || "—"],
    ["Joining Date", teacher.joining_date || "—"],
    ["Monthly Salary", teacher.salary ? `₹ ${Number(teacher.salary).toLocaleString("en-IN")}` : "—"],
    ["Status", teacher.status ? teacher.status.charAt(0).toUpperCase() + teacher.status.slice(1) : "—"],
  ];

  details.forEach(([label, value]) => {
    doc.setFont(fontBody, "bold");
    doc.setFontSize(9);
    doc.setTextColor("#333");
    doc.text(`${label}:`, mainLeft, yMain);
    doc.setFont(fontBody, "normal");
    doc.text(value, mainLeft + 38, yMain);
    yMain += 6;
  });

  // ── Page numbers (discreet) ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont(fontBody, "normal");
    doc.setFontSize(7);
    doc.setTextColor("#aaa");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 10, pageHeight - 8, { align: "right" });
  }

  doc.save(`Resume_${teacher.employee_code || teacherId}.pdf`);
}