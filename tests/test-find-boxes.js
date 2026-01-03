const fs = require('fs');
const { load } = require('@hyrious/marshal');

/**
 * Find Boxes Test: Locate the boxes object in Game old.rxdata
 */

class FindBoxesTest {
    constructor() {
        this.testResults = [];
    }

    log(message) {
        console.log(`[FIND-BOXES] ${message}`);
    }

    async runTest() {
        console.log('=== FIND BOXES TEST ===\n');
        console.log('This test locates the boxes object in Game old.rxdata');

        try {
            await this.searchForBoxes();
            await this.tryOriginalParsing();

        } catch (error) {
            console.error(`Find boxes test failed: ${error.message}`);
        }
    }

    async searchForBoxes() {
        this.log('Step 1: Search for boxes in all parsed objects');

        const gameOld = fs.readFileSync('Game old.rxdata');

        // Use our original parsing method to get all 17 objects
        const marshalHeaders = [];
        for (let i = 0; i < gameOld.length - 1; i++) {
            if (gameOld[i] === 4 && gameOld[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        this.log(`Found ${marshalHeaders.length} Marshal headers`);

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : gameOld.length;
            const section = gameOld.slice(start, end);

            this.log(`\n--- Checking Object ${i} (${section.length} bytes) ---`);

            try {
                const parsed = load(section);

                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const symbols = Object.getOwnPropertySymbols(parsed);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    this.log(`Object ${i}: Ruby object with ${rubyVars.length} variables`);

                    // Check for boxes-related symbols
                    const boxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxes)');
                    const omuranBoxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@omuranBoxes)');
                    const deshretBoxesSymbol = symbols.find(sym => sym.toString() === 'Symbol(@deshretBoxes)');
                    const boxmodeSymbol = symbols.find(sym => sym.toString() === 'Symbol(@boxmode)');
                    const currentBoxSymbol = symbols.find(sym => sym.toString() === 'Symbol(@currentBox)');

                    if (boxesSymbol) {
                        const boxesValue = parsed[boxesSymbol];
                        if (Array.isArray(boxesValue)) {
                            this.log(`🎯 Object ${i}: Found @boxes = Array[${boxesValue.length}]`);
                        } else {
                            this.log(`Object ${i}: Found @boxes = ${typeof boxesValue}`);
                        }
                    }

                    if (omuranBoxesSymbol) {
                        const omuranBoxesValue = parsed[omuranBoxesSymbol];
                        if (Array.isArray(omuranBoxesValue)) {
                            this.log(`🎯 Object ${i}: Found @omuranBoxes = Array[${omuranBoxesValue.length}]`);
                        } else {
                            this.log(`Object ${i}: Found @omuranBoxes = ${typeof omuranBoxesValue}`);
                        }
                    }

                    if (deshretBoxesSymbol) {
                        const deshretBoxesValue = parsed[deshretBoxesSymbol];
                        if (Array.isArray(deshretBoxesValue)) {
                            this.log(`🎯 Object ${i}: Found @deshretBoxes = Array[${deshretBoxesValue.length}]`);
                        } else {
                            this.log(`Object ${i}: Found @deshretBoxes = ${typeof deshretBoxesValue}`);
                        }
                    }

                    if (boxmodeSymbol) {
                        this.log(`Object ${i}: Found @boxmode = ${parsed[boxmodeSymbol]}`);
                    }

                    if (currentBoxSymbol) {
                        this.log(`Object ${i}: Found @currentBox = ${parsed[currentBoxSymbol]}`);
                    }

                    // List all symbols for debugging
                    if (rubyVars.length > 0) {
                        const varNames = rubyVars.map(sym => sym.toString().replace('Symbol(', '').replace(')', ''));
                        this.log(`Object ${i} variables: [${varNames.join(', ')}]`);
                    }

                } else if (Array.isArray(parsed)) {
                    this.log(`Object ${i}: Array with ${parsed.length} items`);
                } else {
                    this.log(`Object ${i}: ${typeof parsed} value`);
                }

            } catch (parseError) {
                this.log(`Object ${i}: ❌ Parse failed: ${parseError.message}`);
            }
        }
    }

    async tryOriginalParsing() {
        this.log('\n\nStep 2: Try parsing with original app logic');

        const gameOld = fs.readFileSync('Game old.rxdata');

        // Simulate the app's parsing exactly
        const marshalHeaders = [];
        for (let i = 0; i < gameOld.length - 1; i++) {
            if (gameOld[i] === 4 && gameOld[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const parsedObjects = {};
        const rawObjects = {};

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : gameOld.length;
            const section = gameOld.slice(start, end);

            try {
                const rawParsed = load(section);
                rawObjects[i] = rawParsed;

                if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                    const symbols = Object.getOwnPropertySymbols(rawParsed);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    if (rubyVars.length > 0) {
                        const processed = this.processRubyObject(rawParsed);
                        parsedObjects[i] = processed;

                        // Check if this processed object has boxes
                        if (processed && processed['@rb:object'] && processed['@rb:object']['@rb:attributes']) {
                            const attrs = processed['@rb:object']['@rb:attributes'];
                            if (attrs['@boxes'] && Array.isArray(attrs['@boxes'])) {
                                this.log(`🎯 PROCESSED Object ${i}: @boxes = Array[${attrs['@boxes'].length}]`);
                            }
                            if (attrs['@omuranBoxes'] && Array.isArray(attrs['@omuranBoxes'])) {
                                this.log(`🎯 PROCESSED Object ${i}: @omuranBoxes = Array[${attrs['@omuranBoxes'].length}]`);
                            }
                            if (attrs['@deshretBoxes'] && Array.isArray(attrs['@deshretBoxes'])) {
                                this.log(`🎯 PROCESSED Object ${i}: @deshretBoxes = Array[${attrs['@deshretBoxes'].length}]`);
                            }
                        }
                    }
                }
            } catch (parseError) {
                this.log(`Processed Object ${i}: Parse failed: ${parseError.message}`);
            }
        }

        this.log(`\nOriginal parsing: ${Object.keys(parsedObjects).length} processed objects`);
        this.log(`Raw objects: ${Object.keys(rawObjects).length} raw objects`);

        // List which objects were successfully processed
        const processedIndices = Object.keys(parsedObjects).map(k => parseInt(k)).sort((a, b) => a - b);
        this.log(`Successfully processed objects: [${processedIndices.join(', ')}]`);

        // List which objects failed
        const allIndices = Object.keys(rawObjects).map(k => parseInt(k)).sort((a, b) => a - b);
        const failedIndices = allIndices.filter(i => !processedIndices.includes(i));
        if (failedIndices.length > 0) {
            this.log(`Failed to process objects: [${failedIndices.join(', ')}]`);
        }
    }

    processRubyObject(obj) {
        // Simplified version of the app's processRubyObject
        if (!obj || typeof obj !== 'object') {
            return this.convertByteArrayToString(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.processRubyObject(item));
        }

        const symbolKeys = Object.getOwnPropertySymbols(obj);
        const regularKeys = Object.keys(obj);

        const rubyInstanceVars = symbolKeys.filter(sym => {
            const symStr = sym.toString();
            return symStr.includes('@') && !symStr.includes('class');
        });

        if (rubyInstanceVars.length > 0) {
            const rbObject = {
                '@rb:object': {
                    '@rb:attributes': {}
                }
            };

            const classSymbol = symbolKeys.find(sym => sym.toString().includes('class'));
            if (classSymbol) {
                rbObject['@rb:object']['@rb:klass'] = obj[classSymbol];
            }

            rubyInstanceVars.forEach(sym => {
                const key = sym.toString().replace('Symbol(', '').replace(')', '');
                rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObject(obj[sym]);
            });

            regularKeys.forEach(key => {
                if (key !== 'class') {
                    rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObject(obj[key]);
                }
            });

            return rbObject;
        } else {
            const processed = {};

            regularKeys.forEach(key => {
                processed[key] = this.processRubyObject(obj[key]);
            });

            symbolKeys.forEach(sym => {
                const key = sym.toString();
                processed[key] = this.processRubyObject(obj[sym]);
            });

            return processed;
        }
    }

    convertByteArrayToString(data) {
        if (data instanceof Uint8Array) {
            try {
                const decoder = new TextDecoder('utf-8', { fatal: false });
                const str = decoder.decode(data);

                if (str && str.length > 0 && !str.includes('\uFFFD')) {
                    return str;
                }

                const simpleStr = String.fromCharCode(...Array.from(data).filter(v => v > 0));
                if (simpleStr.match(/^[\x20-\x7E\s]*$/)) {
                    return simpleStr;
                }
            } catch (e) {
                // Fall through to return original data
            }
        }

        if (Array.isArray(data) && data.length > 0 && data.every(v => typeof v === 'number' && v >= 0 && v <= 255)) {
            try {
                const buffer = new Uint8Array(data);
                const decoder = new TextDecoder('utf-8', { fatal: false });
                const str = decoder.decode(buffer);

                if (str && str.length > 0 && !str.includes('\uFFFD')) {
                    return str;
                }

                const simpleStr = String.fromCharCode(...data.filter(v => v > 0));
                if (simpleStr.match(/^[\x20-\x7E\s]*$/)) {
                    return simpleStr;
                }
            } catch (e) {
                // Fall through to return original array
            }
        }
        return data;
    }
}

// Run test
const test = new FindBoxesTest();
test.runTest();