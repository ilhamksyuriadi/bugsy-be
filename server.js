require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const connectDB = require('./config/database');

const SkillAnalysis = require('./models/skillAnalysis');
const { parseAnalysisText } = require('./utils/analysisParser');
const { mockResponseString } = require('./scripts/mockResponse');
// const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const RAG_API_BASE_URL = process.env.RAG_API_BASE_URL || 'http://localhost:8000'; 
// Connect to MongoDB Atlas
connectDB(); // This runs when your server starts

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
        await handlePullRequest(payload);
        // console.log('Review comments generated:', reviewComments);
        // await postReviewComments(payload, reviewComments);
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

async function storeSkillAnalysis(payload, analysisText) {
  try {
    console.log('🔍 RAW ANALYSIS TEXT FROM LLM:');
    console.log(analysisText); // This will show us what we're working with

    const parsedAnalysis = parseAnalysisText(analysisText);
    console.log('🔍 PARSED ANALYSIS:');
    console.log(JSON.stringify(parsedAnalysis, null, 2));

    const pr = payload.pull_request; // Shortcut for easier access
    

    // Create a new record with the enhanced data
    const analysisRecord = new SkillAnalysis({
      pr_id: payload.number,
      repo: payload.repository.full_name,
      author: pr.user.login,
      timestamp: new Date(),
      changes: {
        diff_url: pr.diff_url,
        file_count: pr.changed_files,    // ✅ Direct from payload
        additions: pr.additions,         // ✅ Direct from payload  
        deletions: pr.deletions,         // ✅ Direct from payload
        total_changes: pr.additions + pr.deletions // ✅ Easy calculation
        // removed changed_files: [] - no need for the list right now
      },
      analysis: parsedAnalysis
    });

    await analysisRecord.save();
    console.log('✅ Skill analysis saved to DB');

  } catch (error) {
    console.error('❌ Failed to save skill analysis:', error);
    // It's helpful to log the payload to debug if things are missing
    console.error('Payload excerpt:', {
      number: payload.number,
      'pr.changed_files': payload.pull_request?.changed_files,
      'pr.additions': payload.pull_request?.additions,
      'pr.deletions': payload.pull_request?.deletions
    });
  }
}


