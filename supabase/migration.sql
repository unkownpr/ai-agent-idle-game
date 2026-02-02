-- ============================================
-- AI Agents Game - Supabase Migration
-- Run this in the Supabase SQL Editor
-- Idempotent: safe to run multiple times
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. ALLIANCES (created first for FK reference)
-- ============================================
CREATE TABLE IF NOT EXISTS alliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  leader_id UUID NOT NULL,
  level INT DEFAULT 1 NOT NULL CHECK (level >= 1 AND level <= 5),
  treasury NUMERIC(20, 2) DEFAULT 0 NOT NULL CHECK (treasury >= 0),
  member_count INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 2. AGENTS (player profiles)
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  gold NUMERIC(20, 2) DEFAULT 0 NOT NULL CHECK (gold >= 0),
  gems NUMERIC(20, 2) DEFAULT 0 NOT NULL CHECK (gems >= 0),
  xp BIGINT DEFAULT 0 NOT NULL,
  level INT DEFAULT 1 NOT NULL,
  click_power NUMERIC(12, 2) DEFAULT 1 NOT NULL,
  idle_rate NUMERIC(12, 4) DEFAULT 0.1 NOT NULL,
  attack_power NUMERIC(12, 2) DEFAULT 10 NOT NULL,
  defense_power NUMERIC(12, 2) DEFAULT 10 NOT NULL,
  power_score NUMERIC(14, 2) DEFAULT 0 NOT NULL,
  karma NUMERIC(6, 4) DEFAULT 1.0 NOT NULL,
  moltbook_verified BOOLEAN DEFAULT FALSE,
  alliance_id UUID REFERENCES alliances(id) ON DELETE SET NULL,
  last_tick_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_click_at TIMESTAMPTZ DEFAULT '2000-01-01'::timestamptz NOT NULL,
  last_attack_at TIMESTAMPTZ DEFAULT '2000-01-01'::timestamptz NOT NULL,
  shield_until TIMESTAMPTZ DEFAULT '2000-01-01'::timestamptz NOT NULL,
  total_clicks BIGINT DEFAULT 0 NOT NULL,
  total_gold_earned NUMERIC(20, 2) DEFAULT 0 NOT NULL,
  total_pvp_wins INT DEFAULT 0 NOT NULL,
  total_pvp_losses INT DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add FK for alliances.leader_id -> agents.id (skip if exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alliance_leader') THEN
    ALTER TABLE alliances ADD CONSTRAINT fk_alliance_leader FOREIGN KEY (leader_id) REFERENCES agents(id);
  END IF;
END $$;

-- ============================================
-- 3. ALLIANCE APPLICATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS alliance_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(alliance_id, agent_id)
);

-- ============================================
-- 4. UPGRADE CATALOG (static definitions)
-- ============================================
CREATE TABLE IF NOT EXISTS upgrade_catalog (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('click', 'idle', 'defense', 'attack')),
  description TEXT,
  base_cost NUMERIC(14, 2) NOT NULL,
  cost_multiplier NUMERIC(6, 3) DEFAULT 1.15 NOT NULL,
  effect_per_level NUMERIC(10, 4) NOT NULL,
  max_level INT DEFAULT 100 NOT NULL,
  currency TEXT DEFAULT 'gold' NOT NULL CHECK (currency IN ('gold', 'gems'))
);

-- ============================================
-- 5. AGENT UPGRADES (owned upgrades)
-- ============================================
CREATE TABLE IF NOT EXISTS agent_upgrades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  upgrade_id INT NOT NULL REFERENCES upgrade_catalog(id),
  level INT DEFAULT 1 NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(agent_id, upgrade_id)
);

-- ============================================
-- 6. PVP LOG
-- ============================================
CREATE TABLE IF NOT EXISTS pvp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id UUID NOT NULL REFERENCES agents(id),
  defender_id UUID NOT NULL REFERENCES agents(id),
  attacker_power NUMERIC(14, 2) NOT NULL,
  defender_power NUMERIC(14, 2) NOT NULL,
  attacker_roll NUMERIC(14, 2) NOT NULL,
  defender_roll NUMERIC(14, 2) NOT NULL,
  winner_id UUID NOT NULL REFERENCES agents(id),
  gold_transferred NUMERIC(14, 2) NOT NULL,
  gold_lost NUMERIC(14, 2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 7. MARKET ORDERS (order book)
-- ============================================
CREATE TABLE IF NOT EXISTS market_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  price NUMERIC(14, 4) NOT NULL CHECK (price > 0),
  quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  filled NUMERIC(14, 2) DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'filled', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 8. TRADE LOG
-- ============================================
CREATE TABLE IF NOT EXISTS trade_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buy_order_id UUID NOT NULL REFERENCES market_orders(id),
  sell_order_id UUID NOT NULL REFERENCES market_orders(id),
  buyer_id UUID NOT NULL REFERENCES agents(id),
  seller_id UUID NOT NULL REFERENCES agents(id),
  price NUMERIC(14, 4) NOT NULL,
  quantity NUMERIC(14, 2) NOT NULL,
  fee NUMERIC(14, 4) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 9. EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  effect JSONB DEFAULT '{}'::jsonb NOT NULL,
  requires_response BOOLEAN DEFAULT FALSE NOT NULL,
  choices JSONB DEFAULT '[]'::jsonb,
  starts_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 10. EVENT RESPONSES
-- ============================================
CREATE TABLE IF NOT EXISTS event_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  choice TEXT NOT NULL,
  reward JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(event_id, agent_id)
);

