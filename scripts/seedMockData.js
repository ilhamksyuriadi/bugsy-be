// scripts/seedAdvancedMockData.js
require('dotenv').config();
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');

const connectDB = require('../config/database');
const SkillAnalysis = require('../models/skillAnalysis');

// More detailed sample data
const REPOSITORIES = [
  { name: 'company-frontend', type: 'Angular' },
  { name: 'api-gateway', type: 'Node.js' },
  { name: 'mobile-app', type: 'React Native' },
  { name: 'data-service', type: 'Python' }
];

const AUTHORS = [
  { username: 'dadang-angular', seniority: 'Senior' },
  { username: 'cecep-backend-master', seniority: 'Mid-level' },
  { username: 'charlie-javascript', seniority: 'Junior' },
  { username: 'anto-tambal-bug', seniority: 'Senior' }
];

const ISSUE_TEMPLATES = {
  Basic: [
    "Missing error handling for API calls",
    "Using var instead of let/const",
    "Inconsistent naming conventions",
    "Missing TypeScript types",
    "Hardcoded values instead of constants"
  ],
  Intermediate: [
    "Improper component lifecycle usage",
    "Inefficient database queries",
    "Poor state management implementation",
    "Missing authentication checks",
    "Inadequate test coverage"
  ],
  Advanced: [
    "Architectural pattern violations",
    "SSR hydration issues",
    "Memory leak potential",
    "Security vulnerability patterns",
    "Microservices communication anti-patterns"
  ]
};

const SUGGESTIONS = {
  Basic: [
    "Review basic JavaScript/TypeScript best practices",
    "Study error handling patterns in the codebase",
    "Read the team's style guide and conventions",
    "Complete the onboarding tutorial on TypeScript"
  ],
  Intermediate: [
    "Learn about React/Angular lifecycle methods",
    "Study database optimization techniques",
    "Review state management library documentation",
    "Pair with a senior developer on testing strategies"
  ],
  Advanced: [
    "Read about clean architecture principles",
    "Study server-side rendering best practices",
    "Review memory management patterns",
    "Attend the advanced security workshop"
  ]
};

async function createAdvancedMockData() {
  try {
    await connectDB();
    await SkillAnalysis.deleteMany({});

    const mockRecords = [];
    const numberOfRecords = 100;

    for (let i = 0; i < numberOfRecords; i++) {
      const repo = faker.helpers.arrayElement(REPOSITORIES);
      const author = faker.helpers.arrayElement(AUTHORS);
      
      const improvements = generateImprovements(author.seniority);
      const overallCategory = determineOverallCategory(improvements);

      const mockRecord = {
        pr_id: 1000 + i,
        repo: repo.name,
        author: author.username,
        timestamp: faker.date.recent({ days: 90 }), // Last 90 days
        changes: {
          diff_url: `https://github.com/company/${repo.name}/pull/${1000 + i}`,
          file_count: faker.number.int({ min: 1, max: 20 }),
          additions: faker.number.int({ min: 10, max: 1000 }),
          deletions: faker.number.int({ min: 5, max: 400 }),
          total_changes: 0 // Will be calculated
        },
        analysis: {
          improvements: improvements,
          overall_category: overallCategory
        }
      };

      mockRecord.changes.total_changes = mockRecord.changes.additions + mockRecord.changes.deletions;
      mockRecords.push(mockRecord);
    }

    await SkillAnalysis.insertMany(mockRecords);
    console.log(`✅ Generated ${mockRecords.length} advanced mock records`);

    // Generate some analytics
    const stats = await SkillAnalysis.aggregate([
      {
        $group: {
          _id: '$analysis.overall_category',
          count: { $sum: 1 },
          avgFiles: { $avg: '$changes.file_count' },
          avgChanges: { $avg: '$changes.total_changes' }
        }
      }
    ]);

    console.log('\n📈 Generated Data Statistics:');
    console.log(stats);

    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding advanced mock data:', error);
    process.exit(1);
  }
}

function generateImprovements(seniority) {
  const improvements = [];
  const count = faker.number.int({ min: 1, max: 6 });
  
  // Junior developers get more basic issues, seniors get more advanced
  const levelWeights = {
    'Junior': { Basic: 0.7, Intermediate: 0.3, Advanced: 0.0 },
    'Mid-level': { Basic: 0.3, Intermediate: 0.5, Advanced: 0.2 },
    'Senior': { Basic: 0.1, Intermediate: 0.4, Advanced: 0.5 }
  };

  const weights = levelWeights[seniority] || levelWeights['Mid-level'];

  for (let i = 0; i < count; i++) {
    const level = weightedRandom(weights);
    const issue = faker.helpers.arrayElement(ISSUE_TEMPLATES[level]);
    const suggestion = faker.helpers.arrayElement(SUGGESTIONS[level]);

    improvements.push({
      issue: issue,
      level: level,
      suggestion: suggestion
    });
  }

  return improvements;
}

function weightedRandom(weights) {
  const rand = Math.random();
  let sum = 0;
  
  for (const [level, weight] of Object.entries(weights)) {
    sum += weight;
    if (rand <= sum) return level;
  }
  
  return 'Basic';
}

function determineOverallCategory(improvements) {
  if (improvements.some(imp => imp.level === 'Advanced')) return 'Advanced';
  if (improvements.some(imp => imp.level === 'Intermediate')) return 'Intermediate';
  return 'Basic';
}

// Run the advanced script
createAdvancedMockData();