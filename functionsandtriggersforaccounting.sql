-- ==================== DROP DUPLICATE TRIGGERS ====================
DROP TRIGGER IF EXISTS trg_fee_payment_journal ON fee_payments;
DROP TRIGGER IF EXISTS trg_fee_receipt_voucher ON fee_payments;
DROP TRIGGER IF EXISTS trg_receipt_auto ON fee_payments;

DROP TRIGGER IF EXISTS trg_expense_journal ON expenses;
DROP TRIGGER IF EXISTS trg_income_journal ON income;
DROP TRIGGER IF EXISTS trg_salary_payment_journal ON salary_payments;
DROP TRIGGER IF EXISTS trg_inventory_purchase_journal ON inventory_transactions;

-- ==================== DROP OLD MANUAL JOURNAL FUNCTIONS ====================
DROP FUNCTION IF EXISTS create_journal_for_fee_payment();
DROP FUNCTION IF EXISTS create_journal_for_expense();
DROP FUNCTION IF EXISTS create_journal_for_income();
DROP FUNCTION IF EXISTS create_journal_for_salary_payment();
DROP FUNCTION IF EXISTS create_journal_for_inventory_purchase();

-- ==================== AUTO POST FUNCTIONS (CORRECTED) ====================

-- Fee Payment
CREATE OR REPLACE FUNCTION public.auto_post_fee_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_cash_account_id    integer;
  v_fee_income_account integer;
  v_cgst_payable       integer;
  v_sgst_payable       integer;
  v_igst_payable       integer;
  v_journal_id         integer;
  v_tax_rate_id        integer;
  v_tax_rate           numeric;
  v_place_of_supply    varchar(2);
  v_org_state          varchar(2);
  v_split              jsonb;
  v_cgst_amount        numeric := 0;
  v_sgst_amount        numeric := 0;
  v_igst_amount        numeric := 0;
  v_base_amount        numeric;
  v_tax_amount         numeric;
BEGIN
  v_cash_account_id    := get_account_id_by_code('1001', NEW.branch_id, NEW.financial_year_id);
  v_fee_income_account := get_account_id_by_code('4001', NEW.branch_id, NEW.financial_year_id);
  v_cgst_payable       := get_account_id_by_code('2504', NEW.branch_id, NEW.financial_year_id);
  v_sgst_payable       := get_account_id_by_code('2503', NEW.branch_id, NEW.financial_year_id);
  v_igst_payable       := get_account_id_by_code('2505', NEW.branch_id, NEW.financial_year_id);

  SELECT sf.base_amount, sf.tax_amount, fs.tax_rate_id
    INTO v_base_amount, v_tax_amount, v_tax_rate_id
    FROM public.student_fees sf
    JOIN public.fee_structures fs ON fs.id = sf.fee_structure_id
    WHERE sf.id = NEW.student_fee_id;

  v_base_amount := COALESCE(v_base_amount, NEW.amount);
  v_tax_amount  := COALESCE(v_tax_amount, 0);

  IF v_tax_rate_id IS NOT NULL AND v_tax_amount > 0 THEN
    SELECT rate INTO v_tax_rate FROM public.tax_rates WHERE id = v_tax_rate_id;
    SELECT state_code INTO v_org_state FROM public.organization LIMIT 1;
    v_place_of_supply := v_org_state;
    v_split := public.split_gst(v_tax_rate, v_place_of_supply, v_org_state);
    v_cgst_amount := ROUND((v_tax_amount * (v_split->>'cgst')::numeric / v_tax_rate), 2);
    v_sgst_amount := ROUND((v_tax_amount * (v_split->>'sgst')::numeric / v_tax_rate), 2);
    v_igst_amount := v_tax_amount - v_cgst_amount - v_sgst_amount;
  END IF;

  INSERT INTO public.journal_entries (
    entry_date, reference, description, is_posted,
    branch_id, financial_year_id
  ) VALUES (
    NEW.payment_date, 'Fee Payment #' || NEW.id, 'Student fee collection', true,
    NEW.branch_id, NEW.financial_year_id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
  VALUES (v_journal_id, v_cash_account_id, NEW.amount, 0, 'Cash received', NEW.branch_id, NEW.financial_year_id);

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
  VALUES (v_journal_id, v_fee_income_account, 0, v_base_amount, 'Fee income', NEW.branch_id, NEW.financial_year_id);

  IF v_cgst_amount > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_cgst_payable, 0, v_cgst_amount, 'CGST payable', NEW.branch_id, NEW.financial_year_id);
  END IF;
  IF v_sgst_amount > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_sgst_payable, 0, v_sgst_amount, 'SGST payable', NEW.branch_id, NEW.financial_year_id);
  END IF;
  IF v_igst_amount > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_igst_payable, 0, v_igst_amount, 'IGST payable', NEW.branch_id, NEW.financial_year_id);
  END IF;

  RETURN NEW;
