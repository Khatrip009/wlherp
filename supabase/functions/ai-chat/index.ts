// supabase/functions/ai-chat/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ---------- HELPERS ----------
function extractPendingAction(text: string): any {
  const match = text.match(/<!-- action:([^|]+)\|([^>]+) -->/);
  if (!match) return null;
  const actionType = match[1];
  const params: Record<string, string> = {};
  match[2].split("|").forEach(pair => {
    const [key, value] = pair.split(":");
    params[key] = value;
  });
  return { actionType, ...params };
}

function getPreviousAssistantMessage(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i].content;
  }
  return null;
}

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = now;
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function getNextWeekRange() {
  const now = new Date();
  const start = now.toISOString().split("T")[0];
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);
  return { start, end: nextWeek.toISOString().split("T")[0] };
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

// ---------- BUILD SUGGESTIONS AND ACTIONS ----------
async function buildSuggestionsAndActions(supabaseClient: any, role: string, userId: string) {
  const isAdmin = role === "super_admin" || role === "admin";
  const isTeacher = role === "teacher";
  const isStudent = role === "student";

  const suggestions: string[] = [];
  const actions: { label: string; action: string; params?: any }[] = [];

  if (isAdmin) {
    // Pending fees count
    const { count: pendingFees } = await supabaseClient
      .from("student_fees")
      .select("*", { count: "exact", head: true })
      .eq("status", "Pending");
    if (pendingFees > 0) {
      suggestions.push(`📌 **${pendingFees} students** have pending fees.`);
      actions.push({ label: "View Pending Fees", action: "query", params: { query: "Show pending fees" } });
    }

    // Pending leaves
    const { count: pendingLeaves } = await supabaseClient
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "Pending");
    if (pendingLeaves > 0) {
      suggestions.push(`🗓️ **${pendingLeaves} leave requests** are pending.`);
      actions.push({ label: "Review Leaves", action: "navigate", params: { path: "/leave-management" } });
    }

    // Unsubmitted homework
    const { count: pendingHW } = await supabaseClient
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "Pending");
    if (pendingHW > 0) {
      suggestions.push(`📄 **${pendingHW} students** have not submitted homework.`);
      actions.push({ label: "View Pending Homework", action: "query", params: { query: "Pending homework" } });
    }

    // New inquiries
    const { count: newInquiries } = await supabaseClient
      .from("inquiries")
      .select("*", { count: "exact", head: true })
      .eq("status", "New");
    if (newInquiries > 0) {
      suggestions.push(`🆕 **${newInquiries} new inquiries** await follow-up.`);
      actions.push({ label: "View Inquiries", action: "navigate", params: { path: "/inquiries" } });
    }

    actions.push(
      { label: "📊 Dashboard", action: "navigate", params: { path: "/" } },
      { label: "💰 Pending Fees", action: "query", params: { query: "Show pending fees" } },
      { label: "📈 Profit & Loss", action: "navigate", params: { path: "/profit-loss" } },
      { label: "💡 Suggestions", action: "get_suggestions" },
      { label: "📋 Reports", action: "navigate", params: { path: "/reports" } }
    );
  }

  if (isTeacher) {
    const { data: teacher } = await supabaseClient
      .from("teachers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (teacher) {
      // Pending submissions in teacher's batches
      const { data: batchTeachers } = await supabaseClient
        .from("batch_teachers")
        .select("batch_id")
        .eq("teacher_id", teacher.id);
      const batchIds = batchTeachers?.map(b => b.batch_id) || [];
      if (batchIds.length) {
        const { data: homeworks } = await supabaseClient
          .from("homework")
          .select("id")
          .in("batch_id", batchIds);
        const hwIds = homeworks?.map(h => h.id) || [];
        if (hwIds.length) {
          const { count: pendingSub } = await supabaseClient
            .from("homework_submissions")
            .select("*", { count: "exact", head: true })
            .in("homework_id", hwIds)
            .eq("status", "Pending");
          if (pendingSub > 0) {
            suggestions.push(`📄 **${pendingSub} students** have pending homework in your batches.`);
            actions.push({ label: "View Submissions", action: "navigate", params: { path: "/homework" } });
          }
        }
      }

      // Teacher's pending leaves
      const { count: myPendingLeaves } = await supabaseClient
        .from("leaves")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", teacher.id)
        .eq("status", "Pending");
      if (myPendingLeaves > 0) {
        suggestions.push(`🗓️ You have **${myPendingLeaves} pending leave request(s)**.`);
        actions.push({ label: "My Leaves", action: "navigate", params: { path: "/teacher/leaves" } });
      }

      actions.push(
        { label: "🧑‍🏫 My Batches", action: "navigate", params: { path: "/teacher" } },
        { label: "📋 Mark Attendance", action: "mark_attendance" },
        { label: "💰 My Salary", action: "navigate", params: { path: "/teacher/salary" } },
        { label: "💡 Suggestions", action: "get_suggestions" }
      );
    }
  }

  if (isStudent) {
    const { data: student } = await supabaseClient
      .from("students")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (student) {
      // Pending homework for student
      const { data: pendingHW } = await supabaseClient
        .from("homework_submissions")
        .select("id")
        .eq("student_id", student.id)
        .eq("status", "Pending");
      if (pendingHW?.length) {
        suggestions.push(`📄 You have **${pendingHW.length} pending homework** submissions.`);
        actions.push({ label: "View Homework", action: "navigate", params: { path: "/student/homework" } });
      }

      // Pending fees for student
      const { data: fees } = await supabaseClient
        .from("student_fees")
        .select("id")
        .eq("student_id", student.id)
        .eq("status", "Pending");
      if (fees?.length) {
        suggestions.push(`💰 You have **${fees.length} pending fee** due.`);
        actions.push({ label: "View Fees", action: "navigate", params: { path: "/student/fees" } });
      }

      // Upcoming exams
      const { data: studentBatches } = await supabaseClient
        .from("student_batches")
        .select("batch_id")
        .eq("student_id", student.id)
        .eq("status", "active");
      const batchIds = studentBatches?.map(sb => sb.batch_id) || [];
      if (batchIds.length > 0) {
        const { data: upcomingExams } = await supabaseClient
          .from("exams")
          .select("exam_name, exam_date, batch_id, batches(batch_name)")
          .in("batch_id", batchIds)
          .gte("exam_date", getTodayDate())
          .order("exam_date", { ascending: true })
          .limit(3);
        if (upcomingExams?.length) {
          const examsList = upcomingExams.map(e => `${e.exam_name} (${e.exam_date}) - ${e.batches?.batch_name || "N/A"}`).join(", ");
          suggestions.push(`📝 Upcoming exams: ${examsList}.`);
          actions.push({ label: "View Exams", action: "navigate", params: { path: "/student/exams" } });
        }
      }

      actions.push(
        { label: "📊 My Attendance", action: "navigate", params: { path: "/student/attendance" } },
        { label: "📝 My Results", action: "navigate", params: { path: "/student/results" } },
        { label: "💡 Suggestions", action: "get_suggestions" }
      );
    }
  }

  if (suggestions.length === 0) {
    suggestions.push("✅ Everything looks good! No urgent action items at the moment.");
  }

  return { suggestions, actions: actions.slice(0, 8) };
}

