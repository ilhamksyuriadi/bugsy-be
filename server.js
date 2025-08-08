require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

function verifySignature(req, secret) {
  const signature = req.headers['x-hub-signature-256'] || '';
  const hmac = crypto.createHmac('sha256', secret);
  const digest = Buffer.from('sha256=' + hmac.update(req.rawBody).digest('hex'), 'utf8');
  const checksum = Buffer.from(signature, 'utf8');
  return crypto.timingSafeEqual(digest, checksum);
}

// Webhook endpoint
app.post('/github-webhook', async (req, res) => {
  console.log('Webhook received!');
  // res.status(200).send('OK');
  // Verify signature first...
  // console.log('REQQQQ', req);
  // console.log('RESSSS', res);

  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`Received event: ${event}`);
  console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

  // if (event === 'pull_request') {
  //   console.log(`PR Action: ${payload.action}`);

  //   // Only process when PR is opened or updated
  //   if (['opened', 'synchronize'].includes(payload.action)) {
  //     try {
  //       await handlePullRequest(payload);
  //       res.status(200).send('PR processing started');
  //     } catch (error) {
  //       console.error('Error:', error);
  //       res.status(500).send('Error processing PR');
  //     }
  //   } else {
  //     res.status(200).send('PR action not processed');
  //   }
  // } else {
  //   res.status(200).send('Event not handled');
  // }
});

async function handlePullRequest(payload) {
  console.log(`Processing PR #${payload.number}`);
  console.log(`PR Title: ${payload.pull_request.title}`);

  // Get the diff URL from the payload
  const diffUrl = payload.pull_request.diff_url;
  console.log(`Diff URL: ${diffUrl}`);

  // Fetch the diff content
  const diffResponse = await axios.get(diffUrl);
  const diffContent = diffResponse.data;

  console.log('Received diff content:');
  console.log(diffContent.substring(0, 500) + '...'); // Log first 500 chars

  // Here you would normally send to DeepSeek API
  // For now just log the diff
  return diffContent;
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook URL: https://bed9bd5a8692.ngrok-free.app/github-webhook`);
});