END;
$function$;

-- Expense
CREATE OR REPLACE FUNCTION public.auto_post_expense()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cash_account_id    integer;
  v_expense_account_id integer;
  v_itc_account_id     integer;
  v_journal_id         integer;
  v_net_amount         numeric;
  v_gst_amount         numeric;
BEGIN
  v_cash_account_id    := get_account_id_by_code('1001', NEW.branch_id, NEW.financial_year_id);
  v_expense_account_id := get_account_id_by_code('5005', NEW.branch_id, NEW.financial_year_id);
  v_itc_account_id     := get_account_id_by_code('1200', NEW.branch_id, NEW.financial_year_id);

  v_gst_amount := COALESCE(NEW.gst_amount, 0);
  v_net_amount := NEW.amount - v_gst_amount;

  INSERT INTO public.journal_entries (entry_date, reference, description, is_posted, branch_id, financial_year_id)
  VALUES (NEW.expense_date, 'Expense #' || NEW.id, NEW.description, true, NEW.branch_id, NEW.financial_year_id)
  RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
  VALUES (v_journal_id, v_expense_account_id, v_net_amount, 0, 'Expense (net)', NEW.branch_id, NEW.financial_year_id);

  IF NEW.itc_eligible AND v_gst_amount > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_itc_account_id, v_gst_amount, 0, 'ITC claimed', NEW.branch_id, NEW.financial_year_id);
  END IF;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
  VALUES (v_journal_id, v_cash_account_id, 0, NEW.amount, 'Cash paid', NEW.branch_id, NEW.financial_year_id);

  RETURN NEW;
END;
$function$;

-- Other Income
CREATE OR REPLACE FUNCTION public.auto_post_income()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cash_account_id   integer;
  v_income_account_id integer;
  v_cgst_payable      integer;
  v_sgst_payable      integer;
  v_igst_payable      integer;
  v_journal_id        integer;
  v_org_state         varchar(2);
  v_split             jsonb;
  v_tax_rate          numeric;
  v_cgst              numeric := 0;
  v_sgst              numeric := 0;
  v_igst              numeric := 0;
BEGIN
  v_cash_account_id   := get_account_id_by_code('1001', NEW.branch_id, NEW.financial_year_id);
  v_income_account_id := get_account_id_by_code('4002', NEW.branch_id, NEW.financial_year_id);
  v_cgst_payable      := get_account_id_by_code('2504', NEW.branch_id, NEW.financial_year_id);
  v_sgst_payable      := get_account_id_by_code('2503', NEW.branch_id, NEW.financial_year_id);
  v_igst_payable      := get_account_id_by_code('2505', NEW.branch_id, NEW.financial_year_id);

  SELECT state_code INTO v_org_state FROM public.organization LIMIT 1;

  IF NEW.tax_rate_id IS NOT NULL AND NEW.tax_amount > 0 THEN
    SELECT rate INTO v_tax_rate FROM public.tax_rates WHERE id = NEW.tax_rate_id;
    v_split := public.split_gst(v_tax_rate, v_org_state, v_org_state);
    v_cgst := ROUND((NEW.tax_amount * (v_split->>'cgst')::numeric / v_tax_rate), 2);
    v_sgst := ROUND((NEW.tax_amount * (v_split->>'sgst')::numeric / v_tax_rate), 2);
    v_igst := NEW.tax_amount - v_cgst - v_sgst;
  END IF;

  INSERT INTO public.journal_entries (entry_date, reference, description, is_posted, branch_id, financial_year_id)
  VALUES (NEW.income_date, 'Income #' || NEW.id, NEW.description, true, NEW.branch_id, NEW.financial_year_id)
  RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
  VALUES (v_journal_id, v_cash_account_id, NEW.amount, 0, 'Cash received', NEW.branch_id, NEW.financial_year_id);

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
  VALUES (v_journal_id, v_income_account_id, 0, NEW.base_amount, 'Income (taxable)', NEW.branch_id, NEW.financial_year_id);

  IF v_cgst > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_cgst_payable, 0, v_cgst, 'CGST payable', NEW.branch_id, NEW.financial_year_id);
  END IF;
  IF v_sgst > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_sgst_payable, 0, v_sgst, 'SGST payable', NEW.branch_id, NEW.financial_year_id);
  END IF;
  IF v_igst > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_igst_payable, 0, v_igst, 'IGST payable', NEW.branch_id, NEW.financial_year_id);
  END IF;

  RETURN NEW;
END;
$function$;

-- Salary Payment
CREATE OR REPLACE FUNCTION public.auto_post_salary_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_cash_account_id       integer;
  v_salary_expense_id     integer;
  v_salary_payable_id     integer;
  v_journal_id            integer;
