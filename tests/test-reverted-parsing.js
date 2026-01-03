const fs = require('fs');
const { load } = require('@hyrious/marshal');

console.log('Testing reverted parsing...');

// Test Game new
console.log('\n=== Game new.rxdata ===');
const gameNew = fs.readFileSync('Game new.rxdata');
const gameNewHeaders = [];
for (let i = 0; i < gameNew.length - 1; i++) {
    if (gameNew[i] === 4 && gameNew[i + 1] === 8) {
        gameNewHeaders.push(i);
    }
}

console.log(`Found ${gameNewHeaders.length} Marshal headers`);

let gameNewParsed = 0;
let gameNewFailed = 0;

for (let i = 0; i < gameNewHeaders.length; i++) {
    const start = gameNewHeaders[i];
    const end = i + 1 < gameNewHeaders.length ? gameNewHeaders[i + 1] : gameNew.length;
    const section = gameNew.slice(start, end);

    try {
        const rawParsed = load(section);
        if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
            const symbols = Object.getOwnPropertySymbols(rawParsed);
            const rubyVars = symbols.filter(sym => sym.toString().includes('@'));
            if (rubyVars.length > 0) {
                gameNewParsed++;

                const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                if (nameSymbol) {
                    const nameValue = String.fromCharCode(...Array.from(rawParsed[nameSymbol]));
                    console.log(`Object ${i}: Player with @name = "${nameValue}"`);
                }

                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                if (boxesSymbol && Array.isArray(rawParsed[boxesSymbol])) {
                    console.log(`Object ${i}: Boxes with ${rawParsed[boxesSymbol].length} boxes`);
                }
            }
        }
    } catch (parseError) {
        console.log(`Object ${i}: Parse failed - ${parseError.message}`);
        gameNewFailed++;
    }
}

console.log(`Game new: ${gameNewParsed} parsed, ${gameNewFailed} failed`);

// Test Game old
console.log('\n=== Game old.rxdata ===');
const gameOld = fs.readFileSync('Game old.rxdata');
const gameOldHeaders = [];
for (let i = 0; i < gameOld.length - 1; i++) {
    if (gameOld[i] === 4 && gameOld[i + 1] === 8) {
        gameOldHeaders.push(i);
    }
}

console.log(`Found ${gameOldHeaders.length} Marshal headers`);

let gameOldParsed = 0;
let gameOldFailed = 0;

for (let i = 0; i < gameOldHeaders.length; i++) {
    const start = gameOldHeaders[i];
    const end = i + 1 < gameOldHeaders.length ? gameOldHeaders[i + 1] : gameOld.length;
    const section = gameOld.slice(start, end);

    try {
        const rawParsed = load(section);
        if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
            const symbols = Object.getOwnPropertySymbols(rawParsed);
            const rubyVars = symbols.filter(sym => sym.toString().includes('@'));
            if (rubyVars.length > 0) {
                gameOldParsed++;

                const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                if (nameSymbol) {
                    const nameValue = String.fromCharCode(...Array.from(rawParsed[nameSymbol]));
                    console.log(`Object ${i}: Player with @name = "${nameValue}"`);
                }

                const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                if (boxesSymbol && Array.isArray(rawParsed[boxesSymbol])) {
                    console.log(`Object ${i}: Boxes with ${rawParsed[boxesSymbol].length} boxes`);
                }
            }
        }
    } catch (parseError) {
        console.log(`Object ${i}: Parse failed - ${parseError.message}`);
        gameOldFailed++;
    }
}

console.log(`Game old: ${gameOldParsed} parsed, ${gameOldFailed} failed`);

console.log('\n=== SUMMARY ===');
console.log(`Game new should show objects 0-14 with player at 0 and boxes at 14`);
console.log(`Game old should show objects 0-16 with player at 0 and boxes at 16`);

if (gameNewFailed === 0) {
    console.log('✅ Game new parsing is working correctly');
} else {
    console.log(`❌ Game new has ${gameNewFailed} failed objects`);
}

if (gameOldFailed <= 2) {
    console.log('✅ Game old parsing is acceptable (some objects may fail)');
} else {
    console.log(`❌ Game old has too many failed objects: ${gameOldFailed}`);
}