-- Migration: 006_billing.sql
-- Fase 0 Step 0.5: Billing/credits tables.

-- === CREDIT TRANSACTIONS ===
CREATE TABLE IF NOT EXISTS billing.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES iam.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_billing_credit_transactions_user_id ON billing.credit_transactions (user_id);
