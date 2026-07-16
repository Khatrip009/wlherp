import { jsPDF } from "jspdf";
import { supabase } from "../api/supabase";

// ─── Helper: load image as base64 ──────────────────────────
async function loadImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load image: ${url}`);
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

/**
 * Generate a professional ID card (3.5 × 2.2 inches / 88.9 × 55.88 mm)
 * with theme‑based styling and auto‑scaled logo.
 */
export async function generateIdCard({ type, id, org, theme = {}, academyName }) {
  // ── Theme colours & fonts ──────────────────────────────
  const primaryColor = theme?.primary_color || "#0D47A1";
  const primaryLight = theme?.primary_light_color || "#1565C0";
  const primaryDark = theme?.primary_dark_color || "#0A3478";
  const accentColor = theme?.accent_color || "#D15839";
  const fontHeading = theme?.font_heading || "helvetica";
  const fontBody = theme?.font_body || "helvetica";

  // ── Organisation details ────────────────────────────────
  let orgData = org;
  if (!orgData) {
    const { data } = await supabase
      .from("organization")
      .select("logo_light_url, company_name, address, phone, email")
      .eq("id", 3)
      .single();
    orgData = data || {};
  }

  const logoUrl = orgData?.logo_light_url || "/ShreeVidhyaDark.png";
  const companyName = academyName || orgData?.company_name || "ShreeVidhya Academy";
  const orgAddress = orgData?.address || "";
  const orgPhone = orgData?.phone || "";
  const orgEmail = orgData?.email || "";

  const logoBase64 = await loadImageAsBase64(logoUrl).catch(() => null);

  // ── Fetch person data ─────────────────────────────────────
  let person,
    photoBase64 = null,
    parentInfo = null;

  if (type === "student") {
    const { data: student } = await supabase
      .from("students")
      .select("admission_no, first_name, last_name, standard, school_name, mobile, address, joining_date, photo_url")
      .eq("id", id)
      .single();
    if (!student) throw new Error("Student not found");

    const studentAddress = student.address || "";
    const joiningDate = student.joining_date || "";

    person = {
      idNo: student.admission_no,
      name: `${student.first_name} ${student.last_name}`,
      role: "Student",
      lines: [
        `Class/Std: ${student.standard || "N/A"}`,
        `School: ${student.school_name || "N/A"}`,
        `Mobile: ${student.mobile || "N/A"}`,
        `Address: ${studentAddress || "N/A"}`,
        `Joined: ${joiningDate || "N/A"}`,
      ],
    };

    if (student.photo_url) {
      photoBase64 = await loadImageAsBase64(student.photo_url).catch(() => null);
    }

    // Parent details
    const { data: parentLinks } = await supabase
      .from("student_parents")
      .select("parent_id, parents(father_name, mother_name, mobile)")
      .eq("student_id", id)
      .limit(1)
      .maybeSingle();

    if (parentLinks?.parents) {
      const p = parentLinks.parents;
      parentInfo = {
        father: p.father_name || "",
        mother: p.mother_name || "",
        mobile: p.mobile || "",
      };
    }
  } else if (type === "teacher") {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("employee_code, first_name, last_name, mobile, qualification, joining_date")
      .eq("id", id)
      .single();
    if (!teacher) throw new Error("Teacher not found");

    const teacherAddress = orgAddress || "N/A";
    const joiningDate = teacher.joining_date || "";

    person = {
      idNo: teacher.employee_code,
      name: `${teacher.first_name} ${teacher.last_name}`,
      role: "Teacher",
      lines: [
        `Qualification: ${teacher.qualification || "N/A"}`,
        `Mobile: ${teacher.mobile || "N/A"}`,
        `Address: ${teacherAddress}`,
        `Joined: ${joiningDate || "N/A"}`,
      ],
    };
  }

  // ── PDF setup ─────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [88.9, 55.88] });
  const pageWidth = 88.9;
  const pageHeight = 55.88;
  const margin = 3;

  // ── Card border ──────────────────────────────────────────
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.roundedRect(0.5, 0.5, pageWidth - 1, pageHeight - 1, 2, 2, "S");

  // ── Header bar ────────────────────────────────────────────
  doc.setFillColor(primaryColor);
  doc.roundedRect(0, 0, pageWidth, 11, 2, 2, "F");

  // ═══ LOGO – auto‑scale width based on height ═══
  const logoHeight = 8; // desired height in mm
  if (logoBase64) {
    // Get image properties to compute scaled width
    const imgProps = doc.getImageProperties(logoBase64);
    const originalWidth = imgProps.width;
    const originalHeight = imgProps.height;
    const scaledWidth = (logoHeight / originalHeight) * originalWidth;
    doc.addImage(logoBase64, "PNG", margin + 0.5, 1.8, scaledWidth, logoHeight);
  }

  // Academy name (center)
  doc.setFont(fontHeading, "bold");
  doc.setFontSize(6);
  doc.setTextColor("#FFFFFF");
  doc.text(companyName.toUpperCase(), pageWidth / 2, 4.2, { align: "center" });

  // Contact line (center, smaller)
  const contactLine = [orgAddress, orgPhone, orgEmail].filter(Boolean).join("  |  ");
  if (contactLine) {
    doc.setFont(fontBody, "normal");
    doc.setFontSize(2.8);
    doc.text(contactLine, pageWidth / 2, 7.5, { align: "center" });
  }

  // ── Photo ──────────────────────────────────────────────────
  let y = 13.5;
  const photoSize = 22;
  const photoX = 4.5;

  if (photoBase64) {
    doc.addImage(photoBase64, "PNG", photoX, y, photoSize, photoSize);
  } else {
    doc.setDrawColor("#ccc");
    doc.setLineWidth(0.2);
    doc.roundedRect(photoX, y, photoSize, photoSize, 1, 1, "S");
    doc.setFontSize(5);
    doc.setTextColor("#999");
    doc.text("Photo", photoX + photoSize / 2, y + photoSize / 2 + 1.5, { align: "center" });
  }

  // ── Details (right of photo) ────────────────────────────
  const detailsX = photoX + photoSize + 3.5;
  let dy = y + 2;

  doc.setFont(fontHeading, "bold");
  doc.setFontSize(7);
  doc.setTextColor(primaryColor);
  doc.text(person.name.toUpperCase(), detailsX, dy);
  dy += 5;

  doc.setFont(fontBody, "normal");
  doc.setFontSize(4.5);
  doc.setTextColor("#555");
  doc.text(`${person.role} ID: ${person.idNo || "N/A"}`, detailsX, dy);
  dy += 5;

  doc.setFont(fontBody, "normal");
  doc.setFontSize(3.8);
  doc.setTextColor("#333");
  person.lines.forEach((line) => {
    doc.text(line, detailsX, dy);
    dy += 4;
  });

  // ── Parent / Guardian ─────────────────────────────────────
  if (parentInfo && (parentInfo.father || parentInfo.mother || parentInfo.mobile)) {
    dy += 1.5;
    doc.setDrawColor(primaryLight);
    doc.setLineWidth(0.1);
    doc.line(detailsX, dy - 1, pageWidth - margin, dy - 1);

    doc.setFont(fontHeading, "bold");
    doc.setFontSize(4);
    doc.setTextColor(primaryColor);
    doc.text("PARENT / GUARDIAN", detailsX, dy);
    dy += 3.5;

    doc.setFont(fontBody, "normal");
    doc.setFontSize(3.5);
    doc.setTextColor("#333");
    const parentNames = [parentInfo.father, parentInfo.mother].filter(Boolean).join(" / ");
    if (parentNames && parentInfo.mobile) {
      doc.text(`${parentNames}  |  Tel: ${parentInfo.mobile}`, detailsX, dy);
    } else if (parentNames) {
      doc.text(parentNames, detailsX, dy);
    } else if (parentInfo.mobile) {
      doc.text(`Tel: ${parentInfo.mobile}`, detailsX, dy);
    }
  }

  // ── Signatures ────────────────────────────────────────────
  y = pageHeight - 13;
  doc.setDrawColor(primaryColor);
  doc.setLineWidth(0.3);

  const sigX1 = 6;
  const sigX2 = 30;
  doc.line(sigX1, y, sigX2, y);
  doc.setFont(fontBody, "normal");
  doc.setFontSize(3.2);
  doc.setTextColor("#666");
  doc.text("Authorised Signatory", (sigX1 + sigX2) / 2, y + 3.5, { align: "center" });

  const sigX3 = pageWidth - 30;
  const sigX4 = pageWidth - 6;
  doc.line(sigX3, y, sigX4, y);
  doc.text("Cardholder", (sigX3 + sigX4) / 2, y + 3.5, { align: "center" });

  // ── Footer bar ────────────────────────────────────────────
  doc.setFillColor(primaryColor);
  doc.roundedRect(0, pageHeight - 5, pageWidth, 5, 0, 0, "F");

  doc.setFont(fontBody, "normal");
  doc.setFontSize(2.8);
  doc.setTextColor("#FFFFFF");
  const footerText = "This card is property of the academy. If found, please return.";
  doc.text(footerText, pageWidth / 2, pageHeight - 3.2, { align: "center" });
  doc.text(`Valid: ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 1.2, { align: "center" });

  doc.save(`ID_Card_${person.idNo || id}.pdf`);
}