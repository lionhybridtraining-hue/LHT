const fs = require('fs');

const content = fs.readFileSync('coach/index.html', 'utf8');
const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);

if (!scriptMatch) {
  console.log('No script found');
  process.exit(1);
}

const scriptCode = scriptMatch[1];
const lines = scriptCode.split('\n');

let backtickCount = 0;
let doubleQuoteCount = 0;
let singleQuoteCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const prevChar = j > 0 ? line[j-1] : '';
    
    // Skip escaped characters
    if (prevChar === '\\') continue;
    
    if (char === '`') backtickCount++;
    if (char === '"' && prevChar !== '\\') doubleQuoteCount++;
    if (char === "'" && prevChar !== '\\') singleQuoteCount++;
  }
}

console.log('=== STRING QUOTE BALANCE ===');
console.log(`Backticks: ${backtickCount} ${backtickCount % 2 === 0 ? '✓' : '❌ ODD!'}`);
console.log(`Double quotes: ${doubleQuoteCount} ${doubleQuoteCount % 2 === 0 ? '✓' : '❌ ODD!'}`);
console.log(`Single quotes: ${singleQuoteCount} ${singleQuoteCount % 2 === 0 ? '✓' : '❌ ODD!'}`);
