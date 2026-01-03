const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Reconstruct the final correct boundaries for Game old.rxdata
 */

console.log('=== RECONSTRUCTING FINAL CORRECT BOUNDARIES ===\n');

const gameOld = fs.readFileSync('Game old.rxdata');

// Based on our analysis:
// - Object 0 should end around 40239-41004
// - We need to find exactly 15 objects total
// - Object 14 should be the boxes object

const allHeaders = [0, 31375, 40239, 40246, 41004, 41653, 41657, 42103, 93498, 105671, 121596, 193764, 194605, 200014, 200123, 211613, 219823];

console.log(`All potential headers: [${allHeaders.join(', ')}]`);

// Let's try object 0 ending at 40239 (this worked in our test)
const obj0End = 40239;
console.log(`\nUsing object 0 boundary: 0 to ${obj0End}`);

// Verify object 0 works
try {
    const obj0Section = gameOld.slice(0, obj0End);
    const obj0Parsed = load(obj0Section);
    const symbols = Object.getOwnPropertySymbols(obj0Parsed);
    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
    const nameValue = String.fromCharCode(...Array.from(obj0Parsed[nameSymbol]));
    console.log(`✅ Object 0: Player with @name = "${nameValue}"`);
} catch (error) {
    console.log(`❌ Object 0 failed: ${error.message}`);
}

// Now find the remaining 14 objects starting from obj0End
const remainingHeaders = allHeaders.filter(pos => pos >= obj0End);
console.log(`Remaining headers: [${remainingHeaders.join(', ')}]`);

const finalBoundaries = [
    { index: 0, start: 0, end: obj0End, size: obj0End }
];

let currentIndex = 1;

// Try to parse each remaining section
for (let i = 0; i < remainingHeaders.length && currentIndex <= 14; i++) {
    const start = remainingHeaders[i];
    const end = i + 1 < remainingHeaders.length ? remainingHeaders[i + 1] : gameOld.length;
    const section = gameOld.slice(start, end);

    console.log(`\nTrying object ${currentIndex} at ${start}-${end} (${section.length} bytes)`);

    try {
        const parsed = load(section);

        if (parsed !== null && parsed !== undefined) {
            finalBoundaries.push({ index: currentIndex, start: start, end: end, size: section.length });
            console.log(`✅ Object ${currentIndex}: SUCCESS`);

            // Check what type of object this is
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                if (rubyVars.length > 0) {
                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    if (boxesSymbol && Array.isArray(parsed[boxesSymbol])) {
                        console.log(`  🎯 BOXES OBJECT with ${parsed[boxesSymbol].length} boxes`);
                    }

                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    if (nameSymbol) {
                        const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                        console.log(`  → Has @name = "${nameValue}"`);
                    }

                    console.log(`  → Ruby object with ${rubyVars.length} variables`);
                } else {
                    console.log(`  → Regular object`);
                }
            } else if (typeof parsed === 'number') {
                console.log(`  → Number: ${parsed}`);
            } else if (Array.isArray(parsed)) {
                console.log(`  → Array with ${parsed.length} items`);
            }

            currentIndex++;
        } else {
            console.log(`❌ Object ${currentIndex}: Parsed as null/undefined`);
        }
    } catch (error) {
        console.log(`❌ Object ${currentIndex}: Parse failed - ${error.message}`);

        // Try alternative parsing for "marshal data too short" errors
        if (error.message.includes('marshal data too short')) {
            console.log(`  Trying alternative parsing...`);

            const testSizes = [35000, 40000, 45000, 50000];
            let found = false;

            for (const size of testSizes) {
                if (start + size > gameOld.length) continue;

                try {
                    const testSection = gameOld.slice(start, start + size);
                    const testParsed = load(testSection);

                    if (testParsed && typeof testParsed === 'object' && !Array.isArray(testParsed)) {
                        const symbols = Object.getOwnPropertySymbols(testParsed);
                        const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                        if (rubyVars.length >= 3) {
                            finalBoundaries.push({ index: currentIndex, start: start, end: start + size, size: size });
                            console.log(`  ✅ Object ${currentIndex}: Alternative parsing SUCCESS (${size} bytes)`);
                            currentIndex++;
                            found = true;
                            break;
                        }
                    }
                } catch (altError) {
                    // Continue trying
                }
            }

            if (!found) {
                console.log(`  ❌ Alternative parsing also failed`);
            }
        }
    }
}

console.log(`\n=== FINAL RESULTS ===`);
console.log(`Found ${finalBoundaries.length} objects:`);

finalBoundaries.forEach(boundary => {
    console.log(`Object ${boundary.index}: ${boundary.start}-${boundary.end} (${boundary.size} bytes)`);
});

if (finalBoundaries.length === 15) {
    console.log(`\n✅ SUCCESS: Found exactly 15 objects!`);

    // Check if object 14 is the boxes object
    const obj14 = finalBoundaries.find(b => b.index === 14);
    if (obj14) {
        try {
            const section = gameOld.slice(obj14.start, obj14.end);
            const parsed = load(section);

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');

                if (boxesSymbol && Array.isArray(parsed[boxesSymbol])) {
                    console.log(`🎯 PERFECT: Object 14 is the boxes object with ${parsed[boxesSymbol].length} boxes!`);
                } else {
                    console.log(`⚠️  Object 14 is not the boxes object`);
                }
            }
        } catch (error) {
            console.log(`⚠️  Could not verify object 14: ${error.message}`);
        }
    }
} else {
    console.log(`\n❌ FAILED: Found ${finalBoundaries.length} objects, expected 15`);
}

// Generate the implementation code
console.log(`\n=== IMPLEMENTATION CODE ===`);
console.log(`// Correct boundaries for Game old.rxdata`);
console.log(`const gameOldBoundaries = [`);
finalBoundaries.forEach((boundary, i) => {
    const comma = i < finalBoundaries.length - 1 ? ',' : '';
    console.log(`  { start: ${boundary.start}, size: ${boundary.size} }${comma}`);
});
console.log(`];`);