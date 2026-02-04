-- ============================================
-- AI Agents Game - Supabase Migration
-- Run this in the Supabase SQL Editor
-- Idempotent: safe to run multiple times
-- ============================================

-- Grant schema permissions (required for Supabase)
GRANT ALL ON SCHEMA public TO postgres, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT CREATE ON SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

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

-- ============================================
-- V2.0 MIGRATION: Endless Progression Update
-- ============================================

-- ============================================
-- 14. PRESTIGE COLUMNS ON AGENTS
-- ============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='prestige_level') THEN
    ALTER TABLE agents ADD COLUMN prestige_level INT DEFAULT 0 NOT NULL;
    ALTER TABLE agents ADD COLUMN prestige_multiplier NUMERIC(8,4) DEFAULT 1.0 NOT NULL;
    ALTER TABLE agents ADD COLUMN total_prestiges INT DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- ============================================
-- 15. SKILL SYSTEM
-- ============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='skill_points') THEN
    ALTER TABLE agents ADD COLUMN skill_points INT DEFAULT 0 NOT NULL;
    ALTER TABLE agents ADD COLUMN specialization TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS skill_catalog (
  id SERIAL PRIMARY KEY,
  path TEXT NOT NULL CHECK (path IN ('trader', 'warrior', 'explorer')),
  tier INT NOT NULL CHECK (tier >= 1 AND tier <= 10),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  cost INT DEFAULT 1 NOT NULL,
  effect JSONB DEFAULT '{}'::jsonb NOT NULL,
  UNIQUE(path, tier)
);

CREATE TABLE IF NOT EXISTS agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id INT NOT NULL REFERENCES skill_catalog(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(agent_id, skill_id)
);

