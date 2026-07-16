// src/utils/reportConfig.js
import { supabase } from '../api/supabase';
import {
  AdmissionFormDocument,
  FeeReceiptDocument,
  ExpenseReceiptDocument,
  IncomeReceiptDocument,
  SalarySlipDocument,
  CertificateDocument
} from './reportDocuments';

export const reportTypes = {

  /* =============================================================
   * 1. STUDENT ENROLLMENT REPORT
   * ============================================================= */
  student_enrollment: {
    id: 'student_enrollment',
    title: 'Student Enrollment Report',
    description: 'Students enrolled within a date range, with course, batch & medium',
    useLetterhead: true,
    fields: ['start_date', 'end_date', 'course_id', 'batch_id', 'medium_id'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_batches')
        .select(`
          enrollment_date,
          status,
          students!inner( admission_no, first_name, last_name, mobile ),
          batches!inner(
            batch_name,
            courses ( course_name ),
            mediums ( name )
          )
        `)
        .gte('enrollment_date', filters.start_date)
        .lte('enrollment_date', filters.end_date);

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed

      if (filters.batch_id) q = q.eq('batches.id', filters.batch_id);
      if (filters.course_id) q = q.eq('batches.course_id', filters.course_id);
      if (filters.medium_id) q = q.eq('batches.medium_id', filters.medium_id);

      return q;
    },
    transform: (data) => data.map(r => ({
      enrollment_date: r.enrollment_date,
      admission_no: r.students.admission_no,
      name: `${r.students.first_name} ${r.students.last_name}`,
      mobile: r.students.mobile,
      batch: r.batches.batch_name,
      course: r.batches.courses?.course_name || '',
      medium: r.batches.mediums?.name || '',
      status: r.status,
    })),
    columns: [
      { header: 'Enroll Date', accessor: 'enrollment_date' },
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student Name', accessor: 'name' },
      { header: 'Mobile', accessor: 'mobile' },
      { header: 'Batch', accessor: 'batch' },
      { header: 'Course', accessor: 'course' },
      { header: 'Medium', accessor: 'medium' },
      { header: 'Status', accessor: 'status' },
    ],
  },

  /* =============================================================
   * 2. ACTIVE / INACTIVE STUDENT LIST
   * ============================================================= */
  student_status_list: {
    id: 'student_status_list',
    title: 'Active / Inactive Student List',
    description: 'Filter students by current status (active, inactive, etc.)',
    useLetterhead: true,
    fields: ['status', 'batch_id', 'course_id'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('students')
        .select(`admission_no, first_name, last_name, mobile, status`)
        .order('first_name');

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);

      if (filters.status) q = q.eq('status', filters.status);
      if (filters.batch_id || filters.course_id) {
        q = q.in(
          'id',
          supabase
            .from('student_batches')
            .select('student_id')
            .eq('status', 'active')
            .in('batch_id', filters.batch_id ? [filters.batch_id] : [])
        );
      }
      return q;
    },
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'First Name', accessor: 'first_name' },
      { header: 'Last Name', accessor: 'last_name' },
      { header: 'Mobile', accessor: 'mobile' },
      { header: 'Status', accessor: 'status' },
    ],
  },

  /* =============================================================
   * 3. BATCH CAPACITY UTILISATION
   * ============================================================= */
  batch_capacity: {
    id: 'batch_capacity',
    title: 'Batch Capacity Utilisation',
    description: 'Shows enrolled / capacity for each batch',
    useLetterhead: true,
    fields: ['course_id', 'batch_id'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('batches')
        .select(`id, batch_name, capacity, student_batches(count)`)
        .eq('student_batches.status', 'active');

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);

      return q;
    },
    transform: (data) => data.map(b => ({
      batch: b.batch_name,
      capacity: b.capacity,
      enrolled: b.student_batches?.[0]?.count || 0,
      available: b.capacity - (b.student_batches?.[0]?.count || 0),
      utilisation: (((b.student_batches?.[0]?.count || 0) / b.capacity) * 100).toFixed(1) + '%',
    })),
    columns: [
      { header: 'Batch', accessor: 'batch' },
      { header: 'Capacity', accessor: 'capacity' },
      { header: 'Enrolled', accessor: 'enrolled' },
      { header: 'Available', accessor: 'available' },
      { header: 'Utilisation', accessor: 'utilisation' },
    ],
    chartConfig: { type: 'bar', dataKey: 'enrolled', labelKey: 'batch' },
  },

  /* =============================================================
   * 4. STUDENT‑PARENT MAPPING
   * ============================================================= */
  student_parents: {
    id: 'student_parents',
    title: 'Student‑Parent Mapping',
    description: 'Shows parent details for each student',
    useLetterhead: true,
    fields: ['student_name'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase.from('student_parents').select(`
        relation,
        students!inner( admission_no, first_name, last_name ),
        parents!inner( father_name, mother_name, mobile, email )
      `);

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed

      return q;
    },
    transform: (data) => data.map(r => ({
      admission_no: r.students.admission_no,
      student: `${r.students.first_name} ${r.students.last_name}`,
      father: r.parents.father_name,
      mother: r.parents.mother_name,
      mobile: r.parents.mobile,
      email: r.parents.email,
      relation: r.relation,
    })),
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Father', accessor: 'father' },
      { header: 'Mother', accessor: 'mother' },
      { header: 'Mobile', accessor: 'mobile' },
      { header: 'Email', accessor: 'email' },
      { header: 'Relation', accessor: 'relation' },
    ],
  },

  /* =============================================================
   * 5. INQUIRY CONVERSION REPORT
   * ============================================================= */
  inquiry_conversion: {
    id: 'inquiry_conversion',
    title: 'Inquiry Conversion Report',
    description: 'Inquiries grouped by status or source',
    useLetterhead: true,
    fields: ['status', 'source', 'start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('inquiries')
        .select('*')
        .gte('created_at', filters.start_date)
        .lte('created_at', filters.end_date);

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.source) q = q.eq('source', filters.source);

      return q;
    },
    columns: [
      { header: 'Inquiry No', accessor: 'inquiry_no' },
      { header: 'Student Name', accessor: 'student_name' },
      { header: 'Parent', accessor: 'parent_name' },
      { header: 'Mobile', accessor: 'mobile' },
      { header: 'Course', accessor: 'interested_course_id' },
      { header: 'Source', accessor: 'source' },
      { header: 'Status', accessor: 'status' },
      { header: 'Follow‑up', accessor: 'followup_date' },
    ],
  },

  /* =============================================================
   * 6. STUDENT DOCUMENTS REPORT
   * ============================================================= */
  student_documents: {
    id: 'student_documents',
    title: 'Student Documents Report',
    description: 'Documents uploaded per student',
    useLetterhead: true,
    fields: ['document_type'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_documents')
        .select(`
          document_type,
          file_name,
          uploaded_at,
          students( admission_no, first_name, last_name )
        `)
        .order('uploaded_at', { ascending: false });

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.document_type) q = q.eq('document_type', filters.document_type);

      return q;
    },
    transform: (data) => data.map(r => ({
      admission_no: r.students?.admission_no,
      name: r.students ? `${r.students.first_name} ${r.students.last_name}` : '',
      document_type: r.document_type,
      file_name: r.file_name,
      uploaded: r.uploaded_at,
    })),
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'name' },
      { header: 'Type', accessor: 'document_type' },
      { header: 'File', accessor: 'file_name' },
      { header: 'Uploaded', accessor: 'uploaded' },
    ],
  },

  /* =============================================================
   * 7. ATTENDANCE SUMMARY (BATCH‑WISE)
   * ============================================================= */
  attendance_summary: {
    id: 'attendance_summary',
    title: 'Attendance Summary (Batch)',
    description: 'Total present/absent sessions per batch',
    useLetterhead: true,
    fields: ['start_date', 'end_date', 'batch_id'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_attendance')
        .select(`
          status,
          attendance_sessions!inner( attendance_date, batch_id )
        `)
        .gte('attendance_sessions.attendance_date', filters.start_date)
        .lte('attendance_sessions.attendance_date', filters.end_date);

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.batch_id) q = q.eq('attendance_sessions.batch_id', filters.batch_id);

      return q;
    },
    transform: (raw) => {
      const map = {};
      raw.forEach(r => {
        const bid = r.attendance_sessions.batch_id;
        if (!map[bid]) map[bid] = { batch_id: bid, total: 0, present: 0 };
        map[bid].total++;
        if (r.status === 'Present') map[bid].present++;
      });
      return Object.values(map).map(b => ({
        batch: `Batch ${b.batch_id}`,
        total_sessions: b.total,
        present: b.present,
        absent: b.total - b.present,
        percentage: ((b.present / b.total) * 100).toFixed(1),
      }));
    },
    columns: [
      { header: 'Batch', accessor: 'batch' },
      { header: 'Total Sessions', accessor: 'total_sessions' },
      { header: 'Present', accessor: 'present' },
      { header: 'Absent', accessor: 'absent' },
      { header: 'Attendance %', accessor: 'percentage' },
    ],
    chartConfig: { type: 'bar', dataKey: 'percentage', labelKey: 'batch' },
  },

  /* =============================================================
   * 8. STUDENT ATTENDANCE PERCENTAGE
   * ============================================================= */
  student_attendance_pct: {
    id: 'student_attendance_pct',
    title: 'Student Attendance Percentage',
    description: 'Each student’s attendance % in a batch over a period',
    useLetterhead: true,
    fields: ['batch_id', 'start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_attendance')
        .select(`
          status,
          student_id,
          students( admission_no, first_name, last_name ),
          attendance_sessions!inner( attendance_date, batch_id )
        `)
        .gte('attendance_sessions.attendance_date', filters.start_date)
        .lte('attendance_sessions.attendance_date', filters.end_date);

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.batch_id) q = q.eq('attendance_sessions.batch_id', filters.batch_id);

      return q;
    },
    transform: (raw) => {
      const map = {};
      raw.forEach(r => {
        const sid = r.student_id;
        if (!map[sid]) {
          map[sid] = {
            student_id: sid,
            admission_no: r.students.admission_no,
            name: `${r.students.first_name} ${r.students.last_name}`,
            total: 0,
            present: 0,
          };
        }
        map[sid].total++;
        if (r.status === 'Present') map[sid].present++;
      });
      return Object.values(map).map(s => ({
        admission_no: s.admission_no,
        student: s.name,
        total: s.total,
        present: s.present,
        absent: s.total - s.present,
        percentage: ((s.present / s.total) * 100).toFixed(1),
      }));
    },
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Total', accessor: 'total' },
      { header: 'Present', accessor: 'present' },
      { header: 'Absent', accessor: 'absent' },
      { header: '%', accessor: 'percentage' },
    ],
  },

  /* =============================================================
   * 9. HOMEWORK SUBMISSION REPORT
   * ============================================================= */
  homework_submissions: {
    id: 'homework_submissions',
    title: 'Homework Submission Report',
    description: 'Submission status per homework / student',
    useLetterhead: true,
    fields: ['batch_id', 'status', 'start_date', 'end_date'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('homework_submissions')
        .select(`
          submitted_at, status, marks,
          homework!inner( title, assigned_date, batch_id ),
          students!inner( admission_no, first_name, last_name )
        `)
        .order('submitted_at', { ascending: false });

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.batch_id) q = q.eq('homework.batch_id', filters.batch_id);
      if (filters.start_date) q = q.gte('homework.assigned_date', filters.start_date);
      if (filters.end_date) q = q.lte('homework.assigned_date', filters.end_date);

      return q;
    },
    transform: (data) => data.map(r => ({
      homework: r.homework.title,
      assigned: r.homework.assigned_date,
      student: `${r.students.first_name} ${r.students.last_name}`,
      admission_no: r.students.admission_no,
      submitted: r.submitted_at,
      marks: r.marks,
      status: r.status,
    })),
    columns: [
      { header: 'Homework', accessor: 'homework' },
      { header: 'Assigned', accessor: 'assigned' },
      { header: 'Student', accessor: 'student' },
      { header: 'Adm No', accessor: 'admission_no' },
      { header: 'Submitted', accessor: 'submitted' },
      { header: 'Marks', accessor: 'marks' },
      { header: 'Status', accessor: 'status' },
    ],
  },

  /* =============================================================
   * 10. EXAM RESULTS – BATCH / SUBJECT
   * ============================================================= */
  exam_results: {
    id: 'exam_results',
    title: 'Exam Results',
    description: 'Marks obtained by each student per exam',
    useLetterhead: true,
    fields: ['exam_id', 'batch_id'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_results')
        .select(`
          marks_obtained,
          exams!inner( exam_name, exam_date, batch_id ),
          students!inner( admission_no, first_name, last_name )
        `)
        .order('marks_obtained', { ascending: false });

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.exam_id) q = q.eq('exam_id', filters.exam_id);
      if (filters.batch_id) q = q.eq('exams.batch_id', filters.batch_id);

      return q;
    },
    transform: (data) => data.map(r => ({
      exam: r.exams.exam_name,
      date: r.exams.exam_date,
      student: `${r.students.first_name} ${r.students.last_name}`,
      admission_no: r.students.admission_no,
      marks: r.marks_obtained,
    })),
    columns: [
      { header: 'Exam', accessor: 'exam' },
      { header: 'Date', accessor: 'date' },
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Marks', accessor: 'marks', aggregate: 'avg' },
    ],
    aggregateRow: true,
  },

  /* =============================================================
   * 11. STUDENT PROGRESS REPORT
   * ============================================================= */
  student_progress: {
    id: 'student_progress',
    title: 'Student Progress Report',
    description: 'Attendance & performance scores from student_progress table',
    useLetterhead: true,
    fields: ['batch_id', 'start_date', 'end_date'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_progress')
        .select(`
          evaluation_date, attendance_percentage, performance_score, teacher_remarks,
          students( admission_no, first_name, last_name ),
          batches( batch_name )
        `)
        .order('evaluation_date', { ascending: false });

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.batch_id) q = q.eq('batch_id', filters.batch_id);
      if (filters.start_date) q = q.gte('evaluation_date', filters.start_date);
      if (filters.end_date) q = q.lte('evaluation_date', filters.end_date);

      return q;
    },
    transform: (data) => data.map(r => ({
      date: r.evaluation_date,
      student: `${r.students.first_name} ${r.students.last_name}`,
      admission_no: r.students.admission_no,
      batch: r.batches?.batch_name,
      attendance_pct: r.attendance_percentage,
      performance: r.performance_score,
      remarks: r.teacher_remarks,
    })),
    columns: [
      { header: 'Date', accessor: 'date' },
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Batch', accessor: 'batch' },
      { header: 'Att %', accessor: 'attendance_pct' },
      { header: 'Score', accessor: 'performance', aggregate: 'avg' },
      { header: 'Remarks', accessor: 'remarks' },
    ],
    aggregateRow: true,
  },

  /* =============================================================
   * 12. ONLINE CLASS ATTENDANCE
   * ============================================================= */
  online_class_attendance: {
    id: 'online_class_attendance',
    title: 'Online Class Attendance',
    description: 'Who joined which online class and for how long',
    useLetterhead: true,
    fields: ['class_id', 'start_date', 'end_date'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('online_class_attendance')
        .select(`
          joined_at, left_at, duration_seconds, attended,
          online_classes!inner( title, start_time ),
          students!inner( admission_no, first_name, last_name )
        `)
        .order('joined_at');

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.class_id) q = q.eq('class_id', filters.class_id);
      if (filters.start_date) q = q.gte('online_classes.start_time', filters.start_date);
      if (filters.end_date) q = q.lte('online_classes.start_time', filters.end_date);

      return q;
    },
    transform: (data) => data.map(r => ({
      class: r.online_classes.title,
      class_time: r.online_classes.start_time,
      student: `${r.students.first_name} ${r.students.last_name}`,
      admission_no: r.students.admission_no,
      joined: r.joined_at,
      left: r.left_at,
      duration_sec: r.duration_seconds,
      attended: r.attended ? 'Yes' : 'No',
    })),
    columns: [
      { header: 'Class', accessor: 'class' },
      { header: 'Class Time', accessor: 'class_time' },
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Joined', accessor: 'joined' },
      { header: 'Left', accessor: 'left' },
      { header: 'Duration (s)', accessor: 'duration_sec' },
      { header: 'Attended', accessor: 'attended' },
    ],
  },

  /* =============================================================
   * 13. FEE COLLECTION REPORT
   * ============================================================= */
  fee_collection: {
    id: 'fee_collection',
    title: 'Fee Collection Report',
    description: 'Payments collected in a date range, with course breakdown and tax',
    useLetterhead: true,
    fields: ['start_date', 'end_date', 'course_id'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('fee_payments')
        .select(`
          payment_date, amount, payment_mode,
          student_fees!inner(
            base_amount, tax_amount, final_fee,
            students!inner( admission_no, first_name, last_name ),
            fee_structures!inner(
              courses( course_name )
            )
          )
        `)
        .gte('payment_date', filters.start_date)
        .lte('payment_date', filters.end_date)
        .order('payment_date');

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.course_id) q = q.eq('student_fees.fee_structures.course_id', filters.course_id);

      return q;
    },
    transform: (data) => data.map(r => ({
      date: r.payment_date,
      admission_no: r.student_fees.students.admission_no,
      student: `${r.student_fees.students.first_name} ${r.student_fees.students.last_name}`,
      course: r.student_fees.fee_structures?.courses?.course_name || '',
      base: r.student_fees.base_amount,
      tax: r.student_fees.tax_amount,
      total: r.student_fees.final_fee,
      paid: r.amount,
      mode: r.payment_mode,
    })),
    columns: [
      { header: 'Date', accessor: 'date' },
      { header: 'Adm No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Course', accessor: 'course' },
      { header: 'Base', accessor: 'base' },
      { header: 'Tax', accessor: 'tax' },
      { header: 'Total Fee', accessor: 'total' },
      { header: 'Paid', accessor: 'paid', aggregate: 'sum' },
      { header: 'Mode', accessor: 'mode' },
    ],
    aggregateRow: true,
    chartConfig: { type: 'bar', dataKey: 'paid', labelKey: 'course' },
  },

  /* =============================================================
   * 14. PENDING FEES REPORT
   * ============================================================= */
  pending_fees: {
    id: 'pending_fees',
    title: 'Pending Fees Report',
    description: 'Students with outstanding balance (status != Paid)',
    useLetterhead: true,
    fields: ['course_id'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_fees')
        .select(`
          final_fee, status,
          students!inner( admission_no, first_name, last_name ),
          fee_structures!inner(
            courses( course_name )
          )
        `)
        .neq('status', 'Paid')
        .is('deleted_at', null);

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.course_id) q = q.eq('fee_structures.course_id', filters.course_id);

      return q;
    },
    transform: (data) => data.map(r => ({
      admission_no: r.students.admission_no,
      student: `${r.students.first_name} ${r.students.last_name}`,
      course: r.fee_structures?.courses?.course_name || '',
      total_fee: r.final_fee,
      status: r.status,
    })),
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Course', accessor: 'course' },
      { header: 'Total Fee', accessor: 'total_fee', aggregate: 'sum' },
      { header: 'Status', accessor: 'status' },
    ],
    aggregateRow: true,
  },

  /* =============================================================
   * 15. INCOME STATEMENT
   * ============================================================= */
  income_statement: {
    id: 'income_statement',
    title: 'Income Statement',
    description: 'Income records with tax breakdown',
    useLetterhead: true,
    fields: ['start_date', 'end_date', 'category'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('income')
        .select('*')
        .gte('income_date', filters.start_date)
        .lte('income_date', filters.end_date)
        .order('income_date');

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      if (filters.category) q = q.eq('category', filters.category);

      return q;
    },
    columns: [
      { header: 'Date', accessor: 'income_date' },
      { header: 'Category', accessor: 'category' },
      { header: 'Base Amount', accessor: 'base_amount' },
      { header: 'Tax Amount', accessor: 'tax_amount' },
      { header: 'Amount', accessor: 'amount', aggregate: 'sum' },
      { header: 'Mode', accessor: 'payment_mode' },
      { header: 'Description', accessor: 'description' },
    ],
    aggregateRow: true,
    chartConfig: { type: 'bar', dataKey: 'amount', labelKey: 'category' },
  },

  /* =============================================================
   * 16. EXPENSE STATEMENT
   * ============================================================= */
  expense_statement: {
    id: 'expense_statement',
    title: 'Expense Statement',
    description: 'Expenses filtered by category / date',
    useLetterhead: true,
    fields: ['start_date', 'end_date', 'category'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', filters.start_date)
        .lte('expense_date', filters.end_date)
        .order('expense_date');

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      if (filters.category) q = q.eq('category', filters.category);

      return q;
    },
    columns: [
      { header: 'Date', accessor: 'expense_date' },
      { header: 'Category', accessor: 'category' },
      { header: 'Amount', accessor: 'amount', aggregate: 'sum' },
      { header: 'Payment Mode', accessor: 'payment_mode' },
      { header: 'Description', accessor: 'description' },
      { header: 'Bill No', accessor: 'bill_number' },
    ],
    aggregateRow: true,
    chartConfig: { type: 'bar', dataKey: 'amount', labelKey: 'category' },
  },

  /* =============================================================
   * 17. PROFIT & LOSS (summary)
   * ============================================================= */
  profit_loss_summary: {
    id: 'profit_loss_summary',
    title: 'Profit & Loss Summary',
    description: 'Total income vs expenses for a period',
    useLetterhead: true,
    fields: ['start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) =>
      Promise.all([
        supabase
          .from('income')
          .select('amount')
          .gte('income_date', filters.start_date)
          .lte('income_date', filters.end_date)
          .then(({ data }) => {
            let q = supabase.from('income').select('amount');
            if (branchId) q = q.eq('branch_id', branchId);
            if (financialYearId) q = q.eq('financial_year_id', financialYearId);
            return q.gte('income_date', filters.start_date).lte('income_date', filters.end_date);
          })
          .then(({ data }) => data.reduce((s, r) => s + parseFloat(r.amount), 0)),
        supabase
          .from('expenses')
          .select('amount')
          .then(({ data }) => {
            let q = supabase.from('expenses').select('amount');
            if (branchId) q = q.eq('branch_id', branchId);
            if (financialYearId) q = q.eq('financial_year_id', financialYearId);
            return q.gte('expense_date', filters.start_date).lte('expense_date', filters.end_date);
          })
          .then(({ data }) => data.reduce((s, r) => s + parseFloat(r.amount), 0)),
      ]).then(([income, expense]) => ({
        income,
        expense,
        profit: income - expense,
      })),
    transform: (data) => [data],
    columns: [
      { header: 'Total Income', accessor: 'income' },
      { header: 'Total Expenses', accessor: 'expense' },
      { header: 'Profit', accessor: 'profit' },
    ],
  },

  /* =============================================================
   * 18. TAX COLLECTED REPORT
   * ============================================================= */
  tax_collected: {
    id: 'tax_collected',
    title: 'Tax Collected Report',
    description: 'Tax amounts from fee payments and other income for a given period',
    useLetterhead: true,
    fields: ['start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('tax_collections')
        .select('amount, category')
        .gte('collection_date', filters.start_date)
        .lte('collection_date', filters.end_date);

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);

      return q.then(({ data, error }) => {
        if (error) throw error;
        const feeTax = (data || [])
          .filter(r => r.category === 'fee_payment')
          .reduce((s, r) => s + Number(r.amount), 0);
        const otherTax = (data || [])
          .filter(r => r.category === 'income')
          .reduce((s, r) => s + Number(r.amount), 0);
        return {
          fee_tax: feeTax,
          other_tax: otherTax,
          total_tax: feeTax + otherTax,
          period: `${filters.start_date} to ${filters.end_date}`,
        };
      });
    },
    transform: (data) => [data],
    columns: [
      { header: 'Fee Tax', accessor: 'fee_tax' },
      { header: 'Income Tax', accessor: 'other_tax' },
      { header: 'Total Tax', accessor: 'total_tax' },
      { header: 'Period', accessor: 'period' },
    ],
  },

  /* =============================================================
   * 19. RECEIPTS JOURNAL
   * ============================================================= */
  receipts_journal: {
    id: 'receipts_journal',
    title: 'Receipts Journal',
    description: 'All receipts issued within a date range',
    useLetterhead: true,
    fields: ['start_date', 'end_date', 'student_id'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('receipts')
        .select(`
          receipt_no, receipt_date, amount,
          students( admission_no, first_name, last_name )
        `)
        .gte('receipt_date', filters.start_date)
        .lte('receipt_date', filters.end_date)
        .order('receipt_date');

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.student_id) q = q.eq('student_id', filters.student_id);

      return q;
    },
    transform: (data) => data.map(r => ({
      receipt_no: r.receipt_no,
      date: r.receipt_date,
      admission_no: r.students.admission_no,
      student: `${r.students.first_name} ${r.students.last_name}`,
      amount: r.amount,
    })),
    columns: [
      { header: 'Receipt No', accessor: 'receipt_no' },
      { header: 'Date', accessor: 'date' },
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Amount', accessor: 'amount', aggregate: 'sum' },
    ],
    aggregateRow: true,
  },

  /* =============================================================
   * 20. FEE INSTALMENT TRACKING
   * ============================================================= */
  fee_instalments: {
    id: 'fee_instalments',
    title: 'Fee Instalment Tracking',
    description: 'Status of all fee instalments with due dates',
    useLetterhead: true,
    fields: ['status', 'due_date_from', 'due_date_to'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('fee_installments')
        .select(`
          installment_number, amount, due_date, status,
          student_fees!inner(
            final_fee,
            students( admission_no, first_name, last_name )
          )
        `)
        .order('due_date');

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.due_date_from) q = q.gte('due_date', filters.due_date_from);
      if (filters.due_date_to) q = q.lte('due_date', filters.due_date_to);

      return q;
    },
    transform: (data) => data.map(r => ({
      student: `${r.student_fees.students.first_name} ${r.student_fees.students.last_name}`,
      admission_no: r.student_fees.students.admission_no,
      total_fee: r.student_fees.final_fee,
      inst_no: r.installment_number,
      inst_amount: r.amount,
      due_date: r.due_date,
      status: r.status,
    })),
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Total Fee', accessor: 'total_fee' },
      { header: 'Inst No', accessor: 'inst_no' },
      { header: 'Inst Amount', accessor: 'inst_amount' },
      { header: 'Due Date', accessor: 'due_date' },
      { header: 'Status', accessor: 'status' },
    ],
  },

  /* =============================================================
   * 21. TEACHER SALARY REPORT
   * ============================================================= */
  teacher_salary: {
    id: 'teacher_salary',
    title: 'Teacher Salary Report',
    description: 'Salary payments made to teachers, filtered by month/year',
    useLetterhead: true,
    fields: ['teacher_id', 'start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('salary_payments')
        .select(`
          payment_date, amount, payment_mode, remarks,
          teachers!inner( employee_code, first_name, last_name )
        `)
        .gte('payment_date', filters.start_date)
        .lte('payment_date', filters.end_date)
        .order('payment_date');

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.teacher_id) q = q.eq('teacher_id', filters.teacher_id);

      return q;
    },
    transform: (data) => data.map(r => ({
      date: r.payment_date,
      employee_code: r.teachers.employee_code,
      teacher: `${r.teachers.first_name} ${r.teachers.last_name}`,
      amount: r.amount,
      mode: r.payment_mode,
      remarks: r.remarks,
    })),
    columns: [
      { header: 'Date', accessor: 'date' },
      { header: 'Emp Code', accessor: 'employee_code' },
      { header: 'Teacher', accessor: 'teacher' },
      { header: 'Amount', accessor: 'amount', aggregate: 'sum' },
      { header: 'Mode', accessor: 'mode' },
      { header: 'Remarks', accessor: 'remarks' },
    ],
    aggregateRow: true,
    chartConfig: { type: 'bar', dataKey: 'amount', labelKey: 'teacher' },
  },

  /* =============================================================
   * 22. TEACHER WORKLOAD REPORT
   * ============================================================= */
  teacher_workload: {
    id: 'teacher_workload',
    title: 'Teacher Workload Report',
    description: 'How many batches, courses, levels, and subjects each teacher handles',
    useLetterhead: true,
    fields: [],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase.from('teachers').select(`
        employee_code, first_name, last_name,
        teacher_batches ( batch_id ),
        teacher_courses ( course_id ),
        teacher_course_levels ( course_level_id ),
        teacher_subjects ( subject_id )
      `);

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);

      return q;
    },
    transform: (data) => data.map(t => ({
      name: `${t.first_name} ${t.last_name}`,
      emp_code: t.employee_code,
      batches: t.teacher_batches.length,
      courses: t.teacher_courses.length,
      levels: t.teacher_course_levels.length,
      subjects: t.teacher_subjects.length,
    })),
    columns: [
      { header: 'Employee Code', accessor: 'emp_code' },
      { header: 'Teacher', accessor: 'name' },
      { header: 'Batches', accessor: 'batches' },
      { header: 'Courses', accessor: 'courses' },
      { header: 'Levels', accessor: 'levels' },
      { header: 'Subjects', accessor: 'subjects' },
    ],
  },

  /* =============================================================
   * 23. CERTIFICATE ISSUED REPORT
   * ============================================================= */
  certificates_issued: {
    id: 'certificates_issued',
    title: 'Certificate Issued Report',
    description: 'All certificates issued with student and course details',
    useLetterhead: true,
    fields: ['start_date', 'end_date', 'course_id'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('certificates')
        .select(`
          certificate_no, issue_date, certificate_url,
          students( admission_no, first_name, last_name ),
          courses( course_name ),
          course_levels( level_name )
        `)
        .gte('issue_date', filters.start_date)
        .lte('issue_date', filters.end_date)
        .order('issue_date');

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.course_id) q = q.eq('course_id', filters.course_id);

      return q;
    },
    transform: (data) => data.map(r => ({
      cert_no: r.certificate_no,
      date: r.issue_date,
      admission_no: r.students.admission_no,
      student: `${r.students.first_name} ${r.students.last_name}`,
      course: r.courses.course_name,
      level: r.course_levels?.level_name,
      url: r.certificate_url,
    })),
    columns: [
      { header: 'Certificate No', accessor: 'cert_no' },
      { header: 'Issue Date', accessor: 'date' },
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Course', accessor: 'course' },
      { header: 'Level', accessor: 'level' },
      { header: 'Link', accessor: 'url' },
    ],
  },

  /* =============================================================
   * 24. STUDENT LEVEL COMPLETION REPORT
   * ============================================================= */
  student_level_completion: {
    id: 'student_level_completion',
    title: 'Student Level Completion',
    description: 'Progress through course levels with grades',
    useLetterhead: true,
    fields: ['course_id', 'level_id'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_level_progress')
        .select(`
          start_date, completion_date, marks, grade, result,
          students( admission_no, first_name, last_name ),
          course_levels( level_name ),
          courses( course_name )
        `)
        .order('completion_date', { ascending: false });

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.course_id) q = q.eq('course_id', filters.course_id);
      if (filters.level_id) q = q.eq('level_id', filters.level_id);

      return q;
    },
    transform: (data) => data.map(r => ({
      admission_no: r.students.admission_no,
      student: `${r.students.first_name} ${r.students.last_name}`,
      course: r.courses.course_name,
      level: r.course_levels.level_name,
      start: r.start_date,
      completed: r.completion_date,
      marks: r.marks,
      grade: r.grade,
      result: r.result,
    })),
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Course', accessor: 'course' },
      { header: 'Level', accessor: 'level' },
      { header: 'Started', accessor: 'start' },
      { header: 'Completed', accessor: 'completed' },
      { header: 'Marks', accessor: 'marks' },
      { header: 'Grade', accessor: 'grade' },
      { header: 'Result', accessor: 'result' },
    ],
  },

  /* =============================================================
   * 25. STUDENT CONTACT DIRECTORY
   * ============================================================= */
  student_contact_directory: {
    id: 'student_contact_directory',
    title: 'Student Contact Directory',
    description: 'Professional contact list with admission, guardian, medium and status details',
    useLetterhead: true,
    fields: ['status', 'medium_id'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('students')
        .select(`
          admission_no, first_name, last_name, mobile, email, gender, status,
          mediums(name),
          student_parents(parents(father_name, mother_name, mobile, email))
        `)
        .order('first_name');

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.medium_id) q = q.eq('medium_id', filters.medium_id);

      return q;
    },
    transform: (data) => data.map((s) => {
      const parent = s.student_parents?.[0]?.parents || {};
      return {
        admission_no: s.admission_no,
        student: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
        gender: s.gender || '',
        mobile: s.mobile || '',
        email: s.email || '',
        guardian: parent.father_name || parent.mother_name || '',
        guardian_mobile: parent.mobile || '',
        medium: s.mediums?.name || '',
        status: s.status || '',
      };
    }),
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Gender', accessor: 'gender' },
      { header: 'Mobile', accessor: 'mobile' },
      { header: 'Email', accessor: 'email' },
      { header: 'Guardian', accessor: 'guardian' },
      { header: 'Guardian Mobile', accessor: 'guardian_mobile' },
      { header: 'Medium', accessor: 'medium' },
      { header: 'Status', accessor: 'status' },
    ],
  },

  /* =============================================================
   * 26. ADMISSION PIPELINE
   * ============================================================= */
