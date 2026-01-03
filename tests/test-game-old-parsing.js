const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Debug Test: Game Old Parsing Issue
 * This test investigates why Game old.rxdata has different object structure
 */

class GameOldParsingTest {
    constructor() {
        this.testResults = [];
    }

    log(message) {
        console.log(`[GAME-OLD] ${message}`);
    }

    error(message) {
        console.error(`[GAME-OLD-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[GAME-OLD-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== GAME OLD PARSING DEBUG TEST ===\n');
        console.log('This test investigates why Game old.rxdata has different object structure');

        try {
            await this.compareFileStructures();
            await this.debugMarshalHeaders();
            await this.testAlternativeParsing();

        } catch (error) {
            this.error(`Game old parsing test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
        }
    }

    async compareFileStructures() {
        this.log('Step 1: Compare file structures');

        const gameNew = fs.readFileSync('Game new.rxdata');
        const gameOld = fs.readFileSync('Game old.rxdata');

        this.log(`Game new size: ${gameNew.length} bytes`);
        this.log(`Game old size: ${gameOld.length} bytes`);

        // Check first few bytes
        this.log(`Game new first 20 bytes: [${Array.from(gameNew.slice(0, 20)).join(', ')}]`);
        this.log(`Game old first 20 bytes: [${Array.from(gameOld.slice(0, 20)).join(', ')}]`);

        // Check for Ruby Marshal headers (4, 8)
        const newHeaders = this.findMarshalHeaders(gameNew);
        const oldHeaders = this.findMarshalHeaders(gameOld);

        this.log(`Game new Marshal headers: ${newHeaders.length} found at positions: [${newHeaders.join(', ')}]`);
        this.log(`Game old Marshal headers: ${oldHeaders.length} found at positions: [${oldHeaders.join(', ')}]`);

        // Compare header patterns
        if (newHeaders.length !== oldHeaders.length) {
            this.log(`⚠️  DIFFERENT HEADER COUNTS: Game new has ${newHeaders.length}, Game old has ${oldHeaders.length}`);
        }

        this.success('Step 1 PASSED: File structures compared');
    }

    findMarshalHeaders(data) {
        const headers = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                headers.push(i);
            }
        }
        return headers;
    }

    async debugMarshalHeaders() {
        this.log('Step 2: Debug Marshal header parsing for both files');

        await this.debugFile('Game new.rxdata', 'Game new');
        await this.debugFile('Game old.rxdata', 'Game old');

        this.success('Step 2 PASSED: Marshal headers debugged');
    }

    async debugFile(filename, label) {
        this.log(`\n--- Debugging ${label} ---`);

        const data = fs.readFileSync(filename);
        const headers = this.findMarshalHeaders(data);

        this.log(`${label}: ${headers.length} Marshal headers found`);

        const parsedObjects = {};
        const failedObjects = [];

        for (let i = 0; i < headers.length; i++) {
            const start = headers[i];
            const end = i + 1 < headers.length ? headers[i + 1] : data.length;
            const section = data.slice(start, end);

            this.log(`${label} Object ${i}: bytes ${start}-${end} (${section.length} bytes)`);

            try {
                const parsed = load(section);
                parsedObjects[i] = parsed;

                // Check if it's a Ruby object with symbols
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const symbols = Object.getOwnPropertySymbols(parsed);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    if (rubyVars.length > 0) {
                        this.log(`${label} Object ${i}: ✅ Ruby object with ${rubyVars.length} instance variables`);

                        // Check for player name specifically
                        const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                        if (nameSymbol) {
                            const nameValue = parsed[nameSymbol];
                            const nameStr = this.convertToString(nameValue);
                            this.log(`${label} Object ${i}: Contains @name = "${nameStr}"`);
                        }
                    } else {
                        this.log(`${label} Object ${i}: ✅ Regular object with ${Object.keys(parsed).length} properties`);
                    }
                } else if (Array.isArray(parsed)) {
                    this.log(`${label} Object ${i}: ✅ Array with ${parsed.length} items`);
                } else {
                    this.log(`${label} Object ${i}: ✅ ${typeof parsed} value`);
                }

            } catch (parseError) {
                failedObjects.push(i);
                this.log(`${label} Object ${i}: ❌ Parse failed: ${parseError.message}`);
            }
        }

        this.log(`${label} Summary: ${Object.keys(parsedObjects).length} parsed, ${failedObjects.length} failed`);

        if (failedObjects.length > 0) {
            this.log(`${label} Failed objects: [${failedObjects.join(', ')}]`);
        }

        return { parsedObjects, failedObjects };
    }

    convertToString(data) {
        if (data instanceof Uint8Array) {
            return String.fromCharCode(...Array.from(data));
        } else if (Array.isArray(data)) {
            return String.fromCharCode(...data);
        } else if (typeof data === 'string') {
            return data;
        } else {
            return String(data);
        }
    }

    async testAlternativeParsing() {
        this.log('Step 3: Test alternative parsing approaches');

        // Try parsing Game old with different strategies
        const gameOld = fs.readFileSync('Game old.rxdata');

        // Strategy 1: Look for different header patterns
        this.log('\n--- Strategy 1: Alternative header patterns ---');
        await this.tryAlternativeHeaders(gameOld);

        // Strategy 2: Try parsing from different starting positions
        this.log('\n--- Strategy 2: Different starting positions ---');
        await this.tryDifferentStartPositions(gameOld);

        this.success('Step 3 PASSED: Alternative parsing tested');
    }

    async tryAlternativeHeaders(data) {
        // Look for other potential Ruby Marshal patterns
        const patterns = [
            [4, 8],    // Standard Ruby Marshal
            [4, 9],    // Alternative version
            [4, 10],   // Another version
            [5, 8],    // Different major version
        ];

        for (const [major, minor] of patterns) {
            const headers = [];
            for (let i = 0; i < data.length - 1; i++) {
                if (data[i] === major && data[i + 1] === minor) {
                    headers.push(i);
                }
            }

            if (headers.length > 0) {
                this.log(`Pattern [${major}, ${minor}]: ${headers.length} headers at [${headers.slice(0, 10).join(', ')}${headers.length > 10 ? '...' : ''}]`);

                if (headers.length === 15) {
                    this.log(`🎯 Pattern [${major}, ${minor}] gives exactly 15 objects - this might be correct!`);
                }
            }
        }
    }

    async tryDifferentStartPositions(data) {
        // Try parsing from different byte positions to see if we're missing a header
        const testPositions = [0, 1, 2, 3, 4, 5, 10, 20, 50, 100];

        for (const startPos of testPositions) {
            if (startPos >= data.length) continue;

            try {
                const section = data.slice(startPos);
                const parsed = load(section);

                if (parsed && typeof parsed === 'object') {
                    this.log(`Position ${startPos}: Successfully parsed ${typeof parsed}`);

                    if (!Array.isArray(parsed)) {
                        const symbols = Object.getOwnPropertySymbols(parsed);
                        const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                        if (rubyVars.length > 0) {
                            this.log(`Position ${startPos}: Ruby object with ${rubyVars.length} variables`);

                            // Check for player name
                            const nameSymbol = symbols.find(sym => sym.toString() === 'Symbol(@name)');
                            if (nameSymbol) {
                                const nameValue = parsed[nameSymbol];
                                const nameStr = this.convertToString(nameValue);
                                this.log(`Position ${startPos}: 🎯 Found @name = "${nameStr}" - this might be object 0!`);
                            }
                        }
                    }
                }
            } catch (error) {
                // Ignore parse errors for this test
            }
        }
    }
}

// Run test
const test = new GameOldParsingTest();
test.runTest();