async function handlePullRequest(payload) {
  console.log(`Processing PR #${payload.number}`);

  // 1. Get the diff content
  const diffContent = await getDiffContent(payload);

  // 2. Get relevant context from your RAG API
  const relevantContext = await getRelevantContextFromRAG(diffContent);

  // 3. Prepare the review prompt
  const reviewPrompt = createReviewPrompt(diffContent, relevantContext, payload);

  // 4. Get review from DeepSeek API 
  // const llmResponse = await getDeepSeekReview(reviewPrompt);
  const llmResponse = mockResponseString
  console.log('🔍 RAW LLM RESPONSE:', llmResponse);

  // 5. Parse the response
  const reviewSection = extractSection(llmResponse, '<REVIEW_START>', '</REVIEW_END>');
  console.log('🔍 EXTRACTED REVIEW SECTION:', reviewSection);
  const analysisSection = extractSection(llmResponse, '<ANALYSIS_START>', '</ANALYSIS_END>');
  console.log('🔍 EXTRACTED ANALYSIS SECTION:', analysisSection);

  // 6. Post the review and store analysis IN PARALLEL for better performance
  await Promise.allSettled([
    postReviewComments(payload, reviewSection),
    storeSkillAnalysis(payload, analysisSection) // Pass diffContent here
  ]);

  // return reviewComments;
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
        k: 3 // Number of context chunks to retrieve. Adjust as needed.
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

function extractSection(text, startMarker, endMarker) {
  const startIndex = text.indexOf(startMarker) + startMarker.length;
  const endIndex = text.indexOf(endMarker);
  if (startIndex === -1 || endIndex === -1) {
    console.warn("Could not find markers in LLM response. Using fallback.");
    return text; // Fallback: return the whole text
  }
  return text.substring(startIndex, endIndex).trim();
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
    # ROLE & GOAL
    You are an expert, meticulous, and constructive senior software engineer performing a code review for a colleague. Your goal is to improve the code quality and share knowledge, not just find faults.
    
    # CONTEXT FROM CODEBASE
    <CONTEXT_START>
    ${relevantContext}
    <CONTEXT_END>

    # PULL REQUEST DETAILS
    **PR Title:** ${payload.pull_request.title}
    **PR Description:** ${payload.pull_request.body || 'No description provided.'}
    **PR Author:** ${payload.pull_request.user.login}

    # CODE CHANGES (DIFF)
    <DIFF_START>
    ${diffContent}
    <DIFF_END>

    **Focus your analysis on:**
    1.  **Correctness & Bugs:** Will this work as intended? Are there edge cases, race conditions, or logical errors?
    2.  **Security:** Are there any obvious vulnerabilities (e.g., XSS, SQLi, insecure dependencies, authZ/authN flaws)?
    3.  **Performance & Scalability:** Could this cause slow operations, memory leaks, or not scale well?
    4.  **Consistency & Patterns:** Does this follow the patterns and conventions established in the provided context from our codebase? If it introduces a new pattern, is it justified and better?
    5.  **Maintainability & Readability:** Is the code clear, well-documented, and easy to understand? Would a new team member struggle with this?
    6.  **Design & Architecture:** Are the changes well-structured? Is there tight coupling, poor separation of concerns, or missed opportunities for abstraction?

    # OUTPUT FORMATTING RULES - CRITICAL
    You MUST format your response using the following exact structure and markers. Do not deviate.

    <REVIEW_START>
    ## 🧐 Comprehensive Code Review
    [Provide your full, detailed review here using markdown. Structure it using the points above (Correctness, Security, etc.) as headings. Be specific, cite lines from the diff if possible, and offer concrete suggestions and code examples for fixes.]
    </REVIEW_END>

    <ANALYSIS_START>
    ## Room for Improvement
    For each significant issue found, categorize it and provide a concise learning suggestion. Focus on the most impactful issues.

    CRITICAL FORMATTING RULES:
    - Each issue MUST start with: - **[(Basic|Intermediate|Advanced)]** 
    - The level MUST be one of those three exact words
    - If you don't know the level, DON'T include the issue
    - Invalid formatting will cause system errors

    Examples:
    - **[(Basic|Intermediate|Advanced)]** **Issue Description:** [One sentence describing the specific issue, e.g., "Using \`var\` instead of \`let\`/\`const\`."]
      - **Suggestion:** [One sentence suggestion, e.g., "Learn about JavaScript scoping: MDN link on \`let\` and \`const\`."]
    - **[(Basic|Intermediate|Advanced)]** **Inconsistent Naming:** [e.g., "Function name \`fetchData()\` doesn't follow the project's \`getResource\` pattern."]
      - **Suggestion:** [e.g., "Review the project's naming conventions in \`CONTRIBUTING.md\`."]
    - **[(Basic|Intermediate|Advanced)]** **Missing Error Handling:** [e.g., "The API call in \`newFeature.ts\` lacks a \`try/catch\` block."]
      - **Suggestion:** [e.g., "Learn about asynchronous error handling patterns in our codebase. See how it's done in \`src/utils/api.ts\`."]

    ## Category Summary
    **Overall Level:** [Basic|Intermediate|Advanced]
    *(A summary based on the highest frequency and severity of the issues found. e.g., "Intermediate - Mostly consistent with a few notable gaps in error handling.")*
    </ANALYSIS_END>
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
            content: "You are an expert, meticulous, and constructive senior software engineer performing a code review for a colleague. Your goal is to improve the code quality and share knowledge, not just find faults."
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
  console.log(`Webhook URL: https://7d02eea48689.ngrok-free.app/github-webhook`);
});
