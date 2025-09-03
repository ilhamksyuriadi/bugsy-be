javascript
// utils/diffParser.js

/**
 * Counts the number of files changed in a Git diff string.
 * @param {string} diffContent - The raw diff text from GitHub
 * @returns {number} Count of files changed
 */
function countFilesInDiff(diffContent) {
  if (!diffContent) return 0;
  
  // A new file in a diff starts with "diff --git a/"
  const fileCount = (diffContent.match(/^diff --git a\//gm) || []).length;
  return fileCount;
}