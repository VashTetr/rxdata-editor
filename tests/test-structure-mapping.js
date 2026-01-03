const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Test structure mapping between Game new and Game old
 * Try to understand how to map Game old's 17 objects to Game new's 15 objects
 */

console.log('=== STRUCTURE MAPPING TEST ===\n');

function parseFile(filename) {
    console.log(`Parsing ${filename}...`);
    const data = fs.readFileSync(filename);

    const marshalHeaders = [];
    for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 4 && data[i + 1] === 8) {
            marshalHeaders.push(i);
        }
    }

    const objects = {};
    const objectTypes = {};

    for (let i = 0; i < marshalHeaders.length; i++) {
        const start = marshalHeaders[i];
        const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
        const section = data.slice(start, end);

        try {
            const parsed = load(section);
            objects[i] = parsed;

            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const symbols = Object.getOwnPropertySymbols(parsed);
                const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                if (rubyVars.length > 0) {
                    // Identify object type by key variables
                    const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    const mapsSymbol = symbols.find(sym => sym.toString() === 'Symbol(@maps)');
                    const dataSymbol = symbols.find(sym => sym.toString() === 'Symbol(@data)');

                    if (nameSymbol) {
                        objectTypes[i] = 'PLAYER';
                        const nameValue = String.fromCharCode(...Array.from(parsed[nameSymbol]));
                        console.log(`  Object ${i}: PLAYER (@name = "${nameValue}")`);
                    } else if (boxesSymbol) {
                        objectTypes[i] = 'BOXES';
                        console.log(`  Object ${i}: BOXES (${parsed[boxesSymbol].length} boxes)`);
                    } else if (mapsSymbol) {
                        objectTypes[i] = 'MAPS';
                        console.log(`  Object ${i}: MAPS`);
                    } else if (dataSymbol) {
                        objectTypes[i] = 'DATA';
                        console.log(`  Object ${i}: DATA`);
                    } else {
                        // Try to identify by variable names
                        const varNames = rubyVars.map(sym => sym.toString().replace('Symbol(', '').replace(')', ''));
                        if (varNames.includes('@playing_bgm')) {
                            objectTypes[i] = 'SYSTEM';
                            console.log(`  Object ${i}: SYSTEM`);
                        } else if (varNames.includes('@runstyle')) {
                            objectTypes[i] = 'OPTIONS';
                            console.log(`  Object ${i}: OPTIONS`);
                        } else if (varNames.includes('@weather_type')) {
                            objectTypes[i] = 'SCREEN';
                            console.log(`  Object ${i}: SCREEN`);
                        } else if (varNames.includes('@healingSpot')) {
                            objectTypes[i] = 'METADATA';
                            console.log(`  Object ${i}: METADATA`);
                        } else if (varNames.includes('@movedEvents')) {
                            objectTypes[i] = 'EVENTS';
                            console.log(`  Object ${i}: EVENTS`);
                        } else {
                            objectTypes[i] = 'UNKNOWN';
                            console.log(`  Object ${i}: UNKNOWN (${rubyVars.length} vars: ${varNames.slice(0, 5).join(', ')}${varNames.length > 5 ? '...' : ''})`);
                        }
                    }
                } else {
                    objectTypes[i] = 'REGULAR';
                    console.log(`  Object ${i}: REGULAR (${Object.keys(parsed).length} props)`);
                }
            } else if (Array.isArray(parsed)) {
                objectTypes[i] = 'ARRAY';
                console.log(`  Object ${i}: ARRAY (${parsed.length} items)`);
            } else {
                objectTypes[i] = typeof parsed;
                console.log(`  Object ${i}: ${typeof parsed}`);
            }
        } catch (error) {
            objectTypes[i] = 'FAILED';
            console.log(`  Object ${i}: FAILED (${error.message})`);
        }
    }

    return { objects, objectTypes, count: marshalHeaders.length };
}

// Parse both files
const gameNew = parseFile('Game new.rxdata');
const gameOld = parseFile('Game old.rxdata');

console.log('\n=== STRUCTURE COMPARISON ===');
console.log(`Game new: ${gameNew.count} objects`);
console.log(`Game old: ${gameOld.count} objects`);

