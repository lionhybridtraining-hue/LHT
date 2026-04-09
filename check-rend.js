const fs = require('fs');

const content = fs.readFileSync('coach/index.html', 'utf8');
const lines = content.split('\n');

// Start from renderCheckins (line 3799) and find where it actually closes
console.log('=== Finding where renderCheckins closes ===\n');

let braceBalance = 0;
let closeLine = -1;

for (let i = 3798; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/{/g) || []).length;
  const closes = (line.match(/}/g) || []).length;
  braceBalance += opens - closes;
  
  console.log(`Line ${i+1}: balance=${braceBalance} | ${line.substring(0, 80)}`);
  
  // Detect when we close the function definition (backtracks to balance=0)
  if (i > 3799 && braceBalance === 0) {
    closeLine = i + 1;
    console.log(`\n>>> Function closes at line ${closeLine}`);
    break;
  }
  
  if (i > 3950) break; // Safety limit
}

if (closeLine === -1) {
  console.log(`\n>>> Function never closes! Final balance: ${braceBalance}`);
}
