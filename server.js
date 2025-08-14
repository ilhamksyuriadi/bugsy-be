require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
// const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// function verifySignature(req, secret) {
//   const signature = req.headers['x-hub-signature-256'] || '';
//   const hmac = crypto.createHmac('sha256', secret);
//   const digest = Buffer.from('sha256=' + hmac.update(req.rawBody).digest('hex'), 'utf8');
//   const checksum = Buffer.from(signature, 'utf8');
//   return crypto.timingSafeEqual(digest, checksum);
// }

// Webhook endpoint
app.post('/github-webhook', async (req, res) => {
  // verif here, wil continue later
  // if (!verifySignature(req, process.env.WEBHOOK_SECRET)) {
  //   return res.status(403).send('Invalid signature');
  // }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  if (event === 'pull_request') {
    if (['opened', 'synchronize'].includes(payload.action)) {
      try {
        const reviewComments = await handlePullRequest(payload);
        console.log('Review comments generated:', reviewComments);
        await postReviewComments(payload, reviewComments);
        res.status(200).send('PR review completed');
      } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error processing PR');
      }
    } else {
      res.status(200).send('PR action not processed');
    }
  } else {
    res.status(200).send('Event not handled');
  }
});

async function handlePullRequest(payload) {
  console.log(`Processing PR #${payload.number}`);

  // Get the diff content
  const diffContent = await getDiffContent(payload);

  // Prepare the review prompt
  const reviewPrompt = createReviewPrompt(diffContent, payload);

  // Get review from DeepSeek API
  const reviewComments = await getDeepSeekReview(reviewPrompt);

  return reviewComments;
}

async function getDiffContent(payload) {
  const diffUrl = payload.pull_request.diff_url;
  const diffResponse = await axios.get(diffUrl);
  return diffResponse.data;
}

function createReviewPrompt(diffContent, payload) {
  return `
    Please review these code changes for pull request #${payload.number}:
    Title: ${payload.pull_request.title}
    Description: ${payload.pull_request.body || 'No description provided'}

    Code changes:
    ${diffContent}

    Review requirements:
    1. Analyze for code quality issues
    2. Check for potential bugs
    3. Identify security concerns
    4. Suggest improvements, optimizations, modern practices and best practices
    5. Format response in markdown with clear sections
    6. Keep comments actionable and specific

    make sure to give code example/solution for each point if applicable.

    make sure the review format looks like this:
    1. point 1
      [bullet list for sub points]
        [bullet list outlined for sub sub points]
    2. point 2
      [bullet list for sub points]
        [bullet list outlined for sub sub points]
    ...countinue until all points are covered

    No need to ask back, just provide a thorough review based on the changes above.
    Also please indentify room for improvement for the pr creator to learn and give learning suggestion/refferences under word "Room for Improvement:" don't put any markdown on this one.
    Based on "Room for Improvement:" categorize in which level of each issue (basic, intermediate, advance) put it in point formart start with -, then give overall/averge category of all issue under of it, put it under section "Category:". don't put any markdown or font style on this one.
    `;
}

async function getDeepSeekReview(prompt) {
  console.log('Sending review request to DeepSeek API...');
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: "deepseek/deepseek-r1-0528:free",
        messages: [
          {
            role: "system",
            content: "You are an expert code reviewer. Provide thorough, professional analysis of these changes."
          },
          {
            role: "user",
            content: prompt
          }
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_R1_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('OpenRouter DeepSeek API error:', error.response?.data || error.message);
    throw error;
  }
}

// working on pr: 14, 17, 19, 20, 21, 22, 23, 24
async function postReviewComments(payload, reviewComments) {
  const repo = payload.repository.full_name;
  const prNumber = payload.number;

  const comment = {
    body: `## Bugsy-bot's Review\n\n${reviewComments}\n\n\n\n*This is an automated review*`
  };

  try {
    console.log(`Attempting to post comment to PR #${prNumber} in ${repo}...`);

    const response = await axios.post(
      `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
      comment,
      {
        headers: {
          'Authorization': `Bearer ${process.env.BOT_GITHUB_TOKEN_CLASSIC}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PR-Review-Bot' // GitHub requires this
        }
      }
    );

    console.log('✅ Review comments posted successfully!');
    console.log(`Comment URL: ${response.data.html_url}`); // Log the created comment URL
    return response.data;

  } catch (error) {
    console.error('❌ Failed to post comment:', {
      PR: `${repo}#${prNumber}`,
      Status: error.response?.status,
      Error: error.response?.data?.message || error.message,
      Headers: error.response?.headers,
      Docs: error.response?.data?.documentation_url, // GitHub's troubleshooting link
      FullError: error.response?.data // Only for debugging, might contain sensitive info
    });

    throw error; // Re-throw if you want calling function to handle it
  }
}

// function parseDiff(diffContent) {
//   // Split by files
//   const files = diffContent.split('diff --git ');
//   return files.slice(1).map(file => {
//     const lines = file.split('\n');
//     return {
//       filename: lines[0].split(' ')[1].replace('a/', ''),
//       changes: lines.slice(3).join('\n') // Skip metadata lines
//     };
//   });
// }

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook URL: https://6e485c501c2c.ngrok-free.app/github-webhook`);
});