-- ============================================
-- 11. CLICK LOG
-- ============================================
CREATE TABLE IF NOT EXISTS click_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  gold_earned NUMERIC(14, 2) NOT NULL,
  click_power_at NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 12. RATE LIMITS (DB-backed fallback)
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  last_action_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  count INT DEFAULT 1 NOT NULL,
  window_start TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(agent_id, action)
);

-- ============================================
-- 13. CHAT MESSAGES (global agent chat)
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) >= 1 AND char_length(message) <= 500),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- INDEXES (IF NOT EXISTS)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);
CREATE INDEX IF NOT EXISTS idx_agents_alliance ON agents(alliance_id);
CREATE INDEX IF NOT EXISTS idx_agents_power_score ON agents(power_score DESC);
CREATE INDEX IF NOT EXISTS idx_agents_level ON agents(level DESC);
CREATE INDEX IF NOT EXISTS idx_agent_upgrades_agent ON agent_upgrades(agent_id);
CREATE INDEX IF NOT EXISTS idx_pvp_log_attacker ON pvp_log(attacker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_log_defender ON pvp_log(defender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_orders_open ON market_orders(side, status, price) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_market_orders_agent ON market_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_active ON events(ends_at);
CREATE INDEX IF NOT EXISTS idx_event_responses_event ON event_responses(event_id);
CREATE INDEX IF NOT EXISTS idx_click_log_agent ON click_log(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_agent_action ON rate_limits(agent_id, action);
CREATE INDEX IF NOT EXISTS idx_alliance_applications_alliance ON alliance_applications(alliance_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);

-- ============================================
-- FUNCTIONS (CREATE OR REPLACE = idempotent)
-- ============================================

-- Calculate idle earnings for an agent
CREATE OR REPLACE FUNCTION calculate_idle_earnings(p_agent_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_agent RECORD;
  v_elapsed_seconds NUMERIC;
  v_earnings NUMERIC;
  v_max_seconds NUMERIC := 28800; -- 8 hours
BEGIN
  SELECT idle_rate, karma, last_tick_at INTO v_agent
  FROM agents WHERE id = p_agent_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_agent.last_tick_at));
  IF v_elapsed_seconds < 1 THEN RETURN 0; END IF;
  IF v_elapsed_seconds > v_max_seconds THEN
    v_elapsed_seconds := v_max_seconds;
  END IF;

  v_earnings := v_agent.idle_rate * v_elapsed_seconds * v_agent.karma;

  UPDATE agents
  SET gold = gold + v_earnings,
      total_gold_earned = total_gold_earned + v_earnings,
      last_tick_at = NOW()
  WHERE id = p_agent_id;

  RETURN v_earnings;
END;
$$ LANGUAGE plpgsql;

-- Recalculate power score
CREATE OR REPLACE FUNCTION recalculate_power_score(p_agent_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC;
BEGIN
  SELECT (attack_power * 1.0 + defense_power * 0.8 + click_power * 0.5 + idle_rate * 100)
  INTO v_score
  FROM agents WHERE id = p_agent_id;

  UPDATE agents SET power_score = v_score WHERE id = p_agent_id;
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- Recalculate agent stats from upgrades
CREATE OR REPLACE FUNCTION recalculate_agent_stats(p_agent_id UUID)
RETURNS VOID AS $$
DECLARE
  v_click NUMERIC := 1;
  v_idle NUMERIC := 0.1;
  v_defense NUMERIC := 10;
  v_attack NUMERIC := 10;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT uc.category, uc.effect_per_level, au.level
    FROM agent_upgrades au
    JOIN upgrade_catalog uc ON uc.id = au.upgrade_id
    WHERE au.agent_id = p_agent_id
  LOOP
    CASE rec.category
      WHEN 'click' THEN v_click := v_click + (rec.effect_per_level * rec.level);
      WHEN 'idle' THEN v_idle := v_idle + (rec.effect_per_level * rec.level);
      WHEN 'defense' THEN v_defense := v_defense + (rec.effect_per_level * rec.level);
      WHEN 'attack' THEN v_attack := v_attack + (rec.effect_per_level * rec.level);
    END CASE;
  END LOOP;

  UPDATE agents
  SET click_power = v_click,
      idle_rate = v_idle,
      defense_power = v_defense,
      attack_power = v_attack
  WHERE id = p_agent_id;

  PERFORM recalculate_power_score(p_agent_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED: UPGRADE CATALOG (skip if already seeded)
-- ============================================
INSERT INTO upgrade_catalog (name, category, description, base_cost, cost_multiplier, effect_per_level, max_level, currency) VALUES
-- Click upgrades
('Sharp Claws', 'click', 'Increases click power by 0.5 per level', 50, 1.15, 0.5, 100, 'gold'),
('Neural Boost', 'click', 'Increases click power by 2.0 per level', 500, 1.20, 2.0, 50, 'gold'),
('Quantum Tap', 'click', 'Increases click power by 10.0 per level', 5000, 1.30, 10.0, 20, 'gems'),
-- Idle upgrades
('Passive Scanner', 'idle', 'Increases idle rate by 0.05/s per level', 100, 1.15, 0.05, 100, 'gold'),
('Auto-Miner', 'idle', 'Increases idle rate by 0.2/s per level', 1000, 1.20, 0.2, 50, 'gold'),
('Quantum Harvester', 'idle', 'Increases idle rate by 1.0/s per level', 10000, 1.30, 1.0, 20, 'gems'),
-- Defense upgrades
('Iron Shield', 'defense', 'Increases defense by 5 per level', 75, 1.15, 5, 100, 'gold'),
('Energy Barrier', 'defense', 'Increases defense by 15 per level', 750, 1.20, 15, 50, 'gold'),
('Quantum Armor', 'defense', 'Increases defense by 50 per level', 7500, 1.30, 50, 20, 'gems'),
-- Attack upgrades
('Blade Module', 'attack', 'Increases attack by 5 per level', 75, 1.15, 5, 100, 'gold'),
('Plasma Cannon', 'attack', 'Increases attack by 15 per level', 750, 1.20, 15, 50, 'gold'),
('Quantum Striker', 'attack', 'Increases attack by 50 per level', 7500, 1.30, 50, 20, 'gems')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- RLS POLICIES (drop + recreate for idempotency)
-- ============================================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_upgrades ENABLE ROW LEVEL SECURITY;
ALTER TABLE pvp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE upgrade_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first, then recreate
DROP POLICY IF EXISTS "Service role full access" ON agents;
DROP POLICY IF EXISTS "Service role full access" ON alliances;
DROP POLICY IF EXISTS "Service role full access" ON alliance_applications;
DROP POLICY IF EXISTS "Service role full access" ON agent_upgrades;
DROP POLICY IF EXISTS "Service role full access" ON pvp_log;
DROP POLICY IF EXISTS "Service role full access" ON market_orders;
DROP POLICY IF EXISTS "Service role full access" ON trade_log;
DROP POLICY IF EXISTS "Service role full access" ON events;
DROP POLICY IF EXISTS "Service role full access" ON event_responses;
DROP POLICY IF EXISTS "Service role full access" ON click_log;
DROP POLICY IF EXISTS "Service role full access" ON rate_limits;
DROP POLICY IF EXISTS "Service role full access" ON upgrade_catalog;
DROP POLICY IF EXISTS "Service role full access" ON chat_messages;

CREATE POLICY "Service role full access" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON alliances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON alliance_applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON agent_upgrades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON pvp_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON market_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON trade_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON event_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON click_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON rate_limits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON upgrade_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- ATOMIC CURRENCY FUNCTIONS (race condition prevention)
-- ============================================

CREATE OR REPLACE FUNCTION deduct_gold(p_agent_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE agents
  SET gold = gold - p_amount
  WHERE id = p_agent_id AND gold >= p_amount;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION deduct_gems(p_agent_id UUID, p_amount NUMERIC)
RETURNS BOOLEAN AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE agents
  SET gems = gems - p_amount
  WHERE id = p_agent_id AND gems >= p_amount;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_gold(p_agent_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE agents SET gold = gold + p_amount WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_gems(p_agent_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE agents SET gems = gems + p_amount WHERE id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_rate_limit(p_agent_id UUID, p_action TEXT, p_window_ms BIGINT, p_max_requests INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  SELECT window_start, count INTO v_window_start, v_count
  FROM rate_limits
  WHERE agent_id = p_agent_id AND action = p_action
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO rate_limits (agent_id, action, last_action_at, count, window_start)
    VALUES (p_agent_id, p_action, v_now, 1, v_now);
    RETURN TRUE;
  END IF;

  IF EXTRACT(EPOCH FROM (v_now - v_window_start)) * 1000 > p_window_ms THEN
    UPDATE rate_limits
    SET window_start = v_now, count = 1, last_action_at = v_now
    WHERE agent_id = p_agent_id AND action = p_action;
    RETURN TRUE;
  END IF;

  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  UPDATE rate_limits
  SET count = count + 1, last_action_at = v_now
  WHERE agent_id = p_agent_id AND action = p_action;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
