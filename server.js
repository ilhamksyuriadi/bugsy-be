require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
// const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const RAG_API_BASE_URL = process.env.RAG_API_BASE_URL || 'http://localhost:8000'; 

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

  // 1. Get the diff content
  const diffContent = await getDiffContent(payload);

  // 2. [NEW STEP] Get relevant context from your RAG API
  const relevantContext = await getRelevantContextFromRAG(diffContent);

  // 3. Prepare the review prompt, now INCLUDING the retrieved context
  const reviewPrompt = createReviewPrompt(diffContent, relevantContext, payload);

  // 4. Get review from DeepSeek API
  const reviewComments = await getDeepSeekReview(reviewPrompt);

  return reviewComments;
}

async function getDiffContent(payload) {
  const diffUrl = payload.pull_request.diff_url;
  const diffResponse = await axios.get(diffUrl);
  return diffResponse.data;
}

// [NEW FUNCTION] This function calls your Python RAG API
async function getRelevantContextFromRAG(diffText) {
  console.log('Fetching relevant context from RAG API...');
  try {
    const response = await axios.post(
      `${RAG_API_BASE_URL}/retrieve-context`, // Your RAG endpoint
      {
        diff_text: diffText,
        k: 5 // Number of context chunks to retrieve. Adjust as needed.
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    console.log('✅ Successfully retrieved context from RAG API');
    // Format the context into a nice string for the prompt
    return formatRetrievedContext(response.data.retrieved_context);
  } catch (error) {
    console.error('❌ RAG API error:', error.message);
    // It's crucial to handle this error gracefully.
    // If the RAG API is down, we can still proceed with a basic review.
    return "**Warning:** Could not retrieve relevant context from the codebase. Review is based on general best practices only.\n";
  }
}

function formatRetrievedContext(contextArray) {
  if (!contextArray || contextArray.length === 0) {
    return "No relevant context was found in the codebase for these changes.\n";
  }

  let contextString = "## RELEVANT CONTEXT FROM THE CODEBASE:\n";
  contextString += "Here are snippets from the existing codebase that are related to this change:\n\n";

  contextArray.forEach((chunk, index) => {
    contextString += `### Context Snippet ${index + 1} (From: ${chunk.file_path})\n`;
    contextString += '```\n';
    contextString += chunk.content + '\n';
    contextString += '```\n\n';
  });

  return contextString;
}

function createReviewPrompt(diffContent, relevantContext, payload) {
  return `
    Please review these code changes for pull request #${payload.number}:
    Title: ${payload.pull_request.title}
    Description: ${payload.pull_request.body || 'No description provided'}

    ${relevantContext}

    Code changes (DIFF):
    ${diffContent}

    Review requirements:
    1. Analyze for code quality issues, consistency with the existing codebase patterns shown above, and potential conflicts.
    2. Check for potential bugs, paying special attention to how this change interacts with the related code shown in the context.
    3. Identify security concerns based on the patterns in use.
    4. Suggest improvements, optimizations, and best practices. If the context shows a established pattern, suggest following it. If it shows a bad pattern, suggest improving it in both this new code and the old one.
    5. Format response in markdown with clear sections.
    6. Keep comments actionable and specific. Reference the relevant context files if applicable.

    Make sure to give code example/solution for each point if applicable.

    Make sure the review format looks like this:
    1. point 1
      [bullet list for sub points]
        [bullet list outlined for sub sub points]
    2. point 2
      [bullet list for sub points]
        [bullet list outlined for sub sub points]
    ...continue until all points are covered

    No need to ask back, just provide a thorough review based on the changes and the context above.
    Also please identify room for improvement for the pr creator to learn and give learning suggestion/references under word "Room for Improvement:" don't put any markdown on this one.
    Based on "Room for Improvement:" categorize in which level of each issue (basic, intermediate, advance) put it in point format start with -, then give overall/average category of all issue under of it, put it under section "Category:". don't put any markdown or font style on this one.
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