// ---------- MAIN HANDLER ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")?.split(" ")[1];
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: `Bearer ${authHeader}` } },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const userRole = profile?.role?.toLowerCase() || "student";
    const isAdmin = userRole === "super_admin" || userRole === "admin";
    const isTeacher = userRole === "teacher";
    const isStudent = userRole === "student";

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastUserMsg = messages.filter(m => m.role === "user").pop()?.content || "";
    const lowerMsg = lastUserMsg.toLowerCase();

    const prevAssistantMsg = getPreviousAssistantMessage(messages);
    const pendingAction = prevAssistantMsg ? extractPendingAction(prevAssistantMsg) : null;

    let dataContext = "";

    // ---------- CONFIRMATION HANDLING ----------
    if (pendingAction && (lowerMsg.includes("confirm") || lowerMsg.includes("yes") || lowerMsg.includes("proceed"))) {
      const action = pendingAction.actionType;

      if (action === "mark_attendance" && isTeacher) {
        const studentId = parseInt(pendingAction.student_id);
        const sessionId = parseInt(pendingAction.session_id);
        const status = pendingAction.status || "Present";

        const { data: existing } = await supabaseClient
          .from("student_attendance")
          .select("id")
          .eq("session_id", sessionId)
          .eq("student_id", studentId)
          .maybeSingle();

        if (existing) {
          await supabaseClient
            .from("student_attendance")
            .update({ status })
            .eq("id", existing.id);
        } else {
          await supabaseClient
            .from("student_attendance")
            .insert({ session_id: sessionId, student_id: studentId, status });
        }
        dataContext = `\n\n✅ **Attendance marked successfully!**\n- Student ID: ${studentId}\n- Session ID: ${sessionId}\n- Status: ${status}`;
      }

      if (action === "mark_fee_paid" && isAdmin) {
        const feeId = parseInt(pendingAction.fee_id);
        const amount = parseFloat(pendingAction.amount || "0");
        const paymentDate = pendingAction.payment_date || new Date().toISOString().split("T")[0];

        const { data: payment } = await supabaseClient
          .from("fee_payments")
          .insert({
            student_fee_id: feeId,
            payment_date: paymentDate,
            amount,
            payment_mode: "Cash",
            remarks: "Marked paid via AI Assistant",
          })
          .select()
          .single();

        const { data: allPayments } = await supabaseClient
          .from("fee_payments")
          .select("amount")
          .eq("student_fee_id", feeId);
        const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
        const { data: fee } = await supabaseClient
          .from("student_fees")
          .select("final_fee")
          .eq("id", feeId)
          .single();
        let newStatus = "Pending";
        if (fee && totalPaid >= Number(fee.final_fee)) newStatus = "Paid";
        await supabaseClient
          .from("student_fees")
          .update({ status: newStatus })
          .eq("id", feeId);

        await supabaseClient.from("income").insert({
          income_date: paymentDate,
          category: "Student Fees",
          amount,
          payment_mode: "Cash",
          description: `Fee payment recorded via AI (Fee ID: ${feeId})`,
        });

        dataContext = `\n\n✅ **Fee marked as paid!**\n- Payment ID: ${payment.id}\n- Amount: ₹ ${amount.toLocaleString()}\n- Fee Status: ${newStatus}`;
      }

      if (dataContext) {
        const { suggestions, actions } = await buildSuggestionsAndActions(supabaseClient, userRole, user.id);
        return new Response(
          JSON.stringify({ reply: dataContext.trim(), suggestions, actions, usage: { prompt_tokens: 0, completion_tokens: 0 } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ---------- NEW ACTION REQUESTS ----------
    // Teacher: Mark Attendance
    if (isTeacher && (lowerMsg.includes("mark") && (lowerMsg.includes("present") || lowerMsg.includes("absent")) || lowerMsg.includes("mark attendance"))) {
      const nameMatch = lastUserMsg.match(/mark\s+(.+?)\s+(present|absent)/i);
      if (nameMatch) {
        const studentName = nameMatch[1].trim();
        const status = nameMatch[2] || "Present";
        const { data: students } = await supabaseClient
          .from("students")
          .select("id, first_name, last_name, admission_no")
          .ilike("first_name", `%${studentName}%`)
          .limit(1);

        if (students && students.length) {
          const student = students[0];
          const { data: batches } = await supabaseClient
            .from("student_batches")
            .select("batch_id")
            .eq("student_id", student.id)
            .eq("status", "active")
            .limit(1);

          if (batches && batches.length) {
            const batchId = batches[0].batch_id;
            const today = new Date().toISOString().split("T")[0];
            let { data: sessions } = await supabaseClient
              .from("attendance_sessions")
              .select("id")
              .eq("batch_id", batchId)
              .eq("attendance_date", today)
              .limit(1);

            let sessionId;
            if (sessions && sessions.length) {
              sessionId = sessions[0].id;
            } else {
              const { data: newSession } = await supabaseClient
                .from("attendance_sessions")
                .insert({ batch_id: batchId, attendance_date: today })
                .select()
                .single();
              sessionId = newSession.id;
            }

            const confirmMsg = `I found **${student.first_name} ${student.last_name}** (Adm: ${student.admission_no || "N/A"}).\nReady to mark them **${status}** for today's session.\nReply with **CONFIRM** to proceed. <!-- action:mark_attendance|student_id:${student.id}|session_id:${sessionId}|status:${status} -->`;

            return new Response(
              JSON.stringify({
                reply: confirmMsg,
                suggestions: ["✅ Confirm", "❌ Cancel"],
                actions: [{ label: "Confirm", action: "confirm" }, { label: "Cancel", action: "cancel" }],
                usage: { prompt_tokens: 0, completion_tokens: 0 },
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } else {
            dataContext = `\n\n❌ Student **${student.first_name}** is not in any active batch.`;
          }
        } else {
          dataContext = `\n\n❌ Student **${studentName}** not found.`;
        }
      }
    }

    // Admin: Mark Fee Paid
    if (isAdmin && (lowerMsg.includes("mark") && lowerMsg.includes("fee") && lowerMsg.includes("paid") || lowerMsg.includes("record payment"))) {
      const nameMatch = lastUserMsg.match(/mark\s+(.+?)\s+fee\s+paid/i) || lastUserMsg.match(/record payment for (.+)/i);
      if (nameMatch) {
        const studentName = nameMatch[1].trim();
        const { data: students } = await supabaseClient
          .from("students")
          .select("id, first_name, last_name, admission_no")
          .ilike("first_name", `%${studentName}%`)
          .limit(1);

        if (students && students.length) {
          const student = students[0];
          const { data: fees } = await supabaseClient
            .from("student_fees")
            .select("id, final_fee")
            .eq("student_id", student.id)
            .eq("status", "Pending")
            .limit(1);

          if (fees && fees.length) {
            const fee = fees[0];
            const today = new Date().toISOString().split("T")[0];
            const confirmMsg = `I found **${student.first_name} ${student.last_name}** (Adm: ${student.admission_no || "N/A"}).\nThey have a pending fee of **₹ ${fee.final_fee}**.\nReady to mark as **Paid**. Reply with **CONFIRM**. <!-- action:mark_fee_paid|student_id:${student.id}|fee_id:${fee.id}|amount:${fee.final_fee}|payment_date:${today} -->`;

            return new Response(
              JSON.stringify({
                reply: confirmMsg,
                suggestions: ["✅ Confirm", "❌ Cancel"],
                actions: [{ label: "Confirm", action: "confirm" }, { label: "Cancel", action: "cancel" }],
                usage: { prompt_tokens: 0, completion_tokens: 0 },
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } else {
            dataContext = `\n\n✅ Student **${student.first_name}** has no pending fees.`;
          }
        } else {
          dataContext = `\n\n❌ Student **${studentName}** not found.`;
        }
      }
    }

    // ---------- SUGGESTIONS (only on explicit request) ----------
    const isSuggestionRequest = lowerMsg.includes("suggest") || lowerMsg.includes("recommend") ||
        lowerMsg.includes("advise") || lowerMsg.includes("what should i do") ||
        lowerMsg.includes("pending tasks") || lowerMsg.includes("action items") ||
        lowerMsg.includes("what's next") || lowerMsg.includes("any suggestions");
    if (isSuggestionRequest) {
      const { suggestions, actions } = await buildSuggestionsAndActions(supabaseClient, userRole, user.id);
      dataContext += "\n\n💡 **Actionable Suggestions:**\n";
      suggestions.forEach((s, idx) => dataContext += `${idx+1}. ${s}\n`);
    }

    // ======================================================
    // ========== EXTENSIVE QUERY HANDLING ===================
    // ======================================================

    // ---------- ADMIN QUERIES (COMPREHENSIVE) ----------
    if (isAdmin) {
      // Pending fees detailed list
      if (lowerMsg.includes("pending fees") || lowerMsg.includes("due fees") || lowerMsg.includes("outstanding fees") || lowerMsg.includes("fee defaulters")) {
        const { data: fees } = await supabaseClient
          .from("student_fees")
          .select(`id, final_fee, status, students(first_name, last_name, admission_no)`)
          .eq("status", "Pending")
          .limit(50);
        if (fees && fees.length) {
          dataContext += "\n\n📊 **Pending Fees:**\n";
          fees.forEach((f, i) => {
            const name = f.students ? `${f.students.first_name} ${f.students.last_name}` : "Unknown";
            dataContext += `${i+1}. **${name}** (${f.students?.admission_no || "N/A"}): ₹ ${f.final_fee}\n`;
          });
          dataContext += `\nTotal: ${fees.length} students`;
        } else {
          dataContext += "\n\n✅ No pending fees.";
        }
      }

      // Monthly income / expense / profit
      if (lowerMsg.includes("income this month") || lowerMsg.includes("monthly income")) {
        const { start, end } = getCurrentMonthRange();
        const { data: incomes } = await supabaseClient.from("income").select("amount").gte("income_date", start).lte("income_date", end);
        const total = incomes?.reduce((s, i) => s + Number(i.amount), 0) || 0;
        dataContext += `\n\n💰 **Total Income (${start} to ${end}):** ₹ ${total.toLocaleString()}`;
      }

      if (lowerMsg.includes("expenses this month") || lowerMsg.includes("monthly expenses")) {
        const { start, end } = getCurrentMonthRange();
        const { data: expenses } = await supabaseClient.from("expenses").select("amount, category").gte("expense_date", start).lte("expense_date", end);
        if (expenses?.length) {
          const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
          dataContext += `\n\n💸 **Total Expenses (${start} to ${end}):** ₹ ${total.toLocaleString()}\n`;
          const catMap = new Map();
          expenses.forEach(e => {
            const cat = e.category || "Uncategorized";
            catMap.set(cat, (catMap.get(cat) || 0) + Number(e.amount));
          });
          catMap.forEach((amt, cat) => dataContext += `- ${cat}: ₹ ${amt.toLocaleString()}\n`);
        }
      }

      if (lowerMsg.includes("profit") || lowerMsg.includes("loss") || lowerMsg.includes("p&l") || lowerMsg.includes("financial summary")) {
        const { start, end } = getCurrentMonthRange();
        const { data: incomes } = await supabaseClient.from("income").select("amount").gte("income_date", start).lte("income_date", end);
        const { data: expenses } = await supabaseClient.from("expenses").select("amount").gte("expense_date", start).lte("expense_date", end);
        const totalIncome = incomes?.reduce((s, i) => s + Number(i.amount), 0) || 0;
        const totalExpense = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0;
        const profit = totalIncome - totalExpense;
        dataContext += `\n\n📈 **P&L (${start} to ${end})**\nIncome: ₹ ${totalIncome.toLocaleString()}\nExpenses: ₹ ${totalExpense.toLocaleString()}\nNet ${profit >= 0 ? "Profit" : "Loss"}: ₹ ${Math.abs(profit).toLocaleString()}`;
      }

      // Tax collected
      if (lowerMsg.includes("tax collected") || lowerMsg.includes("gst collected") || lowerMsg.includes("total tax")) {
        const { start, end } = getCurrentMonthRange();
        const { data: feeTax } = await supabaseClient.from("student_fees").select("tax_amount").gte("created_at", start).lte("created_at", end);
        const { data: incomeTax } = await supabaseClient.from("income").select("tax_amount").gte("income_date", start).lte("income_date", end);
        const totalFeeTax = feeTax?.reduce((s, r) => s + Number(r.tax_amount || 0), 0) || 0;
        const totalIncomeTax = incomeTax?.reduce((s, r) => s + Number(r.tax_amount || 0), 0) || 0;
        dataContext += `\n\n🧾 **Tax Collected (${start} to ${end}):**\n- From Fees: ₹ ${totalFeeTax.toLocaleString()}\n- From Income: ₹ ${totalIncomeTax.toLocaleString()}\n- **Total: ₹ ${(totalFeeTax + totalIncomeTax).toLocaleString()}**`;
      }

      // Student enrolment summary
      if (lowerMsg.includes("how many students") || lowerMsg.includes("total enrollments") || lowerMsg.includes("student count")) {
        const { count } = await supabaseClient.from("students").select("*", { count: "exact", head: true });
        dataContext += `\n\n👩‍🎓 **Total students:** ${count || 0}`;
      }

      if (lowerMsg.includes("active batches") || lowerMsg.includes("batch count")) {
        const { count } = await supabaseClient.from("batches").select("*", { count: "exact", head: true }).eq("status", "active");
        dataContext += `\n\n📚 **Active batches:** ${count || 0}`;
      }

      // List teachers
      if (lowerMsg.includes("list all teachers") || lowerMsg.includes("show teachers") || lowerMsg.includes("staff list")) {
        const { data: teachers } = await supabaseClient
          .from("teachers")
          .select("first_name, last_name, employee_code, mobile")
          .limit(50);
        if (teachers?.length) {
          dataContext += "\n\n👨‍🏫 **Teachers:**\n";
          teachers.forEach(t => dataContext += `- ${t.first_name} ${t.last_name} (${t.employee_code}) - 📞 ${t.mobile}\n`);
        } else {
          dataContext += "\n\nNo teachers found.";
        }
      }

      // List courses
      if (lowerMsg.includes("list all courses") || lowerMsg.includes("show courses") || lowerMsg.includes("all courses")) {
        const { data: courses } = await supabaseClient.from("courses").select("course_name, status, duration_months").order("course_name");
        if (courses?.length) {
          dataContext += "\n\n📚 **Courses:**\n";
          courses.forEach(c => dataContext += `- ${c.course_name} (${c.duration_months}m) - ${c.status ? "Active" : "Inactive"}\n`);
        } else {
          dataContext += "\n\nNo courses.";
        }
      }

      // List subjects
      if (lowerMsg.includes("list all subjects") || lowerMsg.includes("show subjects") || lowerMsg.includes("all subjects")) {
        const { data: subjects } = await supabaseClient.from("subjects").select("subject_name, courses(course_name)").order("subject_name");
        if (subjects?.length) {
          dataContext += "\n\n📖 **Subjects:**\n";
          subjects.forEach(s => dataContext += `- ${s.subject_name} (${s.courses?.course_name || "N/A"})\n`);
        } else {
          dataContext += "\n\nNo subjects.";
        }
      }

      // List parents
      if (lowerMsg.includes("list all parents") || lowerMsg.includes("show parents") || lowerMsg.includes("all parents")) {
        const { data: parents } = await supabaseClient.from("parents").select("father_name, mother_name, mobile").limit(50);
        if (parents?.length) {
          dataContext += "\n\n👨‍👩‍👧 **Parents:**\n";
          parents.forEach(p => dataContext += `- ${p.father_name || "N/A"} & ${p.mother_name || "N/A"} (${p.mobile || "N/A"})\n`);
        } else {
          dataContext += "\n\nNo parents.";
        }
      }

      // List certificates
      if (lowerMsg.includes("certificates issued") || lowerMsg.includes("certificate count") || lowerMsg.includes("list certificates")) {
        const { data: certs } = await supabaseClient
          .from("certificates")
          .select("certificate_no, issue_date, courses(course_name), students(first_name, last_name)")
          .order("issue_date", { ascending: false })
          .limit(20);
        if (certs?.length) {
          dataContext += "\n\n📜 **Recent Certificates:**\n";
          certs.forEach(c => dataContext += `- ${c.certificate_no} - ${c.students?.first_name} ${c.students?.last_name} (${c.courses?.course_name}) on ${c.issue_date}\n`);
        } else {
          dataContext += "\n\nNo certificates issued.";
        }
      }

      // Top performing students
      if (lowerMsg.includes("top students") || lowerMsg.includes("best performers")) {
        const { data: results } = await supabaseClient
          .from("student_results")
          .select("student_id, marks_obtained, exams(total_marks)")
          .limit(200);
        if (results?.length) {
          const studentMap = new Map();
          results.forEach(r => {
            const pct = r.exams?.total_marks ? (Number(r.marks_obtained) / Number(r.exams.total_marks)) * 100 : 0;
            if (!studentMap.has(r.student_id)) studentMap.set(r.student_id, []);
            studentMap.get(r.student_id).push(pct);
          });
          const avgMap = new Map();
          studentMap.forEach((marks, sid) => {
            avgMap.set(sid, marks.reduce((a, b) => a + b, 0) / marks.length);
          });
          const sorted = Array.from(avgMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
          if (sorted.length) {
            dataContext += "\n\n🏆 **Top Students (by average marks):**\n";
            for (const [sid, avg] of sorted) {
              const { data: student } = await supabaseClient
                .from("students")
                .select("first_name, last_name")
                .eq("id", sid)
                .single();
              if (student) dataContext += `- ${student.first_name} ${student.last_name}: ${avg.toFixed(1)}%\n`;
            }
          }
        }
      }

      // Inquiry conversion
      if (lowerMsg.includes("inquiry conversion") || lowerMsg.includes("leads") || lowerMsg.includes("new inquiries")) {
        const { data: inquiries } = await supabaseClient.from("inquiries").select("status").limit(1000);
        if (inquiries?.length) {
          const total = inquiries.length;
          const joined = inquiries.filter(i => i.status === "Joined").length;
          dataContext += `\n\n📊 **Inquiry Conversion:** ${joined}/${total} joined (${((joined/total)*100).toFixed(1)}%)`;
        } else {
          dataContext += "\n\nNo inquiries.";
        }
      }

      // Leaves pending
      if (lowerMsg.includes("pending leaves") || lowerMsg.includes("leave requests")) {
        const { data: leaves } = await supabaseClient
          .from("leaves")
          .select("start_date, end_date, teachers(first_name, last_name)")
          .eq("status", "Pending")
          .limit(20);
        if (leaves?.length) {
          dataContext += "\n\n🗓️ **Pending Leaves:**\n";
          leaves.forEach(l => {
            const name = l.teachers ? `${l.teachers.first_name} ${l.teachers.last_name}` : "Unknown";
            dataContext += `- ${name}: ${l.start_date} to ${l.end_date}\n`;
          });
        } else {
          dataContext += "\n\n✅ No pending leaves.";
        }
      }

      // Salary payments
      if (lowerMsg.includes("salary paid") || lowerMsg.includes("total salary")) {
        const { start, end } = getCurrentMonthRange();
        const { data: salaries } = await supabaseClient.from("salary_payments").select("amount").gte("payment_date", start).lte("payment_date", end);
        const total = salaries?.reduce((s, p) => s + Number(p.amount), 0) || 0;
        dataContext += `\n\n💵 **Total salary paid this month:** ₹ ${total.toLocaleString()}`;
      }

      // Exam performance (by exam)
      if (lowerMsg.includes("exam performance") || lowerMsg.includes("exam results")) {
        const { data: exams } = await supabaseClient.from("exams").select("exam_name, total_marks").order("exam_date", { ascending: false }).limit(3);
        if (exams?.length) {
          dataContext += "\n\n📝 **Exam Performance:**\n";
          for (const exam of exams) {
            const { data: results } = await supabaseClient.from("student_results").select("marks_obtained").eq("exam_id", exam.id);
            if (results?.length) {
              const marks = results.map(r => Number(r.marks_obtained));
              const avg = marks.reduce((a, b) => a + b, 0) / marks.length;
              const passed = marks.filter(m => m >= exam.total_marks / 2).length;
              dataContext += `- ${exam.exam_name}: Avg ${avg.toFixed(1)}, Passed ${passed}/${marks.length}\n`;
            }
          }
        }
      }

      // Online class attendance
      if (lowerMsg.includes("online class attendance") || lowerMsg.includes("class attendance")) {
        const { data: classes } = await supabaseClient.from("online_classes").select("id, title, start_time").order("start_time", { ascending: false }).limit(5);
        if (classes?.length) {
          dataContext += "\n\n💻 **Recent Online Classes:**\n";
          for (const cls of classes) {
            const { count } = await supabaseClient.from("online_class_attendance").select("*", { count: "exact", head: true }).eq("class_id", cls.id);
            dataContext += `- ${cls.title} (${cls.start_time}): ${count || 0} attendees\n`;
          }
        }
      }
    }

    // ---------- TEACHER QUERIES ----------
    if (isTeacher) {
      const { data: teacher } = await supabaseClient
        .from("teachers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (teacher) {
        // My batches
        if (lowerMsg.includes("my batches") || lowerMsg.includes("my classes")) {
          const { data: batches } = await supabaseClient
            .from("batch_teachers")
            .select("batches(batch_name, days, start_time, end_time)")
            .eq("teacher_id", teacher.id);
          if (batches?.length) {
            dataContext += "\n\n🧑‍🏫 **Your Batches:**\n";
            batches.forEach(b => {
              const info = b.batches;
              dataContext += `- ${info?.batch_name} (${info?.days}, ${info?.start_time}-${info?.end_time})\n`;
            });
          } else {
            dataContext += "\n\nNo batches assigned.";
          }
        }

        // My students
        if (lowerMsg.includes("my students") || lowerMsg.includes("students in my")) {
          const { data: batchTeachers } = await supabaseClient
            .from("batch_teachers")
            .select("batch_id")
            .eq("teacher_id", teacher.id);
          const batchIds = batchTeachers?.map(b => b.batch_id) || [];
          if (batchIds.length) {
            const { data: students } = await supabaseClient
              .from("student_batches")
              .select("students(first_name, last_name, admission_no)")
              .in("batch_id", batchIds)
              .eq("status", "active");
            if (students?.length) {
              const unique = new Map();
              students.forEach(s => {
                if (s.students && !unique.has(s.students.admission_no)) unique.set(s.students.admission_no, s.students);
              });
              dataContext += "\n\n👨‍🎓 **Your Students:**\n";
              unique.forEach(s => dataContext += `- ${s.first_name} ${s.last_name} (${s.admission_no})\n`);
            } else {
              dataContext += "\n\nNo students in your batches.";
            }
          }
        }

        // My salary history
        if (lowerMsg.includes("my salary") || lowerMsg.includes("salary this month")) {
          const { data: salaries } = await supabaseClient
            .from("salary_payments")
            .select("amount, payment_date")
            .eq("teacher_id", teacher.id)
            .order("payment_date", { ascending: false })
            .limit(1);
          if (salaries?.length) {
            dataContext += `\n\n💰 **Last salary:** ₹ ${salaries[0].amount} on ${salaries[0].payment_date}`;
          }
        }

        // My leaves
        if (lowerMsg.includes("my leaves") || lowerMsg.includes("leave history")) {
          const { data: leaves } = await supabaseClient
            .from("leaves")
            .select("start_date, end_date, status, reason")
            .eq("teacher_id", teacher.id)
            .order("created_at", { ascending: false })
            .limit(10);
          if (leaves?.length) {
            dataContext += "\n\n🗓️ **Your Leaves:**\n";
            leaves.forEach(l => dataContext += `- ${l.start_date} to ${l.end_date}: ${l.status} (${l.reason})\n`);
          }
        }

        // Homework for my batches
        if (lowerMsg.includes("pending homework") || lowerMsg.includes("my batch homework")) {
          const { data: batchTeachers } = await supabaseClient
            .from("batch_teachers")
            .select("batch_id")
            .eq("teacher_id", teacher.id);
          const batchIds = batchTeachers?.map(b => b.batch_id) || [];
          if (batchIds.length) {
            const { data: homework } = await supabaseClient
              .from("homework")
              .select("id, title, due_date")
              .in("batch_id", batchIds)
              .order("due_date", { ascending: false })
              .limit(10);
            if (homework?.length) {
              dataContext += "\n\n📄 **Recent Homework:**\n";
              homework.forEach(h => dataContext += `- ${h.title} (Due: ${h.due_date})\n`);
            }
          }
        }
      }
    }

    // ---------- STUDENT QUERIES ----------
    if (isStudent) {
      const { data: student } = await supabaseClient
        .from("students")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (student) {
        // Today's homework
        if (lowerMsg.includes("today's homework") || lowerMsg.includes("homework today")) {
          const today = new Date().toISOString().split("T")[0];
          const { data: submissions } = await supabaseClient
            .from("homework_submissions")
            .select("homework(title, description, due_date), status")
            .eq("student_id", student.id)
            .eq("homework.due_date", today)
            .limit(10);
          if (submissions?.length) {
            dataContext += "\n\n📚 **Today's Homework:**\n";
            submissions.forEach(s => {
              const hw = s.homework;
              dataContext += `- **${hw.title}** (Due: ${hw.due_date}) - Status: ${s.status}\n`;
            });
          } else {
            dataContext += "\n\n✅ No homework due today.";
          }
        }

        // My attendance
        if (lowerMsg.includes("my attendance") || lowerMsg.includes("attendance percentage")) {
          const { data: studentBatches } = await supabaseClient
            .from("student_batches")
            .select("batch_id")
            .eq("student_id", student.id)
            .eq("status", "active");
          const batchIds = studentBatches?.map(sb => sb.batch_id) || [];
          if (batchIds.length > 0) {
            const { data: sessions } = await supabaseClient.from("attendance_sessions").select("id").in("batch_id", batchIds);
            const sessionIds = sessions?.map(s => s.id) || [];
            const { data: marks } = await supabaseClient.from("student_attendance").select("status").eq("student_id", student.id).in("session_id", sessionIds);
            const present = marks?.filter(m => m.status === "Present").length || 0;
            const total = marks?.length || 0;
            const pct = total > 0 ? ((present / total) * 100).toFixed(1) : 0;
            dataContext += `\n\n📊 **Your attendance:** ${pct}% (${present}/${total})`;
          } else {
            dataContext += "\n\nYou are not enrolled in any batch.";
          }
        }

        // My results
        if (lowerMsg.includes("my results") || lowerMsg.includes("my marks")) {
          const { data: results } = await supabaseClient
            .from("student_results")
            .select("marks_obtained, exams(exam_name, exam_date, total_marks)")
            .eq("student_id", student.id)
            .order("exam_date", { ascending: false, foreignTable: "exams" })
            .limit(10);
          if (results?.length) {
            dataContext += "\n\n📝 **Your Results:**\n";
            results.forEach(r => {
              const exam = r.exams;
              const pct = exam?.total_marks ? ((r.marks_obtained / exam.total_marks) * 100).toFixed(1) : "N/A";
              dataContext += `- ${exam?.exam_name} (${exam?.exam_date}): ${r.marks_obtained}/${exam?.total_marks} (${pct}%)\n`;
            });
          }
        }

        // My fees
        if (lowerMsg.includes("my fees") || lowerMsg.includes("fee due") || lowerMsg.includes("how much do i owe")) {
          const { data: fees } = await supabaseClient
            .from("student_fees")
            .select("id, final_fee, status")
            .eq("student_id", student.id);
          if (fees?.length) {
            dataContext += "\n\n💰 **Your Fee Summary:**\n";
            for (const fee of fees) {
              const { data: payments } = await supabaseClient.from("fee_payments").select("amount").eq("student_fee_id", fee.id);
              const paid = payments?.reduce((s, p) => s + Number(p.amount), 0) || 0;
              const pending = Math.max(Number(fee.final_fee) - paid, 0);
              dataContext += `- Total: ₹ ${fee.final_fee}, Paid: ₹ ${paid}, Balance: ₹ ${pending} (${fee.status})\n`;
            }
          }
        }

        // My timetable today
        if (lowerMsg.includes("my timetable") || lowerMsg.includes("today's classes")) {
          const { data: studentBatches } = await supabaseClient
            .from("student_batches")
            .select("batch_id")
            .eq("student_id", student.id)
            .eq("status", "active");
          const batchIds = studentBatches?.map(sb => sb.batch_id) || [];
          if (batchIds.length > 0) {
            const today = new Date();
            const dayName = today.toLocaleString("en-US", { weekday: "short" });
            const { data: batches } = await supabaseClient
              .from("batches")
              .select("batch_name, start_time, end_time")
              .in("id", batchIds)
              .ilike("days", `%${dayName}%`);
            if (batches?.length) {
              dataContext += "\n\n📅 **Today's Classes:**\n";
              batches.forEach(b => dataContext += `- ${b.batch_name}: ${b.start_time} - ${b.end_time}\n`);
            } else {
              dataContext += "\n\nNo classes today.";
            }
          }
        }

        // My certificates
        if (lowerMsg.includes("my certificates")) {
          const { data: certs } = await supabaseClient
            .from("certificates")
            .select("certificate_no, issue_date, courses(course_name)")
            .eq("student_id", student.id);
          if (certs?.length) {
            dataContext += "\n\n📜 **Your Certificates:**\n";
            certs.forEach(c => dataContext += `- ${c.courses?.course_name} (${c.certificate_no}) - ${c.issue_date}\n`);
          }
        }

        // Upcoming exams
        if (lowerMsg.includes("upcoming exams") || lowerMsg.includes("exams next week")) {
          const { data: studentBatches } = await supabaseClient
            .from("student_batches")
            .select("batch_id")
            .eq("student_id", student.id)
            .eq("status", "active");
          const batchIds = studentBatches?.map(sb => sb.batch_id) || [];
          if (batchIds.length > 0) {
            const today = getTodayDate();
            const { data: exams } = await supabaseClient
              .from("exams")
              .select("exam_name, exam_date, batches(batch_name)")
              .in("batch_id", batchIds)
              .gte("exam_date", today)
              .order("exam_date", { ascending: true })
              .limit(10);
            if (exams?.length) {
              dataContext += "\n\n📝 **Upcoming Exams:**\n";
              exams.forEach(e => dataContext += `- ${e.exam_name} on ${e.exam_date} (${e.batches?.batch_name})\n`);
            }
          }
        }
      }
    }

    // ---------- SYSTEM PROMPT ----------
    let systemPrompt = "";
    if (isStudent) {
      systemPrompt = "You are VidhyaMitra, a friendly AI tutor for ShreeVidhya Academy. Help students with academic doubts and personal data. Use the provided data context to answer accurately. Encourage the student.";
    } else if (isTeacher) {
      systemPrompt = "You are VidhyaMitra, a professional AI teaching assistant. Help teachers with quizzes, attendance, homework, and class management. Be supportive and precise.";
    } else {
      systemPrompt = "You are VidhyaMitra, an AI admin assistant. Provide data-driven insights, reports, fee summaries, and actionable suggestions for school management. Be professional and direct.";
    }

    // ---------- GROQ API CALL ----------
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");

    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...(dataContext ? [{ role: "system", content: dataContext }] : []),
      ...messages,
    ];

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: finalMessages,
        temperature: 0.7,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      throw new Error(`Groq API error: ${groqResponse.status} - ${errorText}`);
    }

    const groqData = await groqResponse.json();
    const reply = groqData.choices[0]?.message?.content || "";

    // Only fetch suggestions/actions when explicitly requested to avoid 3-6 extra DB queries per message
    let suggestions: string[] = [];
    let actions: { label: string; action: string; params?: any }[] = [];
    if (isSuggestionRequest) {
      ({ suggestions, actions } = await buildSuggestionsAndActions(supabaseClient, userRole, user.id));
    }

    // Log usage (optional)
    await supabaseClient.from("ai_usage_logs").insert({
      user_id: user.id,
      user_email: user.email,
      prompt_tokens: groqData.usage?.prompt_tokens || 0,
      completion_tokens: groqData.usage?.completion_tokens || 0,
      total_tokens: groqData.usage?.total_tokens || 0,
      model: groqData.model,
      response: reply,
    });

    return new Response(
      JSON.stringify({ reply, suggestions, actions, usage: groqData.usage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});