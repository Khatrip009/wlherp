import { jsPDF } from "jspdf";
import { supabase } from "../api/supabase";

// Helper: load image as base64
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

/**
 * Generate a professional ID card (3.5 × 2.2 inches / 88.9 × 55.88 mm)
 * for a student or teacher.
 * @param {Object} options
 * @param {"student"|"teacher"} options.type
 * @param {number} options.id - ID of the student or teacher
 */
export async function generateIdCard({ type, id }) {
  // 1. Organisation details
  const { data: org } = await supabase
    .from("organization")
    .select("logo_dark_url, company_name, address, phone, email")
    .eq("id", 1)
    .single();

  const logoUrl = org?.logo_dark_url || "/ShreeVidhyaDark.png";
  const academyName = org?.company_name || "ShreeVidhya Academy";
  const orgAddress = org?.address || "";
  const orgPhone = org?.phone || "";
  const orgEmail = org?.email || "";

  const logoBase64 = await loadImageAsBase64(logoUrl).catch(() => null);

  // 2. Fetch person data
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

  // 3. PDF setup – 3.5 × 2.2 inches (88.9 × 55.88 mm)
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [88.9, 55.88] });
  const pageWidth = 88.9;
  const pageHeight = 55.88;
  const margin = 3;

  // Background white
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // ═══ HEADER BAR ═══
  doc.setFillColor("#0D47A1");
  doc.rect(0, 0, pageWidth, 10, "F");

  // Logo
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, 1.2, 7.5, 7.5);
  }

  // Academy name – Times Bold
  doc.setFont("times", "bold");
  doc.setFontSize(5.5);
  doc.setTextColor("#FFFFFF");
  doc.text(academyName.toUpperCase(), pageWidth / 2, 4.5, { align: "center" });

  // Address & contact
  const contactLine = [orgAddress, orgPhone, orgEmail].filter(Boolean).join("  |  ");
  if (contactLine) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(3.2);
    doc.text(contactLine, pageWidth / 2, 7, { align: "center" });
  }

  // ═══ PHOTO (left) ═══
  let y = 11;
  if (photoBase64) {
    doc.addImage(photoBase64, "PNG", 5, y, 18, 22);
  } else {
    doc.setDrawColor("#ccc");
    doc.setLineWidth(0.2);
    doc.rect(5, y, 18, 22);
    doc.setFontSize(6);
    doc.setTextColor("#999");
    doc.text("Photo", 14, y + 12, { align: "center" });
  }

  // ═══ DETAILS (right of photo) ═══
  const detailsX = 26;
  let dy = y + 1;

  // Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.setTextColor("#0D47A1");
  doc.text(person.name.toUpperCase(), detailsX, dy);
  dy += 4.5;

  // Role & ID
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4);
  doc.setTextColor("#555");
  doc.text(`${person.role} ID: ${person.idNo || "N/A"}`, detailsX, dy);
  dy += 5;

  // Info lines
  doc.setFont("helvetica", "normal");
  doc.setFontSize(3.6);
  doc.setTextColor("#333");
  person.lines.forEach((line) => {
    doc.text(line, detailsX, dy);
    dy += 3.8;
  });

  // ═══ PARENT / GUARDIAN (students only) ═══
  if (parentInfo && (parentInfo.father || parentInfo.mother || parentInfo.mobile)) {
    dy += 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(3.6);
    doc.setTextColor("#0D47A1");
    doc.text("PARENT / GUARDIAN", detailsX, dy);
    dy += 3.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(3.4);
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

  // ═══ SIGNATURES ═══
  y = pageHeight - 11;
  doc.setDrawColor("#0D47A1");
  doc.setLineWidth(0.3);
  doc.line(6, y, 30, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(3.2);
  doc.setTextColor("#666");
  doc.text("Authorised Signatory", 18, y + 2.5, { align: "center" });

  doc.line(pageWidth - 30, y, pageWidth - 6, y);
  doc.text("Cardholder", pageWidth - 18, y + 2.5, { align: "center" });

  // ═══ FOOTER ═══
  doc.setFillColor("#0D47A1");
  doc.rect(0, pageHeight - 5, pageWidth, 5, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(2.8);
  doc.setTextColor("#FFFFFF");
  doc.text("This card is property of the academy. If found, please return.", pageWidth / 2, pageHeight - 3, { align: "center" });
  doc.text(`Valid: ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 1.5, { align: "center" });

  doc.save(`ID_Card_${person.idNo || id}.pdf`);
}