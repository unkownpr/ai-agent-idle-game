const env = require('./config/env');
const createApp = require('./app');

const app = createApp();

app.listen(env.port, () => {
  console.log(`AI Agents Game API running on port ${env.port}`);
  console.log(`Environment: ${env.nodeEnv}`);
  console.log(`Docs: http://localhost:${env.port}/docs`);
});
