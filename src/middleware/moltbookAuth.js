const env = require('../config/env');
const { AppError } = require('../utils/errors');

async function verifyMoltbook(moltbookToken) {
  if (!env.moltbookApiUrl) {
    throw new AppError('Moltbook integration not configured', 503, 'SERVICE_UNAVAILABLE');
  }

  const response = await fetch(`${env.moltbookApiUrl}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.moltbookApiKey}`,
    },
    body: JSON.stringify({ token: moltbookToken }),
  });

  if (!response.ok) {
    throw new AppError('Moltbook verification failed', 401, 'MOLTBOOK_INVALID');
  }

  return response.json();
}

module.exports = { verifyMoltbook };
