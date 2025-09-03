// utils/analysisParser.js

/**
 * Parses the LLM's analysis text into a structured object for database storage.
 * @param {string} analysisText - The raw text from the LLM between <ANALYSIS_START> and <ANALYSIS_END>
 * @returns {Object} Structured object with `improvements` array and `overall_category` string.
 */
// utils/analysisParser.js - SIMPLER VERSION
// utils/analysisParser.js - UPDATED PARSER
function parseAnalysisText(analysisText) {
  const result = {
    improvements: [],
    overall_category: 'Unknown'
  };

  if (!analysisText) return result;

  const lines = analysisText.split('\n');
  let inImprovementsSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Detect the start of the improvements section
    if (trimmedLine.match(/^##? Room for Improvement/i)) {
      inImprovementsSection = true;
      continue;
    }

    // Stop parsing if we hit the next section
    if (trimmedLine.match(/^##? Category Summary/i) || trimmedLine.match(/^##? Category:/i)) {
      inImprovementsSection = false;
      // You could add parsing for the overall category here
      const categoryMatch = trimmedLine.match(/\*\*Overall Level:\*\*\s*(\w+)/i);
      if (categoryMatch) {
        result.overall_category = categoryMatch[1];
      }
      continue;
    }

    // Parse improvements - UPDATED REGEX
    if (inImprovementsSection && trimmedLine.startsWith('-')) {
      // This regex now handles both formats:
      // - **[(Basic)]** **Issue Description:** text
      // - **[(Intermediate)]** **Issue Name:** text
      const issueMatch = trimmedLine.match(/-\s*\*\*\[\((\w+)\)\]\*\*\s*\*\*(.+?):\*\*\s*(.*)/i);
      
      if (issueMatch && issueMatch[1]) {
        const [, level, issueType, description] = issueMatch;
        
        result.improvements.push({
          issue: `${issueType}: ${description}`.trim(),
          level: level // This should now be 'Basic', 'Intermediate', or 'Advanced'
        });
      } else {
        // Fallback: try a simpler pattern just in case
        const fallbackMatch = trimmedLine.match(/-\s*\*\*\[\((\w+)\)\]\*\*\s*\*\*([^*]+)\*\*\s*(.*)/i);
        if (fallbackMatch) {
          const [, level, issue, description] = fallbackMatch;
          result.improvements.push({
            issue: description ? `${issue}: ${description}` : issue,
            level: level
          });
        }
      }
    }

    // Look for suggestion on the next line
    if (inImprovementsSection && result.improvements.length > 0 && trimmedLine.includes('**Suggestion:**')) {
      const lastImprovement = result.improvements[result.improvements.length - 1];
      lastImprovement.suggestion = trimmedLine.replace(/\*\*Suggestion:\*\*\s*/, '').trim();
    }
  }

  // Calculate overall category based on the highest level found
  if (result.improvements.length > 0) {
    const levels = result.improvements.map(imp => imp.level);
    // Prioritize Advanced > Intermediate > Basic
    if (levels.includes('Advanced')) result.overall_category = 'Advanced';
    else if (levels.includes('Intermediate')) result.overall_category = 'Intermediate';
    else result.overall_category = 'Basic';
  }

  return result;
}

module.exports = { parseAnalysisText };