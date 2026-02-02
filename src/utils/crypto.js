const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function generateApiKey() {
  return `ag_${crypto.randomBytes(32).toString('hex')}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function generateId() {
  return uuidv4();
}

module.exports = { generateApiKey, hashApiKey, generateId };