admission_pipeline: {
  id: 'admission_pipeline',
  title: 'Admission Pipeline',
  description: 'Lead pipeline with follow-up dates, source, status and interested course',
  useLetterhead: true,
  fields: ['status', 'source', 'start_date', 'end_date'],
  defaultFilters: () => ({
    start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  }),
  queryBuilder: (filters, branchId, financialYearId) => {
    console.log('Pipeline Query - branchId:', branchId, 'FY:', financialYearId, 'filters:', filters);
    
    let q = supabase
      .from('inquiries')
      .select(`
        inquiry_no, student_name, parent_name, mobile, source, status,
        followup_date, created_at,
        courses(course_name)
      `)
      .is('deleted_at', null) // ✅ exclude deleted
      .order('followup_date', { ascending: true });

    // ✅ Date filters with time range
    if (filters.start_date) {
      q = q.gte('created_at', filters.start_date + 'T00:00:00');
    }
    if (filters.end_date) {
      q = q.lte('created_at', filters.end_date + 'T23:59:59');
    }

    if (branchId) q = q.eq('branch_id', branchId);
    if (financialYearId) q = q.eq('financial_year_id', financialYearId);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.source) q = q.eq('source', filters.source);

    console.log('Final query URL:', q.url.toString());
    return q;
  },
  columns: [
    { header: 'Inquiry No', accessor: 'inquiry_no' },
    { header: 'Created', accessor: 'created' },
    { header: 'Student', accessor: 'student' },
    { header: 'Parent', accessor: 'parent' },
    { header: 'Mobile', accessor: 'mobile' },
    { header: 'Course', accessor: 'course' },
    { header: 'Source', accessor: 'source' },
    { header: 'Status', accessor: 'status' },
    { header: 'Follow-up', accessor: 'followup' },
  ],
  pdfConfig: {
    orientation: 'landscape',
    includeLetterhead: false,
    showHeader: true,
    showFooter: true,
    pageSize: 'a4',
    fontSize: 8,
    headerFontSize: 14,
    footerFontSize: 8,
  },
},

  /* =============================================================
   * 27. FEE AGING ANALYSIS
   * ============================================================= */
  fee_aging_analysis: {
    id: 'fee_aging_analysis',
    title: 'Fee Aging Analysis',
    description: 'Outstanding student balances grouped by age since fee creation',
    useLetterhead: true,
    fields: ['status', 'course_id', 'medium_id'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_fees')
        .select(`
          id, final_fee, status, created_at,
          students(admission_no, first_name, last_name),
          fee_payments(amount),
          fee_structures(courses(course_name, medium_id, mediums(name)))
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.status) q = q.eq('status', filters.status);
      if (filters.course_id) q = q.eq('fee_structures.courses.id', filters.course_id);
      if (filters.medium_id) q = q.eq('fee_structures.courses.medium_id', filters.medium_id);

      return q;
    },
    transform: (data) => {
      const now = new Date();
      return data.map((fee) => {
        const paid = fee.fee_payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
        const balance = Math.max(Number(fee.final_fee || 0) - paid, 0);
        const created = fee.created_at ? new Date(fee.created_at) : now;
        const ageDays = Math.max(0, Math.floor((now - created) / 86400000));
        const ageBucket =
          ageDays <= 30 ? '0-30 days' :
          ageDays <= 60 ? '31-60 days' :
          ageDays <= 90 ? '61-90 days' :
          '90+ days';
        return {
          admission_no: fee.students?.admission_no || '',
          student: `${fee.students?.first_name || ''} ${fee.students?.last_name || ''}`.trim(),
          course: fee.fee_structures?.courses?.course_name || '',
          medium: fee.fee_structures?.courses?.mediums?.name || '',
          final_fee: Number(fee.final_fee || 0),
          paid,
          balance,
          status: fee.status,
          age_days: ageDays,
          age_bucket: ageBucket,
        };
      }).filter((row) => row.balance > 0);
    },
    columns: [
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Student', accessor: 'student' },
      { header: 'Course', accessor: 'course' },
      { header: 'Medium', accessor: 'medium' },
      { header: 'Final Fee', accessor: 'final_fee', aggregate: 'sum' },
      { header: 'Paid', accessor: 'paid', aggregate: 'sum' },
      { header: 'Balance', accessor: 'balance', aggregate: 'sum' },
      { header: 'Status', accessor: 'status' },
      { header: 'Age Days', accessor: 'age_days' },
      { header: 'Age Bucket', accessor: 'age_bucket' },
    ],
    aggregateRow: true,
    chartConfig: { type: 'bar', dataKey: 'balance', labelKey: 'student' },
  },

  /* =============================================================
   * 28. PAYMENT MODE SUMMARY
   * ============================================================= */
  payment_mode_summary: {
    id: 'payment_mode_summary',
    title: 'Payment Mode Summary',
    description: 'Fee collections grouped by cash, UPI, bank transfer, cheque and other modes',
    useLetterhead: true,
    fields: ['start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('fee_payments')
        .select('payment_date, payment_mode, amount, status')
        .gte('payment_date', filters.start_date)
        .lte('payment_date', filters.end_date);

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed

      return q;
    },
    transform: (data) => {
      const map = {};
      data.forEach((p) => {
        const mode = p.payment_mode || 'Unspecified';
        if (!map[mode]) map[mode] = { mode, transactions: 0, amount: 0, pending: 0 };
        map[mode].transactions += 1;
        map[mode].amount += Number(p.amount || 0);
        if ((p.status || '').toLowerCase() === 'pending') map[mode].pending += 1;
      });
      return Object.values(map);
    },
    columns: [
      { header: 'Payment Mode', accessor: 'mode' },
      { header: 'Transactions', accessor: 'transactions', aggregate: 'sum' },
      { header: 'Amount', accessor: 'amount', aggregate: 'sum' },
      { header: 'Pending Items', accessor: 'pending', aggregate: 'sum' },
    ],
    aggregateRow: true,
    chartConfig: { type: 'bar', dataKey: 'amount', labelKey: 'mode' },
  },

  /* =============================================================
   * 29. DAILY CASHBOOK
   * ============================================================= */
  daily_cashbook: {
    id: 'daily_cashbook',
    title: 'Daily Cashbook',
    description: 'Daily inflow, outflow and net cash movement from fees, income and expenses',
    useLetterhead: true,
    fields: ['start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      const buildQuery = (table, dateCol, amountCol) => {
        let q = supabase.from(table).select(`${dateCol}, ${amountCol}`)
          .gte(dateCol, filters.start_date)
          .lte(dateCol, filters.end_date);
        if (branchId) q = q.eq('branch_id', branchId);
        if (financialYearId) q = q.eq('financial_year_id', financialYearId);
        return q;
      };

      const incomes = buildQuery('income', 'income_date', 'amount')
        .then(({ data }) => (data || []).map(r => ({ date: r.income_date, inflow: Number(r.amount || 0), outflow: 0 })));

      const fees = buildQuery('fee_payments', 'payment_date', 'amount')
        .then(({ data }) => (data || []).map(r => ({ date: r.payment_date, inflow: Number(r.amount || 0), outflow: 0 })));

      const expenses = buildQuery('expenses', 'expense_date', 'amount')
        .then(({ data }) => (data || []).map(r => ({ date: r.expense_date, inflow: 0, outflow: Number(r.amount || 0) })));

      return Promise.all([incomes, fees, expenses]).then((parts) => parts.flat());
    },
    transform: (data) => {
      const map = {};
      data.forEach((row) => {
        if (!map[row.date]) map[row.date] = { date: row.date, inflow: 0, outflow: 0, net: 0 };
        map[row.date].inflow += row.inflow;
        map[row.date].outflow += row.outflow;
      });
      return Object.values(map)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((row) => ({ ...row, net: row.inflow - row.outflow }));
    },
    columns: [
      { header: 'Date', accessor: 'date' },
      { header: 'Total Inflow', accessor: 'inflow', aggregate: 'sum' },
      { header: 'Total Outflow', accessor: 'outflow', aggregate: 'sum' },
      { header: 'Net Movement', accessor: 'net', aggregate: 'sum' },
    ],
    aggregateRow: true,
    chartConfig: { type: 'bar', dataKey: 'net', labelKey: 'date' },
  },

  /* =============================================================
   * 30. EXPENSE CATEGORY SUMMARY
   * ============================================================= */
  expense_category_summary: {
    id: 'expense_category_summary',
    title: 'Expense Category Summary',
    description: 'Expense spend grouped by category with transaction counts',
    useLetterhead: true,
    fields: ['start_date', 'end_date', 'category'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('expenses')
        .select('expense_date, category, amount')
        .gte('expense_date', filters.start_date)
        .lte('expense_date', filters.end_date);

      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      if (filters.category) q = q.eq('category', filters.category);

      return q;
    },
    transform: (data) => {
      const map = {};
      data.forEach((e) => {
        const category = e.category || 'Uncategorised';
        if (!map[category]) map[category] = { category, transactions: 0, amount: 0 };
        map[category].transactions += 1;
        map[category].amount += Number(e.amount || 0);
      });
      return Object.values(map).sort((a, b) => b.amount - a.amount);
    },
    columns: [
      { header: 'Category', accessor: 'category' },
      { header: 'Transactions', accessor: 'transactions', aggregate: 'sum' },
      { header: 'Amount', accessor: 'amount', aggregate: 'sum' },
    ],
    aggregateRow: true,
    chartConfig: { type: 'bar', dataKey: 'amount', labelKey: 'category' },
  },

  /* =============================================================
   * 31. TEACHER LEAVE SUMMARY
   * ============================================================= */
  teacher_leave_summary: {
    id: 'teacher_leave_summary',
    title: 'Teacher Leave Summary',
    description: 'Teacher leave requests with date range, status and reason',
    useLetterhead: true,
    fields: ['teacher_id', 'status', 'start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('leaves')
        .select(`
          start_date, end_date, status, reason,
          teachers(employee_code, first_name, last_name)
        `)
        .gte('start_date', filters.start_date)
        .lte('start_date', filters.end_date)
        .order('start_date', { ascending: false });

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.teacher_id) q = q.eq('teacher_id', filters.teacher_id);
      if (filters.status) q = q.eq('status', filters.status);

      return q;
    },
    transform: (data) => data.map((l) => {
      const start = l.start_date ? new Date(l.start_date) : null;
      const end = l.end_date ? new Date(l.end_date) : start;
      const days = start && end ? Math.max(1, Math.floor((end - start) / 86400000) + 1) : 0;
      return {
        employee_code: l.teachers?.employee_code || '',
        teacher: `${l.teachers?.first_name || ''} ${l.teachers?.last_name || ''}`.trim(),
        start_date: l.start_date,
        end_date: l.end_date,
        days,
        status: l.status,
        reason: l.reason,
      };
    }),
    columns: [
      { header: 'Emp Code', accessor: 'employee_code' },
      { header: 'Teacher', accessor: 'teacher' },
      { header: 'Start Date', accessor: 'start_date' },
      { header: 'End Date', accessor: 'end_date' },
      { header: 'Days', accessor: 'days', aggregate: 'sum' },
      { header: 'Status', accessor: 'status' },
      { header: 'Reason', accessor: 'reason' },
    ],
    aggregateRow: true,
  },

  /* =============================================================
   * 32. BATCH SCHEDULE REPORT
   * ============================================================= */
  batch_schedule_report: {
    id: 'batch_schedule_report',
    title: 'Batch Schedule Report',
    description: 'Batch timings, course, medium and assigned teachers',
    useLetterhead: true,
    fields: ['course_id', 'medium_id', 'batch_id'],
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('batches')
        .select(`
          id, batch_name, days, start_time, end_time, capacity, status,
          courses(course_name),
          mediums(name),
          batch_teachers(teachers(first_name, last_name))
        `)
        .order('batch_name');

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.batch_id) q = q.eq('id', filters.batch_id);
      if (filters.course_id) q = q.eq('course_id', filters.course_id);
      if (filters.medium_id) q = q.eq('medium_id', filters.medium_id);

      return q;
    },
    transform: (data) => data.map((b) => ({
      batch: b.batch_name,
      course: b.courses?.course_name || '',
      medium: b.mediums?.name || '',
      days: b.days || '',
      time: `${b.start_time || ''} - ${b.end_time || ''}`,
      capacity: b.capacity || '',
      teachers: (b.batch_teachers || [])
        .map((bt) => `${bt.teachers?.first_name || ''} ${bt.teachers?.last_name || ''}`.trim())
        .filter(Boolean)
        .join(', '),
      status: b.status || '',
    })),
    columns: [
      { header: 'Batch', accessor: 'batch' },
      { header: 'Course', accessor: 'course' },
      { header: 'Medium', accessor: 'medium' },
      { header: 'Days', accessor: 'days' },
      { header: 'Time', accessor: 'time' },
      { header: 'Capacity', accessor: 'capacity' },
      { header: 'Teachers', accessor: 'teachers' },
      { header: 'Status', accessor: 'status' },
    ],
  },

  // ─────────────────────────────────────────
  // STUDENT‑WISE ATTENDANCE REPORT
  // ─────────────────────────────────────────
  student_attendance_detail: {
    id: 'student_attendance_detail',
    title: 'Student‑wise Attendance Report',
    description: 'Detailed attendance records per student over a chosen period',
    useLetterhead: true,
    fields: ['student_id', 'batch_id', 'start_date', 'end_date'],
    defaultFilters: () => ({
      start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      end_date: new Date().toISOString().slice(0, 10),
    }),
    queryBuilder: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('student_attendance')
        .select(`
          status,
          remarks,
          attendance_sessions!inner( attendance_date, batch_id ),
          students!inner( admission_no, first_name, last_name )
        `)
        .gte('attendance_sessions.attendance_date', filters.start_date)
        .lte('attendance_sessions.attendance_date', filters.end_date);

      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed
      if (filters.student_id) q = q.eq('student_id', filters.student_id);
      if (filters.batch_id) q = q.eq('attendance_sessions.batch_id', filters.batch_id);

      return q;
    },
    transform: (data) =>
      data
        .map(r => ({
          date: r.attendance_sessions.attendance_date,
          student: `${r.students.first_name} ${r.students.last_name}`,
          admission_no: r.students.admission_no,
          status: r.status,
          remarks: r.remarks || '—',
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    columns: [
      { header: 'Date', accessor: 'date' },
      { header: 'Student', accessor: 'student' },
      { header: 'Admission No', accessor: 'admission_no' },
      { header: 'Status', accessor: 'status' },
      { header: 'Remarks', accessor: 'remarks' },
    ],
  },

  // ========== DOCUMENT REPORTS ==========
  admission_form: {
    id: 'admission_form',
    title: 'Admission Form',
    description: 'Printable student admission form with full details',
    reportType: 'document',
    documentComponent: AdmissionFormDocument,
    fields: ['course_id', 'batch_id', 'medium_id', 'student_id'],
    recordQuery: async (filters, branchId, financialYearId) => {
      let q = supabase
        .from('students')
        .select(`
          *,
          mediums ( name ),
          student_parents ( parent_id, relation, parents ( * ) ),
          student_batches ( enrollment_date, batches ( batch_name, courses ( course_name ) ) ),
          student_fees ( final_fee, status, deleted_at, fee_payments ( amount ) )
        `);

      if (filters.student_id) q = q.eq('id', filters.student_id);
      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);

      if (filters.batch_id || filters.course_id || filters.medium_id) {
        let studentIds = null;

        if (filters.batch_id) {
          const { data } = await supabase
            .from('student_batches')
            .select('student_id')
            .eq('batch_id', filters.batch_id)
            .eq('status', 'active');
          studentIds = (data || []).map((r) => r.student_id);
        }

        if (filters.course_id) {
          const { data: batchRows } = await supabase
            .from('batches')
            .select('id')
            .eq('course_id', filters.course_id);
          const batchIds = (batchRows || []).map((b) => b.id);
          if (batchIds.length > 0) {
            const { data } = await supabase
              .from('student_batches')
              .select('student_id')
              .in('batch_id', batchIds)
              .eq('status', 'active');
            const courseIds = (data || []).map((r) => r.student_id);
            studentIds = studentIds
              ? studentIds.filter((id) => courseIds.includes(id))
              : courseIds;
          } else {
            studentIds = [];
          }
        }

        if (filters.medium_id) {
          const { data: batchRows } = await supabase
            .from('batches')
            .select('id')
            .eq('medium_id', filters.medium_id);
          const batchIds = (batchRows || []).map((b) => b.id);
          if (batchIds.length > 0) {
            const { data } = await supabase
              .from('student_batches')
              .select('student_id')
              .in('batch_id', batchIds)
              .eq('status', 'active');
            const mediumIds = (data || []).map((r) => r.student_id);
            studentIds = studentIds
              ? studentIds.filter((id) => mediumIds.includes(id))
              : mediumIds;
          } else {
            studentIds = [];
          }
        }

        if (studentIds && studentIds.length > 0) {
          q = q.in('id', studentIds);
        } else {
          return { data: [], error: null };
        }
      }

      return q.order('admission_no');
    },
    recordTransform: (row) => ({
      ...row,
      parents: row.student_parents?.map(sp => sp.parents) || [],
      batches: row.student_batches || [],
      fees: (row.student_fees || [])
        .filter(sf => !sf.deleted_at)
        .map(sf => ({
          final_fee: sf.final_fee,
          status: sf.status,
          paid: sf.fee_payments?.reduce((s, p) => s + p.amount, 0) || 0,
        })),
    }),
  },

  fee_receipt: {
    id: 'fee_receipt',
    title: 'Fee Receipt',
    description: 'Individual fee payment receipt with tax details',
    reportType: 'document',
    documentComponent: FeeReceiptDocument,
    fields: ['student_id', 'start_date', 'end_date'],
    recordQuery: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('fee_payments')
        .select(`
          *,
          student_fees!inner (
            student_id,
            base_amount,
            tax_amount,
            final_fee,
            fee_structures(
              tax_rates(name, rate),
              tax_inclusive
            ),
            students( admission_no, first_name, last_name )
          )
        `);

      if (filters.student_id) q = q.eq('student_fees.student_id', filters.student_id);
      if (filters.start_date) q = q.gte('payment_date', filters.start_date);
      if (filters.end_date) q = q.lte('payment_date', filters.end_date);
      if (branchId) q = q.eq('branch_id', branchId);                // ← fixed
      if (financialYearId) q = q.eq('financial_year_id', financialYearId); // ← fixed

      return q.order('payment_date');
    },
    recordTransform: (row) => ({
      ...row,
      base_amount: row.student_fees.base_amount,
      tax_amount: row.student_fees.tax_amount,
      final_fee: row.student_fees.final_fee,
      student_name: `${row.student_fees.students.first_name} ${row.student_fees.students.last_name}`,
      admission_no: row.student_fees.students.admission_no,
      tax_rate_name: row.student_fees.fee_structures?.tax_rates?.name || '',
      tax_rate_value: row.student_fees.fee_structures?.tax_rates?.rate || 0,
      tax_inclusive: row.student_fees.fee_structures?.tax_inclusive ?? true,
    }),
  },

  expense_receipt: {
    id: 'expense_receipt',
    title: 'Expense Receipt / Voucher',
    description: 'Printable expense receipt',
    reportType: 'document',
    documentComponent: ExpenseReceiptDocument,
    fields: ['category', 'start_date', 'end_date'],
    recordQuery: (filters, branchId, financialYearId) => {
      let q = supabase.from('expenses').select('*');
      if (filters.category) q = q.eq('category', filters.category);
      if (filters.start_date) q = q.gte('expense_date', filters.start_date);
      if (filters.end_date) q = q.lte('expense_date', filters.end_date);
      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      return q.order('expense_date');
    },
    recordTransform: (row) => row,
  },

  income_receipt: {
    id: 'income_receipt',
    title: 'Income Receipt',
    description: 'Printable income record (includes tax if applicable)',
    reportType: 'document',
    documentComponent: IncomeReceiptDocument,
    fields: ['category', 'start_date', 'end_date'],
    recordQuery: (filters, branchId, financialYearId) => {
      let q = supabase.from('income').select('*');
      if (filters.category) q = q.eq('category', filters.category);
      if (filters.start_date) q = q.gte('income_date', filters.start_date);
      if (filters.end_date) q = q.lte('income_date', filters.end_date);
      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      return q.order('income_date');
    },
    recordTransform: (row) => row,
  },

  salary_slip: {
    id: 'salary_slip',
    title: 'Salary Slip',
    description: 'Monthly salary slip for teachers',
    reportType: 'document',
    documentComponent: SalarySlipDocument,
    fields: ['teacher_id', 'start_date', 'end_date'],
    recordQuery: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('salary_payments')
        .select(`
          *,
          teachers( employee_code, first_name, last_name )
        `);
      if (filters.teacher_id) q = q.eq('teacher_id', filters.teacher_id);
      if (filters.start_date) q = q.gte('payment_date', filters.start_date);
      if (filters.end_date) q = q.lte('payment_date', filters.end_date);
      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      return q.order('payment_date');
    },
    recordTransform: (row) => ({
      ...row,
      teacher_name: `${row.teachers.first_name} ${row.teachers.last_name}`,
      employee_code: row.teachers.employee_code,
    }),
  },

  certificate_document: {
    id: 'certificate_document',
    title: 'Certificate',
    description: 'Printable course completion certificate',
    reportType: 'document',
    documentComponent: CertificateDocument,
    fields: ['student_id', 'start_date', 'end_date'],
    recordQuery: (filters, branchId, financialYearId) => {
      let q = supabase
        .from('certificates')
        .select(`
          *,
          students( admission_no, first_name, last_name ),
          courses( course_name )
        `);
      if (filters.student_id) q = q.eq('student_id', filters.student_id);
      if (filters.start_date) q = q.gte('issue_date', filters.start_date);
      if (filters.end_date) q = q.lte('issue_date', filters.end_date);
      if (branchId) q = q.eq('branch_id', branchId);
      if (financialYearId) q = q.eq('financial_year_id', financialYearId);
      return q.order('issue_date');
    },
    recordTransform: (row) => ({
      ...row,
      student_name: `${row.students.first_name} ${row.students.last_name}`,
      admission_no: row.students.admission_no,
      course_name: row.courses.course_name,
    }),
  },
};

export function getReportConfig(id) {
  return reportTypes[id];
}