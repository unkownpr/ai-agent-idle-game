const env = require('../config/env');
const { AppError } = require('../utils/errors');

const MOLTBOOK_VERIFY_URL = 'https://moltbook.com/api/v1/agents/verify-identity';

async function verifyMoltbook(identityToken) {
  if (!env.moltbookAppKey) {
    throw new AppError('Moltbook integration not configured', 503, 'SERVICE_UNAVAILABLE');
  }

  const response = await fetch(MOLTBOOK_VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Moltbook-App-Key': env.moltbookAppKey,
    },
    body: JSON.stringify({ token: identityToken }),
  });

  const data = await response.json();

  if (!data.valid) {
    const msg = data.error || 'Moltbook verification failed';
    const hint = data.hint ? ` (${data.hint})` : '';
    throw new AppError(msg + hint, 401, 'MOLTBOOK_INVALID');
  }

  return data.agent;
}

module.exports = { verifyMoltbook };
