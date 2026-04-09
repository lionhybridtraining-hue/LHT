const fs = require('fs');

const content = fs.readFileSync('coach/index.html', 'utf8');

// Find the script section
const scriptStartIdx = content.indexOf('<script>') + '<script>'.length;
const scriptEndIdx = content.indexOf('</script>', scriptStartIdx);
const script = content.substring(scriptStartIdx, scriptEndIdx);

const lines = script.split('\n');
const actualStartLine = content.substring(0, scriptStartIdx).split('\n').length;

const braces = [];

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
    
    if (char === '{') {
      braces.push({type: '{', line: i + actualStartLine, col: j, context: line.substring(Math.max(0, j-30), Math.min(line.length, j+30))});
    }
    if (char === '}') {
      if (braces.length === 0) {
        console.log(`❌ Extra } at line ${i + actualStartLine}, col ${j}`);
        console.log(`   Context: ${line.substring(Math.max(0, j-50), Math.min(line.length, j+50))}`);
      } else {
        braces.pop();
      }
    }
  }
}

console.log(`\n=== FINAL RESULT ===`);
if (braces.length === 0) {
  console.log('✅ All braces balanced!');
} else {
  console.log(`❌ ${braces.length} unclosed brace(s):`);
  braces.forEach(b => {
    console.log(`\n   Line ${b.line}, col ${b.col}: ${b.type}`);
    console.log(`   Context: ...${b.context}...`);
  });
}