// Create type-based mapping
console.log('\n=== TYPE-BASED MAPPING ===');

const typeMapping = {};

// Find each type in both files
const allTypes = new Set([...Object.values(gameNew.objectTypes), ...Object.values(gameOld.objectTypes)]);

for (const type of allTypes) {
    const newIndices = Object.keys(gameNew.objectTypes).filter(i => gameNew.objectTypes[i] === type);
    const oldIndices = Object.keys(gameOld.objectTypes).filter(i => gameOld.objectTypes[i] === type);

    console.log(`${type}:`);
    console.log(`  Game new: [${newIndices.join(', ')}]`);
    console.log(`  Game old: [${oldIndices.join(', ')}]`);

    if (newIndices.length === 1 && oldIndices.length === 1) {
        typeMapping[oldIndices[0]] = newIndices[0];
        console.log(`  → Mapping: ${oldIndices[0]} → ${newIndices[0]}`);
    } else if (newIndices.length === 0 && oldIndices.length > 0) {
        console.log(`  → Game old has extra ${type} objects`);
    } else if (newIndices.length > 0 && oldIndices.length === 0) {
        console.log(`  → Game new has extra ${type} objects`);
    } else {
        console.log(`  → Complex mapping needed`);
    }
}

console.log('\n=== PROPOSED OBJECT MAPPING ===');
console.log('Game old → Game new:');
for (const [oldIndex, newIndex] of Object.entries(typeMapping)) {
    console.log(`  ${oldIndex} → ${newIndex} (${gameOld.objectTypes[oldIndex]})`);
}

// Check if we can create a 0-14 mapping for Game old
console.log('\n=== CREATING 0-14 MAPPING FOR GAME OLD ===');

const gameOldMapped = {};
let mappedIndex = 0;

// Priority order: PLAYER first, then others, BOXES last
const priorityOrder = ['PLAYER', 'SYSTEM', 'OPTIONS', 'number', 'DATA', 'SCREEN', 'MAPS', 'METADATA', 'EVENTS', 'BOXES'];

for (const type of priorityOrder) {
    const indices = Object.keys(gameOld.objectTypes).filter(i => gameOld.objectTypes[i] === type);
    for (const index of indices) {
        if (gameOld.objects[index] && mappedIndex <= 14) {
            gameOldMapped[mappedIndex] = gameOld.objects[index];
            console.log(`  ${mappedIndex} ← ${index} (${type})`);
            mappedIndex++;
        }
    }
}

// Fill remaining slots with other objects
for (let i = 0; i < gameOld.count; i++) {
    if (gameOld.objects[i] && mappedIndex <= 14) {
        const type = gameOld.objectTypes[i];
        if (!priorityOrder.includes(type)) {
            gameOldMapped[mappedIndex] = gameOld.objects[i];
            console.log(`  ${mappedIndex} ← ${i} (${type})`);
            mappedIndex++;
        }
    }
}

console.log(`\nMapped ${mappedIndex} objects to 0-${mappedIndex - 1} range`);

// Verify the mapping
console.log('\n=== VERIFICATION ===');
const playerInMapped = Object.keys(gameOldMapped).find(i => {
    const obj = gameOldMapped[i];
    if (obj && typeof obj === 'object') {
        const symbols = Object.getOwnPropertySymbols(obj);
        return symbols.some(sym => sym.toString() === 'Symbol(@name)');
    }
    return false;
});

const boxesInMapped = Object.keys(gameOldMapped).find(i => {
    const obj = gameOldMapped[i];
    if (obj && typeof obj === 'object') {
        const symbols = Object.getOwnPropertySymbols(obj);
        return symbols.some(sym => sym.toString() === 'Symbol(@boxes)');
    }
    return false;
});

console.log(`Player object mapped to index: ${playerInMapped || 'NOT FOUND'}`);
console.log(`Boxes object mapped to index: ${boxesInMapped || 'NOT FOUND'}`);

if (playerInMapped === '0') {
    console.log('✅ Player object correctly at index 0');
} else {
    console.log('❌ Player object not at index 0');
}

if (boxesInMapped) {
    console.log(`✅ Boxes object found at index ${boxesInMapped}`);
} else {
    console.log('❌ Boxes object not found in mapping');
}