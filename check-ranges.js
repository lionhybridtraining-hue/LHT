const fs = require('fs');

const content = fs.readFileSync('coach/index.html', 'utf8');
const lines = content.split('\n');

// Check lines 3716-3798
console.log('=== Analyzing lines 3716-3798 ===\n');

let braceBalance = 0;

for (let i = 3715; i < 3798; i++) {
  const line = lines[i];
  const opens = (line.match(/{/g) || []).length;
  const closes = (line.match(/}/g) || []).length;
  braceBalance += opens - closes;
  
  if (opens || closes) {
    console.log(`Line ${i+1}: balance=${braceBalance} (open=${opens}, close=${closes})`);
    console.log(`  ${line.substring(0, 100)}`);
  }
}

console.log(`\nFinal balance for lines 3716-3798: ${braceBalance}`);

// Check the function at line 3799
console.log('\n=== Analyzing lines 3799-3893 ===\n');

braceBalance = 0;

for (let i = 3798; i < 3893; i++) {
  const line = lines[i];
  const opens = (line.match(/{/g) || []).length;
  const closes = (line.match(/}/g) || []).length;
  braceBalance += opens - closes;
  
  if (opens || closes) {
    console.log(`Line ${i+1}: balance=${braceBalance} (open=${opens}, close=${closes})`);
    console.log(`  ${line.substring(0, 100)}`);
  }
}

console.log(`\nFinal balance for lines 3799-3893: ${braceBalance}`);
