const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Find the missing objects between position 50000 and 93498
 */

console.log('=== FINDING MISSING OBJECTS ===\n');

const gameOld = fs.readFileSync('Game old.rxdata');

// We know object 0 ends around position 50000
// The next header we found is at 93498
// But there should be objects 1, 2, 3, 4 in between

const gapStart = 50000;
const gapEnd = 93498;
const gapData = gameOld.slice(gapStart, gapEnd);

console.log(`Analyzing gap from ${gapStart} to ${gapEnd} (${gapData.length} bytes)`);

// Look for Marshal headers in this gap
const gapHeaders = [];
for (let i = 0; i < gapData.length - 1; i++) {
    if (gapData[i] === 4 && gapData[i + 1] === 8) {
        gapHeaders.push(gapStart + i);
    }
}

console.log(`Found ${gapHeaders.length} headers in gap: [${gapHeaders.join(', ')}]`);

// These should correspond to the original headers we found earlier
const originalHeaders = [0, 31375, 40239, 40246, 41004, 41653, 41657, 42103];
const headersInGap = originalHeaders.filter(pos => pos >= gapStart && pos < gapEnd);
console.log(`Original headers in this range: [${headersInGap.join(', ')}]`);

// The issue is that some of these "headers" are actually embedded within object 0
// Let's try to parse objects starting from position 50000 using the original headers

console.log('\n=== TRYING TO PARSE FROM POSITION 50000 ===');

// Try parsing from each header position after 50000
const candidateHeaders = originalHeaders.filter(pos => pos >= gapStart);
console.log(`Candidate headers: [${candidateHeaders.join(', ')}]`);

const validObjects = [];

for (let i = 0; i < candidateHeaders.length; i++) {
    const start = candidateHeaders[i];
    const end = i + 1 < candidateHeaders.length ? candidateHeaders[i + 1] : gapEnd;
    const section = gameOld.slice(start, end);

    console.log(`\nTrying object at ${start}-${end} (${section.length} bytes)`);

    try {
        const parsed = load(section);

        if (parsed !== null && parsed !== undefined) {
            validObjects.push({ start, end, size: section.length, parsed });
            console.log(`✅ SUCCESS: Valid object found`);

            if (typeof parsed === 'number') {
                console.log(`  → Number: ${parsed}`);
            } else if (Array.isArray(parsed)) {
                console.log(`  → Array with ${parsed.length} items`);
            } else if (parsed && typeof parsed === 'object') {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));
                console.log(`  → Ruby object with ${rubyVars.length} variables`);
            }
        } else {
            console.log(`❌ Parsed as null/undefined`);
        }
    } catch (error) {
        console.log(`❌ Parse failed: ${error.message}`);
    }
}

console.log(`\nFound ${validObjects.length} valid objects in the gap`);

// Now let's try a different approach: maybe object 0 doesn't end at 50000
// Let's try different end positions for object 0

console.log('\n=== TRYING DIFFERENT END POSITIONS FOR OBJECT 0 ===');

const testEndPositions = [
    31375,  // Original boundary
    40239,  // Next header
    40246,  // Next header
    41004,  // Next header
    45000,  // Test position
    55000,  // Test position
    60000,  // Test position
];

for (const endPos of testEndPositions) {
    console.log(`\nTrying object 0 with end position ${endPos}`);

    // Try parsing object 0 with this end position
    const obj0Section = gameOld.slice(0, endPos);

    try {
        const obj0Parsed = load(obj0Section);

        if (obj0Parsed && typeof obj0Parsed === 'object' && !Array.isArray(obj0Parsed)) {
            const symbols = Object.getOwnPropertySymbols(obj0Parsed);
            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');

            if (nameSymbol) {
                const nameValue = String.fromCharCode(...Array.from(obj0Parsed[nameSymbol]));
                console.log(`✅ Object 0 works with end ${endPos}: @name = "${nameValue}"`);

                // Now try to parse the next object starting from endPos
                const nextStart = endPos;
                const nextEnd = 93498; // We know there's a valid header here
                const nextSection = gameOld.slice(nextStart, nextEnd);

                try {
                    const nextParsed = load(nextSection);
                    if (nextParsed !== null) {
                        console.log(`  ✅ Next object also works (${nextSection.length} bytes)`);
                        console.log(`  🎯 POTENTIAL SOLUTION: Object 0 ends at ${endPos}, Object 1 starts at ${nextStart}`);
                    }
                } catch (nextError) {
                    console.log(`  ❌ Next object fails: ${nextError.message}`);
                }
            }
        }
    } catch (error) {
        console.log(`❌ Object 0 fails with end ${endPos}: ${error.message}`);
    }
}

// Let's also check what Game new.rxdata looks like for comparison
console.log('\n=== COMPARING WITH GAME NEW ===');

const gameNew = fs.readFileSync('Game new.rxdata');
const gameNewHeaders = [];
for (let i = 0; i < gameNew.length - 1; i++) {
    if (gameNew[i] === 4 && gameNew[i + 1] === 8) {
        gameNewHeaders.push(i);
    }
}

console.log(`Game new has ${gameNewHeaders.length} headers: [${gameNewHeaders.slice(0, 10).join(', ')}${gameNewHeaders.length > 10 ? '...' : ''}]`);

// Parse Game new objects to see the pattern
console.log('\nGame new object sizes:');
for (let i = 0; i < Math.min(gameNewHeaders.length, 5); i++) {
    const start = gameNewHeaders[i];
    const end = i + 1 < gameNewHeaders.length ? gameNewHeaders[i + 1] : gameNew.length;
    const size = end - start;
    console.log(`  Object ${i}: ${size} bytes`);
}