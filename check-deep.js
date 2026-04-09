const fs = require('fs');

const content = fs.readFileSync('coach/index.html', 'utf8');

// Find the script section
const scriptStartIdx = content.indexOf('<script>') + '<script>'.length;
const scriptEndIdx = content.indexOf('</script>', scriptStartIdx);
const script = content.substring(scriptStartIdx, scriptEndIdx);

const lines = script.split('\n');

// Find incomplete structures like: something => {
// or: function( => {
// or: .forEach((x) => {
// or: .map((x) => {

console.log('Looking for potentially unclosed arrow functions and loops...\n');

let lastUnclosedStructure = null;
let braceDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // Count braces (simple approach)
  const opens = (line.match(/{/g) || []).length;
  const closes = (line.match(/}/g) || []).length;
  braceDepth += opens - closes;
  
  // Look for function/arrow patterns
  if (trimmed.includes('=> {') || trimmed.includes('=> (') || trimmed.match(/function\s*\([^)]*\)\s*{/)) {
    lastUnclosedStructure = { line: i + 1 + 2309, text: trimmed.substring(0, 80), depth: braceDepth };
  }
  
  // Print if depth goes negative (shouldn't happen with balanced braces)
  if (braceDepth < 0) {
    console.log(`⚠️  Brace depth went negative at line ${i + 1 + 2309}: ${braceDepth}`);
    console.log(`   ${line.substring(0, 80)}`);
  }
}

console.log(`\nFinal brace depth: ${braceDepth}`);
if (braceDepth !== 0) {
  console.log(`❌ PROBLEM: Braces are not balanced! Depth: ${braceDepth}`);
  console.log(`Last structure that opened: Line ${lastUnclosedStructure?.line || 'unknown'}`);
}
