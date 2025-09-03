// models/SkillAnalysis.js
const mongoose = require('mongoose');

const improvementSchema = new mongoose.Schema({
  issue: String,
  level: { type: String, enum: ['Basic', 'Intermediate', 'Advanced'] },
  suggestion: String // Let's add this to store the suggestion too
});

const skillAnalysisSchema = new mongoose.Schema({
  pr_id: Number,
  repo: String,
  author: String,
  timestamp: { type: Date, default: Date.now },
  
  // SIMPLE but powerful changes metadata
  changes: {
    diff_url: String,
    file_count: Number,  // From payload.pull_request.changed_files
    additions: Number,   // From payload.pull_request.additions
    deletions: Number,   // From payload.pull_request.deletions
    total_changes: Number // Calculated field: additions + deletions
  },
  
  analysis: {
    improvements: [improvementSchema],
    overall_category: String
  }
});

module.exports = mongoose.model('SkillAnalysis', skillAnalysisSchema);