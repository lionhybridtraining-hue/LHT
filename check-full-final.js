const fs = require('fs');

const content = fs.readFileSync('coach/index.html', 'utf8');

// Find the script section
const scriptStartIdx = content.indexOf('<script>');
const scriptEndIdx = content.indexOf('</script>');

if (scriptStartIdx === -1 || scriptEndIdx === -1) {
  console.log('No <script> tags found');
  process.exit(1);
}

const fullScript = content.substring(scriptStartIdx + '<script>'.length, scriptEndIdx);
const scriptLines = fullScript.split('\n');
const actualStartLine = content.substring(0, scriptStartIdx + '<script>'.length).split('\n').length;

let braceBalance = 0;
let functionStack = [];
const allFunctions = [];

for (let i = 0; i < scriptLines.length; i++) {
  const rawLine = scriptLines[i];
  const line = rawLine.trim();
  
  // Skip strings and comments
  let cleanLine = '';
  let inString = false;
  let stringChar = '';
  let inComment = false;
  
  for (let j = 0; j < rawLine.length; j++) {
    const char = rawLine[j];
    const nextChar = j < rawLine.length - 1 ? rawLine[j+1] : '';
    
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && (j === 0 || rawLine[j-1] !== '\\')) {
      inString = false;
    } else if (!inString && char === '/' && nextChar === '/') {
      inComment = true;
    }
    
    if (!inString && !inComment) {
      cleanLine += char;
    }
  }
  
  const opens = (cleanLine.match(/{/g) || []).length;
  const closes = (cleanLine.match(/}/g) || []).length;
  braceBalance += opens - closes;
  
  // Track function declara tions
  if (cleanLine.includes('function ') || cleanLine.includes('=> {')) {
    const match = cleanLine.match(/(?:function\s+(\w+)|(\w+)\s*=.*=>)/);
    if (match) {
      functionStack.push({name: match[1] || match[2], line: i + actualStartLine, balance: braceBalance});
    }
  }
  
  if (braceBalance < 0) {
    console.log(`❌ Brace imbalance at line ${i + actualStartLine}: ${braceBalance}`);
    console.log(`   ${rawLine.substring(0, 100)}`);
  }
}

console.log(`=== SCRIPT ANALYSIS ===\nFinal brace balance: ${braceBalance}\n`);

if (braceBalance > 0) {
  console.log(`❌ ${braceBalance} unclosed braces!\n`);
}
if (braceBalance < 0) {
  console.log(`❌ ${-braceBalance} extra closing braces!\n`);
}
if (braceBalance === 0) {
  console.log(`✅ All braces balanced!\n`);
}

console.log('Function stack (last 20):');
functionStack.slice(-20).forEach(fn => {
  console.log(`  Line ${fn.line}: ${fn.name} (balance at opening: ${fn.balance})`);
});
