// supabase/functions/ai-chat/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function formatDataToText(data: any): string {
  if (!data || (Array.isArray(data) && data.length === 0)) return "No records found.";
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data.map(item => {
      if (typeof item === 'object') {
        return Object.entries(item).map(([k,v]) => `${k}: ${v}`).join(', ');
      }
      return String(item);
    }).join('\n');
  }
  if (typeof data === 'object') {
    return Object.entries(data).map(([k,v]) => `${k}: ${v}`).join('\n');
  }
  return String(data);
}

const HARDCODED_QUERIES: Record<string, Record<string, string>> = {
  admin: {
    "total students": "SELECT count(*)::text FROM students",
    "total teachers": "SELECT count(*)::text FROM teachers",
    "active batches": "SELECT count(*)::text FROM batches WHERE status='active'",
    "all batches": "SELECT json_agg(row_to_json(t)) FROM (SELECT batch_name, course_id, status, start_time, end_time FROM batches ORDER BY batch_name) t",
    "pending fees": "SELECT json_agg(row_to_json(t)) FROM (SELECT s.first_name, s.last_name, s.admission_no, f.final_fee FROM student_fees f JOIN students s ON s.id=f.student_id WHERE f.status='Pending' LIMIT 50) t",
    "profit": "SELECT json_build_object('totalIncome', COALESCE((SELECT sum(amount) FROM income WHERE income_date >= date_trunc('month', CURRENT_DATE) AND income_date <= CURRENT_DATE),0), 'totalExpense', COALESCE((SELECT sum(amount) FROM expenses WHERE expense_date >= date_trunc('month', CURRENT_DATE) AND expense_date <= CURRENT_DATE),0))",
    "exams": "SELECT json_agg(row_to_json(t)) FROM (SELECT exam_name, total_marks, (SELECT avg(marks_obtained) FROM student_results WHERE exam_id=exams.id) as avg_marks FROM exams ORDER BY exam_date DESC LIMIT 3) t",
    "pending leaves": "SELECT json_agg(row_to_json(t)) FROM (SELECT t.first_name, t.last_name, l.start_date, l.end_date FROM leaves l JOIN teachers t ON t.id=l.teacher_id WHERE l.status='Pending' LIMIT 20) t",
    "salary paid": "SELECT sum(amount)::text FROM salary_payments WHERE payment_date >= date_trunc('month', CURRENT_DATE)",
    "inquiry": "SELECT json_build_object('total', (SELECT count(*) FROM inquiries), 'joined', (SELECT count(*) FROM inquiries WHERE status='Joined'))",
    "certificates": "SELECT json_agg(row_to_json(t)) FROM (SELECT c.certificate_no, c.issue_date, co.course_name, s.first_name, s.last_name FROM certificates c JOIN students s ON s.id=c.student_id JOIN courses co ON co.id=c.course_id ORDER BY c.issue_date DESC LIMIT 20) t",
    "top students": "WITH student_avg AS (SELECT sr.student_id, avg(sr.marks_obtained / e.total_marks * 100) as avg_percent FROM student_results sr JOIN exams e ON e.id=sr.exam_id GROUP BY sr.student_id) SELECT json_agg(row_to_json(t)) FROM (SELECT s.first_name, s.last_name, round(sa.avg_percent,1) as percentage FROM student_avg sa JOIN students s ON s.id=sa.student_id ORDER BY sa.avg_percent DESC LIMIT 5) t",
    "online classes": "SELECT json_agg(row_to_json(t)) FROM (SELECT oc.title, oc.start_time, (SELECT count(*) FROM online_class_attendance WHERE class_id=oc.id) as attendees FROM online_classes oc ORDER BY oc.start_time DESC LIMIT 5) t"
  },
  teacher: {
    "my batches": "SELECT json_agg(row_to_json(t)) FROM (SELECT b.batch_name, b.days, b.start_time, b.end_time FROM batch_teachers bt JOIN batches b ON b.id=bt.batch_id WHERE bt.teacher_id = $1) t",
    "my students": "SELECT json_agg(row_to_json(DISTINCT s)) FROM student_batches sb JOIN students s ON s.id=sb.student_id WHERE sb.batch_id IN (SELECT batch_id FROM batch_teachers WHERE teacher_id=$1) AND sb.status='active'",
    "my salary": "SELECT json_agg(row_to_json(t)) FROM (SELECT amount, payment_date FROM salary_payments WHERE teacher_id=$1 ORDER BY payment_date DESC LIMIT 1) t",
    "my leaves": "SELECT json_agg(row_to_json(t)) FROM (SELECT start_date, end_date, status, reason FROM leaves WHERE teacher_id=$1 ORDER BY created_at DESC LIMIT 10) t",
    "pending homework": "SELECT json_agg(row_to_json(t)) FROM (SELECT h.title, h.due_date FROM homework h WHERE h.batch_id IN (SELECT batch_id FROM batch_teachers WHERE teacher_id=$1) ORDER BY h.due_date DESC LIMIT 10) t"
  },
  student: {
    "my attendance": "SELECT json_build_object('present', COALESCE((SELECT count(*) FROM student_attendance WHERE student_id=$1 AND status='Present'),0), 'total', COALESCE((SELECT count(*) FROM student_attendance WHERE student_id=$1),0))",
    "my results": "SELECT json_agg(row_to_json(t)) FROM (SELECT sr.marks_obtained, e.exam_name, e.total_marks, e.exam_date FROM student_results sr JOIN exams e ON e.id=sr.exam_id WHERE sr.student_id=$1 ORDER BY e.exam_date DESC LIMIT 10) t",
    "my fees": "SELECT json_agg(row_to_json(t)) FROM (SELECT f.final_fee, f.status, (SELECT coalesce(sum(amount),0) FROM fee_payments WHERE student_fee_id=f.id) as paid FROM student_fees f WHERE f.student_id=$1) t",
    "my timetable": "SELECT json_agg(row_to_json(t)) FROM (SELECT b.batch_name, b.start_time, b.end_time FROM student_batches sb JOIN batches b ON b.id=sb.batch_id WHERE sb.student_id=$1 AND sb.status='active' AND b.days ILIKE '%' || to_char(CURRENT_DATE, 'Dy') || '%') t",
    "upcoming exams": "SELECT json_agg(row_to_json(t)) FROM (SELECT e.exam_name, e.exam_date, b.batch_name FROM exams e JOIN batches b ON b.id=e.batch_id WHERE b.id IN (SELECT batch_id FROM student_batches WHERE student_id=$1 AND status='active') AND e.exam_date >= CURRENT_DATE ORDER BY e.exam_date LIMIT 10) t"
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization")?.split(" ")[1];
    if (!authHeader) return new Response("Missing token", { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${authHeader}` } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profile } = await supabaseClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
    let userRole = profile?.role?.toLowerCase() || "student";
    if (userRole.includes('admin')) userRole = 'admin';

    let body: any;
    try { body = await req.json(); } catch { body = {}; }

    if (body.action === 'menu') {
      const { data: queries } = await supabaseClient.from('chatbot_queries').select('display_text, trigger_keywords').eq('role', userRole);
      if (queries && queries.length > 0) {
        return new Response(JSON.stringify({ menu: queries }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const hardMenu = Object.keys(HARDCODED_QUERIES[userRole] || {}).map(key => ({
        display_text: `📋 ${key.replace(/\b\w/g, l => l.toUpperCase())}`,
        trigger_keywords: [key]
      }));
      return new Response(JSON.stringify({ menu: hardMenu }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const messages = body.messages || [];
    const lastUserMsg = messages.filter((m: any) => m.role === "user").pop()?.content || "";
    const lowerMsg = lastUserMsg.toLowerCase();

    const hardQueries = HARDCODED_QUERIES[userRole] || {};
    for (const [keyword, query] of Object.entries(hardQueries)) {
      if (lowerMsg.includes(keyword)) {
        let finalQuery = query;
        if (finalQuery.includes('$1')) {
          let userIdParam = '';
          if (userRole === 'teacher') {
            const { data: teacher } = await supabaseClient.from('teachers').select('id').eq('user_id', user.id).single();
            userIdParam = teacher?.id?.toString() || '0';
          } else if (userRole === 'student') {
            const { data: student } = await supabaseClient.from('students').select('id').eq('user_id', user.id).single();
            userIdParam = student?.id?.toString() || '0';
          }
          finalQuery = finalQuery.replace(/\$1/g, userIdParam);
        }
        const { data: result, error: execError } = await supabaseClient.rpc('execute_query', { query_text: finalQuery });
        if (execError) {
          return new Response(JSON.stringify({ reply: "Sorry, I couldn't fetch that data." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ reply: formatDataToText(result) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // chatbot_queries table fallback
    const { data: allQueries } = await supabaseClient.from('chatbot_queries').select('*').eq('role', userRole);
    if (allQueries) {
      for (const q of allQueries) {
        if (q.trigger_keywords?.some((kw: string) => lowerMsg.includes(kw.toLowerCase()))) {
          if (q.response_type === 'text') {
            return new Response(JSON.stringify({ reply: q.static_response }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          let finalQuery = q.data_query;
          if (finalQuery.includes('$1')) {
            let userIdParam = '';
            if (userRole === 'teacher') {
              const { data: teacher } = await supabaseClient.from('teachers').select('id').eq('user_id', user.id).single();
              userIdParam = teacher?.id?.toString() || '0';
            } else if (userRole === 'student') {
              const { data: student } = await supabaseClient.from('students').select('id').eq('user_id', user.id).single();
              userIdParam = student?.id?.toString() || '0';
            }
            finalQuery = finalQuery.replace(/\$1/g, userIdParam);
          }
          const { data: result, error: execError } = await supabaseClient.rpc('execute_query', { query_text: finalQuery });
          if (execError) {
            return new Response(JSON.stringify({ reply: "Sorry, I couldn't fetch that data." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ reply: formatDataToText(result) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    return new Response(JSON.stringify({
      reply: "I didn't understand that. Try asking about fees, attendance, exams, etc."
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});