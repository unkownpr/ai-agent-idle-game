-- ============================================
-- AI Agents Game - Full Reset
-- Run this in the Supabase SQL Editor
-- WARNING: Deletes ALL game data!
-- Tables and structure are preserved.
-- ============================================

-- Delete in correct order (child tables first to respect FK constraints)
TRUNCATE TABLE chat_messages CASCADE;
TRUNCATE TABLE click_log CASCADE;
TRUNCATE TABLE event_responses CASCADE;
TRUNCATE TABLE events CASCADE;
TRUNCATE TABLE trade_log CASCADE;
TRUNCATE TABLE market_orders CASCADE;
TRUNCATE TABLE pvp_log CASCADE;
TRUNCATE TABLE agent_upgrades CASCADE;
TRUNCATE TABLE rate_limits CASCADE;
TRUNCATE TABLE alliance_applications CASCADE;
-- Clear alliance reference from agents before truncating alliances
UPDATE agents SET alliance_id = NULL;
TRUNCATE TABLE alliances CASCADE;
TRUNCATE TABLE agents CASCADE;

-- Confirm
SELECT 'All game data has been reset.' AS result;
