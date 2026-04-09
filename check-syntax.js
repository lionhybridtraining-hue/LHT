const fs = require('fs');

let content = fs.readFileSync('coach/index.html', 'utf8');

// Find the script tag content
const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  const scriptCode = scriptMatch[1];
  
  // Try to compile as function to check syntax
  try {
    new Function(scriptCode);
    console.log('✓ Script syntax is valid');
  } catch (e) {
    console.log('✗ Syntax error in script:');
    console.log(e.message);
    
    // Show lines with brace count around error
    const lines = scriptCode.split('\n');
    let braceBalance = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const open = (line.match(/{/g) || []).length;
      const close = (line.match(/}/g) || []).length;
      braceBalance += open - close;
      
      if (braceBalance < 0) {
        console.log(`\nLine ${i + 1}: UNBALANCED! (balance: ${braceBalance})`);
        console.log(`  ${line.substring(0, 100)}`);
        console.log('\nLines before:');
        for (let j = Math.max(0, i - 3); j < i; j++) {
          console.log(`  ${j + 1}: ${lines[j].substring(0, 100)}`);
        }
        break;
      }
    }
    
    // Final balance
    console.log(`\nFinal brace balance: ${braceBalance}`);
  }
}
