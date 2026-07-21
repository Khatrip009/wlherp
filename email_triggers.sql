CREATE EXTENSION IF NOT EXISTS pg_net;



CREATE OR REPLACE FUNCTION public.call_send_email(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_status integer;
  response_body text;
BEGIN
  -- Use pg_net to POST to the Edge Function
  SELECT status, content
  INTO response_status, response_body
  FROM net.http_post(
    url := 'https://xdnebzhxjlkeqhjsmiow.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := payload::text
  );

  -- Log errors (optional)
  IF response_status != 200 THEN
    RAISE WARNING 'Email sending failed: %', response_body;
  END IF;
END;
$$; 

CREATE OR REPLACE FUNCTION public.trigger_inquiry_confirmation()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
BEGIN
  -- Get organization_id from branch
  SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;

  -- Build context
  context = jsonb_build_object(
    'academyName', (SELECT company_name FROM organization WHERE id = org_id),
    'parent_name', NEW.parent_name,
    'student_name', NEW.student_name,
    'inquiry_no', NEW.inquiry_no,
    'mobile', NEW.mobile,
    'course_name', (SELECT course_name FROM courses WHERE id = NEW.interested_course_id)
  );

  payload = jsonb_build_object(
    'to', NEW.email,
    'organizationId', org_id,
    'slug', 'inquiry_confirmation',
    'context', context,
    'branchId', NEW.branch_id
  );

  PERFORM call_send_email(payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_inquiry_insert
AFTER INSERT ON inquiries
FOR EACH ROW EXECUTE FUNCTION trigger_inquiry_confirmation();

CREATE OR REPLACE FUNCTION public.trigger_demo_scheduled()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
BEGIN
  -- Only fire if demo_scheduled_at changed from null to non-null
  IF OLD.demo_scheduled_at IS NULL AND NEW.demo_scheduled_at IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;

    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'parent_name', NEW.parent_name,
      'student_name', NEW.student_name,
      'demo_datetime', NEW.demo_scheduled_at,
      'course_name', (SELECT course_name FROM courses WHERE id = NEW.interested_course_id),
      'branch_name', (SELECT branch_name FROM branches WHERE id = NEW.branch_id)
    );

    payload = jsonb_build_object(
      'to', NEW.email,
      'organizationId', org_id,
      'slug', 'demo_scheduled',
      'context', context,
      'branchId', NEW.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_inquiry_demo_update
AFTER UPDATE ON inquiries
FOR EACH ROW EXECUTE FUNCTION trigger_demo_scheduled();
CREATE OR REPLACE FUNCTION public.trigger_inquiry_status_change()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;

    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'parent_name', NEW.parent_name,
      'student_name', NEW.student_name,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'rejection_reason', NEW.rejection_reason  -- may be null
    );

    payload = jsonb_build_object(
      'to', NEW.email,
      'organizationId', org_id,
      'slug', 'inquiry_status_change',
      'context', context,
      'branchId', NEW.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_inquiry_status_update
AFTER UPDATE ON inquiries
FOR EACH ROW EXECUTE FUNCTION trigger_inquiry_status_change();

CREATE OR REPLACE FUNCTION public.trigger_admission_confirmation()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  student_record RECORD;
  batch_record RECORD;
BEGIN
  IF NEW.status = 'active' THEN
    -- Fetch student and batch details
    SELECT s.first_name, s.last_name, s.email, s.mobile, s.branch_id, s.organization_id
    INTO student_record
    FROM students s WHERE s.id = NEW.student_id;

    SELECT b.batch_name, c.course_name 
    INTO batch_record
    FROM batches b 
    JOIN courses c ON b.course_id = c.id
    WHERE b.id = NEW.batch_id;

    -- Determine organization_id (from student's branch)
    IF student_record.branch_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM branches WHERE id = student_record.branch_id;
    ELSE
      -- fallback: use student's organization_id if available
      org_id := student_record.organization_id;
    END IF;

    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'student_name', student_record.first_name || ' ' || student_record.last_name,
      'admission_no', (SELECT admission_no FROM students WHERE id = NEW.student_id),
      'course_name', batch_record.course_name,
      'batch_name', batch_record.batch_name,
      'joining_date', NEW.enrollment_date,
      'branch_name', (SELECT branch_name FROM branches WHERE id = student_record.branch_id)
    );

    payload = jsonb_build_object(
      'to', student_record.email,
      'organizationId', org_id,
      'slug', 'admission_confirmation',
      'context', context,
      'branchId', student_record.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_student_batch_insert
AFTER INSERT ON student_batches
FOR EACH ROW EXECUTE FUNCTION trigger_admission_confirmation();

CREATE OR REPLACE FUNCTION public.trigger_account_activation()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
BEGIN
  IF NEW.role IN ('student', 'parent') THEN
    -- Get organization_id from profile's organization_id or branch
    org_id := NEW.organization_id;
    IF org_id IS NULL AND NEW.branch_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;
    END IF;

    -- For password: we can't get it from DB; we may need to generate a temporary password before insert.
    -- Better to handle this manually in your application, or use a separate flow.
    -- For this trigger, we'll assume temp_password is provided in a custom field? Not recommended.
    -- We'll skip this automated trigger because it requires plain-text password.
    -- Instead, use the application's sign-up flow to send this email.
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.trigger_low_attendance_alert()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  total_present integer;
  total_days integer;
  percentage numeric;
  student_rec RECORD;
  threshold numeric := 75.0;  -- set your threshold
BEGIN
  -- Compute attendance for the student in the current month
  SELECT COUNT(*) FILTER (WHERE status = 'present') AS present,
         COUNT(*) AS total
  INTO total_present, total_days
  FROM student_attendance sa
  JOIN attendance_sessions sess ON sa.session_id = sess.id
  WHERE sa.student_id = NEW.student_id
    AND DATE_TRUNC('month', sess.attendance_date) = DATE_TRUNC('month', CURRENT_DATE);

  IF total_days > 0 THEN
    percentage := (total_present::float / total_days) * 100;
    IF percentage < threshold THEN
      -- Fetch student and parent details
      SELECT s.first_name, s.last_name, s.email, s.branch_id, s.organization_id,
             p.email AS parent_email, p.father_name, p.mother_name
      INTO student_rec
      FROM students s
      LEFT JOIN student_parents sp ON sp.student_id = s.id
      LEFT JOIN parents p ON p.id = sp.parent_id
      WHERE s.id = NEW.student_id
      LIMIT 1;

      IF student_rec.branch_id IS NOT NULL THEN
        SELECT organization_id INTO org_id FROM branches WHERE id = student_rec.branch_id;
      ELSE
        org_id := student_rec.organization_id;
      END IF;

      context = jsonb_build_object(
        'academyName', (SELECT company_name FROM organization WHERE id = org_id),
        'parent_name', COALESCE(student_rec.father_name, student_rec.mother_name, 'Parent'),
        'student_name', student_rec.first_name || ' ' || student_rec.last_name,
        'attendance_percentage', percentage,
        'batch_name', (SELECT batch_name FROM batches b JOIN student_batches sb ON sb.batch_id = b.id WHERE sb.student_id = NEW.student_id AND sb.status = 'active' LIMIT 1),
        'month_year', TO_CHAR(CURRENT_DATE, 'FMMonth YYYY')
      );

      payload = jsonb_build_object(
        'to', COALESCE(student_rec.parent_email, student_rec.email),
        'organizationId', org_id,
        'slug', 'low_attendance_alert',
        'context', context,
        'branchId', student_rec.branch_id
      );

      PERFORM call_send_email(payload);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_attendance_insert
AFTER INSERT ON student_attendance
FOR EACH ROW EXECUTE FUNCTION trigger_low_attendance_alert();

CREATE OR REPLACE FUNCTION public.trigger_daily_absent_report()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  student_rec RECORD;
  session_rec RECORD;
BEGIN
  IF NEW.status = 'absent' THEN
    SELECT s.first_name, s.last_name, s.email, s.branch_id, s.organization_id,
           p.email AS parent_email, p.father_name, p.mother_name
    INTO student_rec
    FROM students s
    LEFT JOIN student_parents sp ON sp.student_id = s.id
    LEFT JOIN parents p ON p.id = sp.parent_id
    WHERE s.id = NEW.student_id
    LIMIT 1;

    SELECT sess.attendance_date, sess.batch_id
    INTO session_rec
    FROM attendance_sessions sess WHERE sess.id = NEW.session_id;

    IF student_rec.branch_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM branches WHERE id = student_rec.branch_id;
    ELSE
      org_id := student_rec.organization_id;
    END IF;

    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'parent_name', COALESCE(student_rec.father_name, student_rec.mother_name, 'Parent'),
      'student_name', student_rec.first_name || ' ' || student_rec.last_name,
      'date', session_rec.attendance_date,
      'status', NEW.status
    );

    payload = jsonb_build_object(
      'to', COALESCE(student_rec.parent_email, student_rec.email),
      'organizationId', org_id,
      'slug', 'daily_absent_report',
      'context', context,
      'branchId', student_rec.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_absent_attendance
AFTER INSERT ON student_attendance
FOR EACH ROW EXECUTE FUNCTION trigger_daily_absent_report();

CREATE OR REPLACE FUNCTION public.trigger_fee_receipt()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  student_rec RECORD;
BEGIN
  -- Fetch student and organization
  SELECT s.first_name, s.last_name, s.email, s.branch_id, s.organization_id,
         sf.balance_due
  INTO student_rec
  FROM students s
  JOIN student_fees sf ON sf.student_id = s.id
  WHERE sf.id = NEW.student_fee_id;

  IF student_rec.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = student_rec.branch_id;
  ELSE
    org_id := student_rec.organization_id;
  END IF;

  context = jsonb_build_object(
    'academyName', (SELECT company_name FROM organization WHERE id = org_id),
    'studentName', student_rec.first_name || ' ' || student_rec.last_name,
    'receiptNo', NEW.receipt_number,
    'amount', NEW.amount,
    'paymentDate', NEW.payment_date,
    'paymentMode', NEW.payment_mode,
    'transactionNo', NEW.transaction_no,
    'balanceDue', student_rec.balance_due
  );

  payload = jsonb_build_object(
    'to', student_rec.email,
    'organizationId', org_id,
    'slug', 'fee_receipt',
    'context', context,
    'branchId', student_rec.branch_id
  );

  PERFORM call_send_email(payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_fee_payment_insert
AFTER INSERT ON fee_payments
FOR EACH ROW EXECUTE FUNCTION trigger_fee_receipt();

CREATE OR REPLACE FUNCTION public.trigger_exam_schedule()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  batch_rec RECORD;
  students_cursor CURSOR FOR 
    SELECT s.id, s.first_name, s.last_name, s.email, s.branch_id
    FROM students s
    JOIN student_batches sb ON sb.student_id = s.id
    WHERE sb.batch_id = NEW.batch_id AND sb.status = 'active';
BEGIN
  -- Get batch info
  SELECT b.branch_id, b.batch_name, c.course_name
  INTO batch_rec
  FROM batches b
  JOIN courses c ON b.course_id = c.id
  WHERE b.id = NEW.batch_id;

  IF batch_rec.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = batch_rec.branch_id;
  END IF;

  -- Loop through active students in the batch
  FOR student_rec IN students_cursor LOOP
    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'exam_name', NEW.exam_name,
      'subject_name', (SELECT subject_name FROM subjects WHERE id = NEW.subject_id),
      'exam_date', NEW.exam_date,
      'total_marks', NEW.total_marks,
      'batch_name', batch_rec.batch_name
    );

    payload = jsonb_build_object(
      'to', student_rec.email,
      'organizationId', org_id,
      'slug', 'exam_schedule',
      'context', context,
      'branchId', student_rec.branch_id
    );

    PERFORM call_send_email(payload);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_exam_insert
AFTER INSERT ON exams
FOR EACH ROW EXECUTE FUNCTION trigger_exam_schedule();

CREATE OR REPLACE FUNCTION public.trigger_results_published()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  student_rec RECORD;
  exam_rec RECORD;
BEGIN
  SELECT s.first_name, s.last_name, s.email, s.branch_id
  INTO student_rec
  FROM students s WHERE s.id = NEW.student_id;

  SELECT e.exam_name, sub.subject_name, e.total_marks
  INTO exam_rec
  FROM exams e
  JOIN subjects sub ON e.subject_id = sub.id
  WHERE e.id = NEW.exam_id;

  IF student_rec.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = student_rec.branch_id;
  END IF;

  context = jsonb_build_object(
    'academyName', (SELECT company_name FROM organization WHERE id = org_id),
    'student_name', student_rec.first_name || ' ' || student_rec.last_name,
    'exam_name', exam_rec.exam_name,
    'subject_name', exam_rec.subject_name,
    'marks_obtained', NEW.marks_obtained,
    'total_marks', exam_rec.total_marks,
    'grade', NEW.grade,
    'remarks', NEW.remarks
  );

  payload = jsonb_build_object(
    'to', student_rec.email,
    'organizationId', org_id,
    'slug', 'results_published',
    'context', context,
    'branchId', student_rec.branch_id
  );

  PERFORM call_send_email(payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_result_insert
AFTER INSERT ON student_results
FOR EACH ROW EXECUTE FUNCTION trigger_results_published();

CREATE OR REPLACE FUNCTION public.trigger_new_homework()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  batch_rec RECORD;
  students_cursor CURSOR FOR 
    SELECT s.id, s.first_name, s.last_name, s.email, s.branch_id
    FROM students s
    JOIN student_batches sb ON sb.student_id = s.id
    WHERE sb.batch_id = NEW.batch_id AND sb.status = 'active';
BEGIN
  SELECT b.branch_id, b.batch_name
  INTO batch_rec
  FROM batches b WHERE b.id = NEW.batch_id;

  IF batch_rec.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = batch_rec.branch_id;
  END IF;

  FOR student_rec IN students_cursor LOOP
    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'batch_name', batch_rec.batch_name,
      'subject_name', (SELECT subject_name FROM subjects WHERE id = NEW.subject_id),
      'title', NEW.title,
      'description', NEW.description,
      'due_date', NEW.due_date,
      'attachment_url', NEW.attachment_url
    );

    payload = jsonb_build_object(
      'to', student_rec.email,
      'organizationId', org_id,
      'slug', 'new_homework',
      'context', context,
      'branchId', student_rec.branch_id
    );

    PERFORM call_send_email(payload);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_homework_insert
AFTER INSERT ON homework
FOR EACH ROW EXECUTE FUNCTION trigger_new_homework();

CREATE OR REPLACE FUNCTION public.trigger_certificate_issued()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  student_rec RECORD;
  course_name text;
  level_name text;
BEGIN
  SELECT s.first_name, s.last_name, s.email, s.branch_id
  INTO student_rec
  FROM students s WHERE s.id = NEW.student_id;

  SELECT c.course_name, l.level_name
  INTO course_name, level_name
  FROM courses c
  LEFT JOIN course_levels l ON l.id = NEW.level_id
  WHERE c.id = NEW.course_id;

  IF student_rec.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = student_rec.branch_id;
  END IF;

  context = jsonb_build_object(
    'academyName', (SELECT company_name FROM organization WHERE id = org_id),
    'student_name', student_rec.first_name || ' ' || student_rec.last_name,
    'certificate_no', NEW.certificate_no,
    'course_name', course_name,
    'level_name', COALESCE(level_name, ''),
    'issue_date', NEW.issue_date,
    'download_link', NEW.certificate_url
  );

  payload = jsonb_build_object(
    'to', student_rec.email,
    'organizationId', org_id,
    'slug', 'certificate_issued',
    'context', context,
    'branchId', student_rec.branch_id
  );

  PERFORM call_send_email(payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_certificate_insert
AFTER INSERT ON certificates
FOR EACH ROW EXECUTE FUNCTION trigger_certificate_issued();

CREATE OR REPLACE FUNCTION public.trigger_salary_slip()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  teacher_rec RECORD;
BEGIN
  SELECT t.first_name, t.last_name, t.email, t.employee_code, t.branch_id
  INTO teacher_rec
  FROM teachers t WHERE t.id = NEW.teacher_id;

  IF teacher_rec.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = teacher_rec.branch_id;
  END IF;

  context = jsonb_build_object(
    'academyName', (SELECT company_name FROM organization WHERE id = org_id),
    'teacher_name', teacher_rec.first_name || ' ' || teacher_rec.last_name,
    'employee_code', teacher_rec.employee_code,
    'payment_date', NEW.payment_date,
    'gross_amount', NEW.amount,
    'tds', NEW.tds_amount,
    'net_amount', NEW.net_amount
  );

  payload = jsonb_build_object(
    'to', teacher_rec.email,
    'organizationId', org_id,
    'slug', 'salary_slip',
    'context', context,
    'branchId', teacher_rec.branch_id
  );

  PERFORM call_send_email(payload);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_salary_payment_insert
AFTER INSERT ON salary_payments
FOR EACH ROW EXECUTE FUNCTION trigger_salary_slip();

CREATE OR REPLACE FUNCTION public.trigger_leave_submitted()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  teacher_rec RECORD;
  admin_emails text[];
BEGIN
  SELECT t.first_name, t.last_name, t.email, t.branch_id
  INTO teacher_rec
  FROM teachers t WHERE t.id = NEW.teacher_id;

  IF teacher_rec.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = teacher_rec.branch_id;
  END IF;

  context = jsonb_build_object(
    'academyName', (SELECT company_name FROM organization WHERE id = org_id),
    'teacher_name', teacher_rec.first_name || ' ' || teacher_rec.last_name,
    'leave_dates', NEW.start_date || ' to ' || NEW.end_date,
    'reason', NEW.reason,
    'status', NEW.status
  );

  -- Send to admin (you may need to fetch admin emails)
  SELECT array_agg(email) INTO admin_emails
  FROM profiles
  WHERE role IN ('admin', 'super_admin', 'organization_admin') AND organization_id = org_id;

  IF admin_emails IS NOT NULL AND array_length(admin_emails, 1) > 0 THEN
    payload = jsonb_build_object(
      'to', admin_emails,
      'organizationId', org_id,
      'slug', 'leave_submitted',
      'context', context,
      'branchId', teacher_rec.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_leave_insert
AFTER INSERT ON leaves
FOR EACH ROW EXECUTE FUNCTION trigger_leave_submitted();

CREATE OR REPLACE FUNCTION public.trigger_leave_status_update()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  teacher_rec RECORD;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT t.first_name, t.last_name, t.email, t.branch_id
    INTO teacher_rec
    FROM teachers t WHERE t.id = NEW.teacher_id;

    IF teacher_rec.branch_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM branches WHERE id = teacher_rec.branch_id;
    END IF;

    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'teacher_name', teacher_rec.first_name || ' ' || teacher_rec.last_name,
      'leave_dates', NEW.start_date || ' to ' || NEW.end_date,
      'new_status', NEW.status,
      'admin_remarks', NEW.admin_remarks
    );

    payload = jsonb_build_object(
      'to', teacher_rec.email,
      'organizationId', org_id,
      'slug', 'leave_status_update',
      'context', context,
      'branchId', teacher_rec.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_leave_status_update
AFTER UPDATE ON leaves
FOR EACH ROW EXECUTE FUNCTION trigger_leave_status_update();

CREATE OR REPLACE FUNCTION public.trigger_teacher_onboarding()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
BEGIN
  IF NEW.email IS NOT NULL THEN
    IF NEW.branch_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;
    END IF;

    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'teacher_name', NEW.first_name || ' ' || NEW.last_name,
      'employee_code', NEW.employee_code,
      'email', NEW.email,
      'temp_password', '-- NOT AVAILABLE --', -- we can't fetch plaintext password; handle manually
      'login_link', 'https://your-app.com/login'
    );

    payload = jsonb_build_object(
      'to', NEW.email,
      'organizationId', org_id,
      'slug', 'teacher_onboarding',
      'context', context,
      'branchId', NEW.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_teacher_insert
AFTER INSERT ON teachers
FOR EACH ROW EXECUTE FUNCTION trigger_teacher_onboarding();

CREATE OR REPLACE FUNCTION public.trigger_system_announcement()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  target_emails text[];
BEGIN
  -- Get organization_id from branch (if present)
  IF NEW.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;
  END IF;

  -- Build target audience emails based on target_type
  IF NEW.target_type = 'all' THEN
    SELECT array_agg(email) INTO target_emails
    FROM profiles WHERE organization_id = org_id AND is_active = true;
  ELSIF NEW.target_type = 'students' THEN
    SELECT array_agg(email) INTO target_emails
    FROM students WHERE branch_id = NEW.branch_id AND status = 'active';
  ELSIF NEW.target_type = 'teachers' THEN
    SELECT array_agg(email) INTO target_emails
    FROM teachers WHERE branch_id = NEW.branch_id AND status = 'active';
  ELSIF NEW.target_type = 'parents' THEN
    SELECT array_agg(email) INTO target_emails
    FROM parents WHERE branch_id = NEW.branch_id;
  END IF;

  IF target_emails IS NOT NULL AND array_length(target_emails, 1) > 0 THEN
    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'title', NEW.title,
      'message', NEW.message,
      'target_type', NEW.target_type
    );

    payload = jsonb_build_object(
      'to', target_emails,
      'organizationId', org_id,
      'slug', 'system_announcement',
      'context', context,
      'branchId', NEW.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_notification_insert
AFTER INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION trigger_system_announcement();

CREATE OR REPLACE FUNCTION public.trigger_batch_change()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  student_rec RECORD;
BEGIN
  IF OLD.batch_id IS DISTINCT FROM NEW.batch_id THEN
    SELECT s.first_name, s.last_name, s.email, s.branch_id
    INTO student_rec
    FROM students s WHERE s.id = NEW.student_id;

    IF student_rec.branch_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM branches WHERE id = student_rec.branch_id;
    END IF;

    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'student_name', student_rec.first_name || ' ' || student_rec.last_name,
      'old_batch', (SELECT batch_name FROM batches WHERE id = OLD.batch_id),
      'new_batch', (SELECT batch_name FROM batches WHERE id = NEW.batch_id),
      'effective_date', NEW.enrollment_date
    );

    payload = jsonb_build_object(
      'to', student_rec.email,
      'organizationId', org_id,
      'slug', 'batch_change',
      'context', context,
      'branchId', student_rec.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_student_batch_update
AFTER UPDATE ON student_batches
FOR EACH ROW EXECUTE FUNCTION trigger_batch_change();

CREATE OR REPLACE FUNCTION public.trigger_po_sent()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  items_list text;
BEGIN
  IF NEW.status = 'Final' AND OLD.status != 'Final' THEN
    IF NEW.branch_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;
    END IF;

    -- Build items list
    SELECT string_agg(item_name || ' x ' || quantity_ordered || ' @ ₹' || unit_price, '; ')
    INTO items_list
    FROM purchase_order_items poi
    JOIN inventory_items ii ON ii.id = poi.item_id
    WHERE poi.purchase_order_id = NEW.id;

    context = jsonb_build_object(
      'academyName', (SELECT company_name FROM organization WHERE id = org_id),
      'vendor_name', NEW.vendor,
      'po_number', NEW.po_number,
      'order_date', NEW.order_date,
      'expected_date', NEW.expected_date,
      'total_amount', NEW.total_amount,
      'items_list', items_list
    );

    -- Send to vendor email (if available)
    IF NEW.vendor_email IS NOT NULL THEN
      payload = jsonb_build_object(
        'to', NEW.vendor_email,
        'organizationId', org_id,
        'slug', 'po_sent',
        'context', context,
        'branchId', NEW.branch_id
      );

      PERFORM call_send_email(payload);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_po_status_update
AFTER UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION trigger_po_sent();

CREATE OR REPLACE FUNCTION public.trigger_pi_received()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  admin_emails text[];
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;
  END IF;

  context = jsonb_build_object(
    'academyName', (SELECT company_name FROM organization WHERE id = org_id),
    'invoice_number', NEW.invoice_number,
    'vendor_name', (SELECT vendor_name FROM vendors WHERE id = NEW.vendor_id),
    'invoice_date', NEW.invoice_date,
    'grand_total', NEW.grand_total
  );

  -- Send to admin
  SELECT array_agg(email) INTO admin_emails
  FROM profiles
  WHERE role IN ('admin', 'super_admin', 'organization_admin') AND organization_id = org_id;

  IF admin_emails IS NOT NULL AND array_length(admin_emails, 1) > 0 THEN
    payload = jsonb_build_object(
      'to', admin_emails,
      'organizationId', org_id,
      'slug', 'pi_received',
      'context', context,
      'branchId', NEW.branch_id
    );

    PERFORM call_send_email(payload);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_purchase_invoice_insert
AFTER INSERT ON purchase_invoices
FOR EACH ROW EXECUTE FUNCTION trigger_pi_received();

CREATE OR REPLACE FUNCTION public.trigger_online_class_scheduled()
RETURNS TRIGGER AS $$
DECLARE
  org_id integer;
  context jsonb;
  payload jsonb;
  batch_students RECORD;
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    SELECT organization_id INTO org_id FROM branches WHERE id = NEW.branch_id;
  END IF;

  context = jsonb_build_object(
    'academyName', (SELECT company_name FROM organization WHERE id = org_id),
    'batch_name', (SELECT batch_name FROM batches WHERE id = NEW.batch_id),
    'title', NEW.title,
    'start_time', NEW.start_time,
    'duration', NEW.duration_minutes,
    'room_link', 'https://your-meeting-link.com/' || NEW.room_name -- adjust as needed
  );

  -- Loop through active students in the batch
  FOR batch_students IN (
    SELECT s.email
    FROM students s
    JOIN student_batches sb ON sb.student_id = s.id
    WHERE sb.batch_id = NEW.batch_id AND sb.status = 'active'
  ) LOOP
    payload = jsonb_build_object(
      'to', batch_students.email,
      'organizationId', org_id,
      'slug', 'online_class_scheduled',
      'context', context,
      'branchId', NEW.branch_id
    );

    PERFORM call_send_email(payload);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_online_class_insert
AFTER INSERT ON online_classes
FOR EACH ROW EXECUTE FUNCTION trigger_online_class_scheduled();