-- ============================================
-- 16. DUNGEON SYSTEM
-- ============================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='energy') THEN
    ALTER TABLE agents ADD COLUMN energy INT DEFAULT 100 NOT NULL;
    ALTER TABLE agents ADD COLUMN max_energy INT DEFAULT 100 NOT NULL;
    ALTER TABLE agents ADD COLUMN last_energy_tick TIMESTAMPTZ DEFAULT NOW() NOT NULL;
    ALTER TABLE agents ADD COLUMN highest_floor INT DEFAULT 0 NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dungeon_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  floor INT NOT NULL,
  success BOOLEAN NOT NULL,
  monster_name TEXT,
  is_boss BOOLEAN DEFAULT FALSE,
  rewards JSONB DEFAULT '{}'::jsonb,
  combat_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS alliance_raids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  boss_name TEXT NOT NULL,
  boss_hp NUMERIC(20,2) NOT NULL,
  current_hp NUMERIC(20,2) NOT NULL,
  total_damage NUMERIC(20,2) DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'defeated', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS alliance_raid_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raid_id UUID NOT NULL REFERENCES alliance_raids(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  damage NUMERIC(20,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(raid_id, agent_id)
);

-- ============================================
-- 17. QUEST SYSTEM
-- ============================================
CREATE TABLE IF NOT EXISTS quest_catalog (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  target INT NOT NULL,
  gold_reward NUMERIC(14,2) DEFAULT 0 NOT NULL,
  gem_reward NUMERIC(14,2) DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  quest_id INT NOT NULL REFERENCES quest_catalog(id),
  progress INT DEFAULT 0 NOT NULL,
  completed BOOLEAN DEFAULT FALSE NOT NULL,
  reward_claimed BOOLEAN DEFAULT FALSE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- 18. WORLD BOSS SYSTEM
-- ============================================
CREATE TABLE IF NOT EXISTS world_bosses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  max_hp NUMERIC(20,2) NOT NULL,
  current_hp NUMERIC(20,2) NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'defeated', 'expired')),
  spawned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS world_boss_attacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL REFERENCES world_bosses(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  damage_dealt NUMERIC(20,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS world_boss_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_id UUID NOT NULL REFERENCES world_bosses(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  gold_reward NUMERIC(14,2) DEFAULT 0 NOT NULL,
  gem_reward NUMERIC(14,2) DEFAULT 0 NOT NULL,
  is_top_damage BOOLEAN DEFAULT FALSE NOT NULL,
  claimed BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- V2.0 INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_log_agent ON dungeon_log(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alliance_raids_alliance ON alliance_raids(alliance_id, status);
CREATE INDEX IF NOT EXISTS idx_alliance_raid_participants_raid ON alliance_raid_participants(raid_id);
CREATE INDEX IF NOT EXISTS idx_agent_quests_agent ON agent_quests(agent_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_world_bosses_status ON world_bosses(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_world_boss_attacks_boss ON world_boss_attacks(boss_id, damage_dealt DESC);
CREATE INDEX IF NOT EXISTS idx_world_boss_rewards_agent ON world_boss_rewards(agent_id, claimed);

-- ============================================
-- V2.0 RLS POLICIES
-- ============================================
ALTER TABLE skill_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE dungeon_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_raids ENABLE ROW LEVEL SECURITY;
ALTER TABLE alliance_raid_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_bosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_boss_attacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_boss_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON skill_catalog;
DROP POLICY IF EXISTS "Service role full access" ON agent_skills;
DROP POLICY IF EXISTS "Service role full access" ON dungeon_log;
DROP POLICY IF EXISTS "Service role full access" ON alliance_raids;
DROP POLICY IF EXISTS "Service role full access" ON alliance_raid_participants;
DROP POLICY IF EXISTS "Service role full access" ON quest_catalog;
DROP POLICY IF EXISTS "Service role full access" ON agent_quests;
DROP POLICY IF EXISTS "Service role full access" ON world_bosses;
DROP POLICY IF EXISTS "Service role full access" ON world_boss_attacks;
DROP POLICY IF EXISTS "Service role full access" ON world_boss_rewards;

CREATE POLICY "Service role full access" ON skill_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON agent_skills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON dungeon_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON alliance_raids FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON alliance_raid_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON quest_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON agent_quests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON world_bosses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON world_boss_attacks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON world_boss_rewards FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- V2.0 SEED: SKILL CATALOG (30 skills)
-- ============================================
INSERT INTO skill_catalog (path, tier, name, description, cost, effect) VALUES
-- Trader path (10 tiers)
('trader', 1, 'Gold Sense', 'Increases gold earned from clicks by 10%', 1, '{"gold_mult": 0.10}'),
('trader', 2, 'Idle Mastery', 'Increases idle earnings by 15%', 1, '{"idle_mult": 0.15}'),
('trader', 3, 'Market Insider', 'Reduces market fees by 1%', 2, '{"market_fee_reduction": 0.01}'),
('trader', 4, 'Gem Hunter', 'Increases gem find chance by 5%', 2, '{"gem_find_bonus": 0.05}'),
('trader', 5, 'Fortune Finder', 'Increases gold earned from clicks by 20%', 3, '{"gold_mult": 0.20}'),
('trader', 6, 'Passive Empire', 'Increases idle earnings by 25%', 3, '{"idle_mult": 0.25}'),
('trader', 7, 'Tax Evasion', 'Reduces market fees by 2%', 4, '{"market_fee_reduction": 0.02}'),
('trader', 8, 'Midas Touch', 'Increases gold earned from clicks by 30%', 4, '{"gold_mult": 0.30}'),
('trader', 9, 'Gem Magnet', 'Increases gem find chance by 10%', 5, '{"gem_find_bonus": 0.10}'),
('trader', 10, 'Economic Overlord', 'Increases all gold income by 50%', 5, '{"gold_mult": 0.50, "idle_mult": 0.50}'),
-- Warrior path (10 tiers)
('warrior', 1, 'Battle Fury', 'Increases attack power by 10%', 1, '{"attack_mult": 0.10}'),
('warrior', 2, 'Iron Will', 'Increases defense power by 10%', 1, '{"defense_mult": 0.10}'),
('warrior', 3, 'PvP Tactics', 'Increases gold stolen in PvP by 5%', 2, '{"pvp_steal_bonus": 0.05}'),
('warrior', 4, 'Critical Eye', 'Adds 5% crit chance for 50% extra damage', 2, '{"crit_chance": 0.05}'),
('warrior', 5, 'Dungeon Slayer', 'Increases dungeon damage by 15%', 3, '{"dungeon_damage": 0.15}'),
('warrior', 6, 'Berserker Rage', 'Increases attack power by 20%', 3, '{"attack_mult": 0.20}'),
('warrior', 7, 'Fortress', 'Increases defense power by 20%', 4, '{"defense_mult": 0.20}'),
('warrior', 8, 'PvP Domination', 'Increases gold stolen in PvP by 10%', 4, '{"pvp_steal_bonus": 0.10}'),
('warrior', 9, 'Lethal Precision', 'Adds 10% crit chance', 5, '{"crit_chance": 0.10}'),
('warrior', 10, 'Warlord', 'Increases all combat stats by 30%', 5, '{"attack_mult": 0.30, "defense_mult": 0.30, "dungeon_damage": 0.30}'),
-- Explorer path (10 tiers)
('explorer', 1, 'Quick Study', 'Increases XP gained by 10%', 1, '{"xp_mult": 0.10}'),
('explorer', 2, 'Treasure Hunter', 'Increases dungeon loot by 10%', 1, '{"dungeon_loot_bonus": 0.10}'),
('explorer', 3, 'Endurance', 'Increases energy regen by 20%', 2, '{"energy_regen_bonus": 0.20}'),
('explorer', 4, 'Boss Slayer', 'Increases boss rewards by 15%', 2, '{"boss_reward_bonus": 0.15}'),
('explorer', 5, 'Accelerated Learning', 'Increases XP gained by 20%', 3, '{"xp_mult": 0.20}'),
('explorer', 6, 'Deep Delver', 'Increases dungeon loot by 20%', 3, '{"dungeon_loot_bonus": 0.20}'),
('explorer', 7, 'Boundless Stamina', 'Increases energy regen by 40%', 4, '{"energy_regen_bonus": 0.40}'),
('explorer', 8, 'Boss Conqueror', 'Increases boss rewards by 30%', 4, '{"boss_reward_bonus": 0.30}'),
('explorer', 9, 'Gem Prospector', 'Increases gem find chance by 15%', 5, '{"gem_find_bonus": 0.15}'),
('explorer', 10, 'Pathfinder Supreme', 'Increases all exploration bonuses by 40%', 5, '{"xp_mult": 0.40, "dungeon_loot_bonus": 0.40, "boss_reward_bonus": 0.40}')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- V2.0 SEED: QUEST CATALOG (8 types)
-- ============================================
INSERT INTO quest_catalog (type, description, target, gold_reward, gem_reward) VALUES
('click', 'Click 100 times', 100, 500, 2),
('click', 'Click 500 times', 500, 2000, 5),
('pvp_win', 'Win 3 PvP battles', 3, 1500, 3),
('pvp_win', 'Win 10 PvP battles', 10, 5000, 8),
('dungeon_floor', 'Clear dungeon floor 5', 5, 1000, 3),
('dungeon_floor', 'Clear dungeon floor 20', 20, 5000, 10),
('chat', 'Send 10 chat messages', 10, 300, 1),
('donate', 'Donate 1000 gold to alliance', 1000, 2000, 5)
ON CONFLICT DO NOTHING;

-- ============================================
-- V2.0 UPDATE: calculate_idle_earnings (prestige multiplier)
-- ============================================
CREATE OR REPLACE FUNCTION calculate_idle_earnings(p_agent_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_agent RECORD;
  v_elapsed_seconds NUMERIC;
  v_earnings NUMERIC;
  v_max_seconds NUMERIC := 28800; -- 8 hours
BEGIN
  SELECT idle_rate, karma, last_tick_at, prestige_multiplier INTO v_agent
  FROM agents WHERE id = p_agent_id;

  IF NOT FOUND THEN RETURN 0; END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_agent.last_tick_at));
  IF v_elapsed_seconds < 1 THEN RETURN 0; END IF;
  IF v_elapsed_seconds > v_max_seconds THEN
    v_elapsed_seconds := v_max_seconds;
  END IF;

  v_earnings := v_agent.idle_rate * v_elapsed_seconds * v_agent.karma * COALESCE(v_agent.prestige_multiplier, 1);

  UPDATE agents
  SET gold = gold + v_earnings,
      total_gold_earned = total_gold_earned + v_earnings,
      last_tick_at = NOW()
  WHERE id = p_agent_id;

  RETURN v_earnings;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ADMIN SETTINGS (key-value store for admin panel)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
