const fs = require('fs');

const content = fs.readFileSync('coach/index.html', 'utf8');
const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);

if (!scriptMatch) {
  console.log('No script found');
  process.exit(1);
}

const scriptCode = scriptMatch[1];
const lines = scriptCode.split('\n');

let braceStack = [];
let bracketStack = [];
let parenStack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const prevChar = j > 0 ? line[j-1] : '';
    const nextChar = j < line.length - 1 ? line[j+1] : '';
    
    // Skip strings and comments
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      j++;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      continue;
    }
    
    if (char === '/' && nextChar === '/') break; // Skip to end of line
    
    if (char === '{') braceStack.push({ char: '{', line: i + 1, col: j });
    if (char === '}') {
      if (braceStack.length === 0) {
        console.log(`❌ Extra } at line ${i+1}, col ${j}`);
        console.log(`   ${line}`);
      } else {
        braceStack.pop();
      }
    }
    
    if (char === '[') bracketStack.push({ char: '[', line: i + 1, col: j });
    if (char === ']') {
      if (bracketStack.length === 0) {
        console.log(`❌ Extra ] at line ${i+1}, col ${j}`);
      } else {
        bracketStack.pop();
      }
    }
    
    if (char === '(') parenStack.push({ char: '(', line: i + 1, col: j });
    if (char === ')') {
      if (parenStack.length === 0) {
        console.log(`❌ Extra ) at line ${i+1}, col ${j}`);
      } else {
        parenStack.pop();
      }
    }
  }
}

console.log('\n=== BALANCE SUMMARY ===');
if (braceStack.length > 0) {
  console.log(`❌ ${braceStack.length} unclosed { braces:`);
  braceStack.forEach(b => console.log(`   Line ${b.line}: opening { at column ${b.col}`));
}

if (bracketStack.length > 0) {
  console.log(`❌ ${bracketStack.length} unclosed [ brackets:`);
  bracketStack.forEach(b => console.log(`   Line ${b.line}: opening [ at column ${b.col}`));
}

if (parenStack.length > 0) {
  console.log(`❌ ${parenStack.length} unclosed ( parentheses:`);
  parenStack.forEach(p => console.log(`   Line ${p.line}: opening ( at column ${p.col}`));
}

if (braceStack.length === 0 && bracketStack.length === 0 && parenStack.length === 0) {
  console.log('✅ All braces, brackets, and parentheses balanced!');
}
