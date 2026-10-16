-- Migration 019: Support 'won' and 'lost' lead statuses per Task 12
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'won', 'lost'));
