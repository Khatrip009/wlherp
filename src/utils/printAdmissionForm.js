// src/services/admissionPrintService.js
import { supabase } from "../api/supabase";

export async function printAdmissionForm(studentId, options = {}) {
  const { format = "a4" } = options;   // 'a4' or 'a5'

  // ---------- 1. Organization (including letterhead) ----------
  const { data: org } = await supabase
    .from("organization")
    .select("company_name, letterhead_url")
    .eq("id", 1)
    .single();

  const academyName = org?.company_name || "ShreeVidhya Academy";
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

  // ---------- 4. Batches ----------
  const { data: batches } = await supabase
    .from("student_batches")
    .select(`batch_id, batches(course_id, courses(course_name), batch_name)`)
    .eq("student_id", studentId)
    .eq("status", "active");

  // ---------- 5. Fee summary ----------
  const { data: fees } = await supabase
    .from("student_fees")
    .select("final_fee, status, fee_structures(fee_amount)")
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
  const pending = totalFee - paidAmount;

  // ---------- 6. Margins (top/bottom keep content clear of pre‑printed elements) ----------
  const topMargin = format === "a5" ? 38 : 48;   // mm
  const bottomMargin = format === "a5" ? 14 : 20;
  const sideMargin = format === "a5" ? 10 : 15;

  // ---------- 7. Build HTML ----------
  const html = `
    <html>
    <head>
      <title>Admission Form</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        @page {
          size: ${format};
          margin: 0;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #333;
          font-size: 13px;
          margin: 0;
          padding: 0;
          background: transparent;
          position: relative;
        }
        .letterhead-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          background: url('${letterheadUrl}') center center / cover no-repeat;
        }
        .content {
          position: relative;
          z-index: 1;
          padding: ${topMargin}px ${sideMargin}px ${bottomMargin}px;
          min-height: 100vh;
          box-sizing: border-box;
        }
        /* ---------- Typography ---------- */
        .section-title {
          font-size: 15px;
          font-weight: 600;
          color: #0D47A1;
          border-bottom: 1px solid #ccc;
          padding-bottom: 3px;
          margin: 15px 0 8px 0;
        }
        .info-row {
          display: flex;
          margin-bottom: 5px;
          break-inside: avoid;
        }
        .info-label {
          width: 130px;
          font-weight: 600;
          color: #555;
        }
        .info-value {
          flex: 1;
          word-wrap: break-word;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
          font-size: 12px;
        }
        th, td {
          padding: 6px 8px;
          border: 1px solid #ddd;
          text-align: left;
          vertical-align: top;
        }
        th {
          background-color: #0D47A1;
          color: white;
          font-weight: 600;
        }
        tr:nth-child(even) td {
          background-color: #F5F8FF;
        }
        /* Photo */
        .student-photo {
          width: 110px;
          height: 110px;
          border: 2px solid #0D47A1;
          border-radius: 6px;
          object-fit: cover;
          margin-bottom: 8px;
        }
        .photo-section {
          text-align: center;
        }
        /* Print button (hidden when printing) */
        .no-print { display: block; }
        @media print {
          .no-print { display: none; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .letterhead-bg {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
          }
        }
      </style>
    </head>
    <body>
      <div class="letterhead-bg"></div>
      <div class="content">
        <!-- Student Photo & Info Grid -->
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
          <div style="flex: 1 1 60%; min-width: 300px;">
            <div class="section-title">Student Information</div>
            <div class="info-row"><div class="info-label">Admission No</div><div class="info-value">${student.admission_no || '-'}</div></div>
            <div class="info-row"><div class="info-label">Name</div><div class="info-value">${student.first_name} ${student.last_name}</div></div>
            <div class="info-row"><div class="info-label">Gender</div><div class="info-value">${student.gender || '-'}</div></div>
            <div class="info-row"><div class="info-label">Date of Birth</div><div class="info-value">${student.dob || '-'}</div></div>
            <div class="info-row"><div class="info-label">Mobile</div><div class="info-value">${student.mobile}</div></div>
            <div class="info-row"><div class="info-label">WhatsApp</div><div class="info-value">${student.whatsapp || '-'}</div></div>
            <div class="info-row"><div class="info-label">Email</div><div class="info-value">${student.email || '-'}</div></div>
            <div class="info-row"><div class="info-label">Address</div><div class="info-value">${[student.address, student.city, student.state, student.pincode].filter(Boolean).join(', ')}</div></div>
            <div class="info-row"><div class="info-label">School</div><div class="info-value">${student.school_name || '-'}</div></div>
            <div class="info-row"><div class="info-label">Board</div><div class="info-value">${student.board || '-'}</div></div>
            <div class="info-row"><div class="info-label">Standard</div><div class="info-value">${student.standard || '-'}</div></div>
            <div class="info-row"><div class="info-label">Joining Date</div><div class="info-value">${student.joining_date || '-'}</div></div>
            ${mediumName ? `<div class="info-row"><div class="info-label">Medium</div><div class="info-value">${mediumName}</div></div>` : ''}
            <div class="info-row"><div class="info-label">Status</div><div class="info-value">${student.status}</div></div>
          </div>

          <div class="photo-section">
            ${student.photo_url ? `<img src="${student.photo_url}" alt="Student Photo" class="student-photo" />` : ''}
          </div>
        </div>

        <!-- Parents -->
        ${parents.length > 0 ? `
        <div class="section-title">Parent / Guardian Details</div>
        ${parents.map(p => `
          <div style="display:flex; flex-wrap:wrap; gap:20px; margin-bottom:10px; border:1px solid #ddd; padding:10px; border-radius:6px;">
            <div style="flex:1 1 45%;">
              <div class="info-row"><div class="info-label">Father Name</div><div class="info-value">${p.father_name || '-'}</div></div>
              <div class="info-row"><div class="info-label">Mother Name</div><div class="info-value">${p.mother_name || '-'}</div></div>
              <div class="info-row"><div class="info-label">Mobile</div><div class="info-value">${p.mobile || '-'}</div></div>
            </div>
            <div style="flex:1 1 45%;">
              <div class="info-row"><div class="info-label">WhatsApp</div><div class="info-value">${p.whatsapp || '-'}</div></div>
              <div class="info-row"><div class="info-label">Email</div><div class="info-value">${p.email || '-'}</div></div>
              <div class="info-row"><div class="info-label">Occupation</div><div class="info-value">${p.occupation || '-'}</div></div>
              <div class="info-row"><div class="info-label">Address</div><div class="info-value">${p.address || '-'}</div></div>
            </div>
          </div>
        `).join('')}
        ` : ''}

        <!-- Batches -->
        ${batches?.length ? `
        <div class="section-title">Enrolled Batches</div>
        <table>
          <tr><th>Batch Name</th><th>Course</th></tr>
          ${batches.map(b => `<tr><td>${b.batches?.batch_name}</td><td>${b.batches?.courses?.course_name || '-'}</td></tr>`).join('')}
        </table>
        ` : ''}

        <!-- Fee Summary -->
        <div class="section-title">Fee Summary</div>
        <table>
          <tr><th>Total Fee</th><td>Rs. ${totalFee.toLocaleString()}</td></tr>
          <tr><th>Paid</th><td>Rs. ${paidAmount.toLocaleString()}</td></tr>
          <tr><th>Pending</th><td>Rs. ${pending.toLocaleString()}</td></tr>
          <tr><th>Status</th><td>${pending <= 0 ? 'Paid' : 'Pending'}</td></tr>
        </table>
      </div>

      <div class="no-print" style="text-align:center; padding:20px;">
        <button onclick="window.print()" style="padding:10px 20px; background:#0D47A1; color:#fff; border:none; border-radius:4px; cursor:pointer;">Print Form</button>
      </div>
      <script>
        // Auto‑trigger print after a short delay to ensure images load
        window.onload = function() {
          setTimeout(() => { window.print(); }, 600);
        };
      </script>
    </body>
    </html>
  `;

  // Open print window
  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  printWindow.document.write(html);
  printWindow.document.close();
}