BEGIN
  v_cash_account_id   := get_account_id_by_code('1001', NEW.branch_id, NEW.financial_year_id);
  v_salary_expense_id := get_account_id_by_code('5001', NEW.branch_id, NEW.financial_year_id);
  v_salary_payable_id := get_account_id_by_code('2004', NEW.branch_id, NEW.financial_year_id);

  IF v_cash_account_id IS NULL OR v_salary_expense_id IS NULL OR v_salary_payable_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.journal_entries (
    entry_date, reference, description, is_posted, branch_id, financial_year_id
  ) VALUES (
    NEW.payment_date, 'Salary #' || NEW.id, 'Salary payment', true, NEW.branch_id, NEW.financial_year_id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
  VALUES (v_journal_id, v_salary_expense_id, NEW.amount, 0, 'Salary expense (gross)', NEW.branch_id, NEW.financial_year_id);

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
  VALUES (v_journal_id, v_cash_account_id, 0, NEW.amount, 'Salary paid', NEW.branch_id, NEW.financial_year_id);

  RETURN NEW;
END;
$function$;

-- Inventory Purchase
CREATE OR REPLACE FUNCTION public.auto_post_inventory_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inventory_account_id  integer;
  v_itc_account_id        integer;
  v_payable_account_id    integer;
  v_journal_id            integer;
  v_amount                numeric;
  v_tax_amount            numeric := 0;
BEGIN
  IF NEW.transaction_type = 'purchase' THEN
    v_inventory_account_id := get_account_id_by_code('1004', NEW.branch_id, NEW.financial_year_id);
    v_itc_account_id       := get_account_id_by_code('1200', NEW.branch_id, NEW.financial_year_id);
    v_payable_account_id   := get_account_id_by_code('2001', NEW.branch_id, NEW.financial_year_id);

    v_amount := NEW.quantity * COALESCE(NEW.unit_price, 0);
    v_tax_amount := COALESCE(NEW.total_amount, 0) - v_amount;

    INSERT INTO public.journal_entries (entry_date, reference, description, is_posted, branch_id, financial_year_id)
    VALUES (CURRENT_DATE, 'Inventory Purchase #' || NEW.id, 'Stock purchase', true, NEW.branch_id, NEW.financial_year_id)
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_inventory_account_id, v_amount, 0, 'Inventory increase', NEW.branch_id, NEW.financial_year_id);

    IF v_tax_amount > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
      VALUES (v_journal_id, v_itc_account_id, v_tax_amount, 0, 'ITC claimed', NEW.branch_id, NEW.financial_year_id);
    END IF;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_payable_account_id, 0, COALESCE(NEW.total_amount, v_amount + v_tax_amount), 'Vendor payable', NEW.branch_id, NEW.financial_year_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Inventory Issue
CREATE OR REPLACE FUNCTION public.auto_post_inventory_issue()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_inventory_account_id  integer;
  v_expense_account_id    integer;
  v_journal_id            integer;
  v_amount                numeric;
BEGIN
  IF NEW.transaction_type = 'issue' THEN
    v_inventory_account_id := get_account_id_by_code('1004', NEW.branch_id, NEW.financial_year_id);
    v_expense_account_id   := get_account_id_by_code('5004', NEW.branch_id, NEW.financial_year_id);

    v_amount := NEW.quantity * COALESCE(NEW.unit_price, 0);

    INSERT INTO public.journal_entries (entry_date, reference, description, is_posted, branch_id, financial_year_id)
    VALUES (CURRENT_DATE, 'Inventory Issue #' || NEW.id, 'Issued to student', true, NEW.branch_id, NEW.financial_year_id)
    RETURNING id INTO v_journal_id;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_expense_account_id, v_amount, 0, 'Supplies issued', NEW.branch_id, NEW.financial_year_id);

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id, financial_year_id)
    VALUES (v_journal_id, v_inventory_account_id, 0, v_amount, 'Inventory decrease', NEW.branch_id, NEW.financial_year_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- ==================== CREATE MISSING TRIGGERS ====================

-- Combined trigger for inventory transactions (purchase & issue)
DROP TRIGGER IF EXISTS trg_inventory_accounting ON inventory_transactions;
CREATE TRIGGER trg_inventory_accounting
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW
  WHEN (NEW.transaction_type = 'purchase')
  EXECUTE FUNCTION auto_post_inventory_purchase();

DROP TRIGGER IF EXISTS trg_inventory_issue_accounting ON inventory_transactions;
CREATE TRIGGER trg_inventory_issue_accounting
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW
  WHEN (NEW.transaction_type = 'issue')
  EXECUTE FUNCTION auto_post_inventory_issue();