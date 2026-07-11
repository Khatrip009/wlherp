-- Ensure organization has a unique key for domain mapping
ALTER TABLE public.organization
  ADD COLUMN IF NOT EXISTS organization_key text UNIQUE,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS settings jsonb;

-- Insert a default organization if none exists
INSERT INTO public.organization (id, company_name, organization_key, is_active, domain)
VALUES (1, 'ShreeVidhya Academy', 'shreevidhya', true, 'app.shreevidhyaerp.online')
ON CONFLICT (id) DO UPDATE SET
  organization_key = EXCLUDED.organization_key,
  domain = EXCLUDED.domain;

-- Create branches table
CREATE TABLE IF NOT EXISTS public.branches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  branch_name text NOT NULL,
  address text,
  city text,
  state text,
  pincode text,
  phone text,
  email text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, branch_name)
);

-- Add default branch for existing organization
INSERT INTO public.branches (id, organization_id, branch_name)
VALUES (1, 1, 'Main Branch')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.organization_domains (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);