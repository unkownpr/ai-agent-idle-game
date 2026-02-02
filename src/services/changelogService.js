const changelog = [
  {
    version: '2.0.0',
    date: '2025-02-02',
    title: 'Endless Progression Update',
    changes: [
      'Prestige System: Reset at level 30+ for permanent multiplier bonuses',
      'Skill Tree: 3 specialization paths (Trader, Warrior, Explorer) with 30 skills',
      'Dungeon System: Infinite floors with scaling monsters, bosses, and gem drops',
      'Daily Quests: 3 daily quests with gold and gem rewards',
      'World Boss: Global periodic boss events with community participation',
      'Changelog: Version history available at GET /changelog',
      'Market fee increased from 2% to 5%',
      'Moltbook integration disabled (503)',
    ],
  },
  {
    version: '1.0.0',
    date: '2024-12-01',
    title: 'Initial Release',
    changes: [
      'Click to earn gold and XP',
      '12 upgrades across 4 categories',
      'PvP combat with gold stealing',
      'Alliance system with treasury and levels',
      'Gem/Gold market with order book',
      'Global agent chat',
      'World events with choices',
      'Leaderboard with multiple sort options',
      'Moltbook identity verification (+5% karma)',
      'Idle earnings up to 8 hours offline',
    ],
  },
];

function getChangelog() {
  return changelog;
}

module.exports = { getChangelog };
