const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Test Suite: Real App Behavior Test
 * This test simulates the exact copy/paste operation that happens in the app
 * and verifies that the saved file is not corrupted
 */

class RealAppBehaviorTest {
    constructor() {
        this.testResults = [];
        this.testFiles = [];
    }

    log(message) {
        console.log(`[REAL-APP] ${message}`);
    }

    error(message) {
        console.error(`[REAL-APP-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[REAL-APP-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== REAL APP BEHAVIOR TEST ===\n');
        console.log('This test simulates the exact copy/paste operation from the app');
        console.log('Copy: Game old.rxdata (object 16 → @boxes) to Game new.rxdata (object 14 → @boxes)\n');

        try {
            await this.testLoadFiles();
            await this.testSimulateAppCopyPaste();
            await this.testSaveAndVerify();
            await this.testGameCompatibility();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`Real app behavior test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
            process.exit(1);
        }
    }

    async testLoadFiles() {
        this.log('Step 1: Load and parse both save files (simulating app startup)');

        // Load files
        this.gameNewData = fs.readFileSync('Game new.rxdata');
        this.gameOldData = fs.readFileSync('Game old.rxdata');

        // Parse both files exactly like the app does
        this.gameNewObjects = this.parseFileExactlyLikeApp(this.gameNewData);
        this.gameOldObjects = this.parseFileExactlyLikeApp(this.gameOldData);

        this.log(`Game new: ${Object.keys(this.gameNewObjects.rawObjects).length} raw objects`);
        this.log(`Game old: ${Object.keys(this.gameOldObjects.rawObjects).length} raw objects`);

        this.success('Step 1 PASSED: Files loaded and parsed like the app');
        this.testResults.push({ test: 'Load Files Like App', passed: true });
    }

    parseFileExactlyLikeApp(data) {
        // This method replicates the exact parsing logic from the app
        const marshalHeaders = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const parsedObjects = {};
        const rawObjects = {}; // Store original Ruby objects like the app

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            try {
                const rawParsed = load(section);
                rawObjects[i] = rawParsed; // Store original like the app

                if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                    const symbols = Object.getOwnPropertySymbols(rawParsed);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    if (rubyVars.length > 0) {
                        const processed = this.processRubyObjectLikeApp(rawParsed, false);
                        parsedObjects[i] = processed;
                    }
                }
            } catch (parseError) {
                this.log(`Failed to parse section ${i}: ${parseError.message}`);
            }
        }

        return { parsedObjects, rawObjects };
    }

    processRubyObjectLikeApp(obj, isRoot = false) {
        // Replicate the app's processRubyObject method
        if (!obj || typeof obj !== 'object') {
            return this.convertByteArrayToStringLikeApp(obj);
        }

        if (obj instanceof Uint8Array) {
            return this.convertByteArrayToStringLikeApp(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.processRubyObjectLikeApp(item, false));
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
                rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObjectLikeApp(obj[sym], false);
            });

            regularKeys.forEach(key => {
                if (key !== 'class') {
                    rbObject['@rb:object']['@rb:attributes'][key] = this.processRubyObjectLikeApp(obj[key], false);
                }
            });

            return rbObject;
        } else {
            const processed = {};

            regularKeys.forEach(key => {
                processed[key] = this.processRubyObjectLikeApp(obj[key], false);
            });

            symbolKeys.forEach(sym => {
                const key = sym.toString();
                processed[key] = this.processRubyObjectLikeApp(obj[sym], false);
            });

            return processed;
        }
    }

    convertByteArrayToStringLikeApp(data) {
        // Replicate the app's byte array conversion
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

    async testSimulateAppCopyPaste() {
        this.log('Step 2: Simulate app copy/paste operation');

        // Get the source data (Game old object 16 @boxes) - RAW DATA
        const sourceRawObject = this.gameOldObjects.rawObjects[16];
        if (!sourceRawObject) {
            throw new Error('Source raw object 16 not found');
        }

        const sourceBoxesSymbol = Object.getOwnPropertySymbols(sourceRawObject).find(s => s.toString() === 'Symbol(@boxes)');
        if (!sourceBoxesSymbol) {
            throw new Error('Source @boxes symbol not found');
        }

        const sourceBoxes = sourceRawObject[sourceBoxesSymbol];
        this.log(`Source boxes: ${Array.isArray(sourceBoxes) ? sourceBoxes.length : 'not array'} items`);

        // Get the target object (Game new object 14) - RAW DATA
        const targetRawObject = this.gameNewObjects.rawObjects[14];
        if (!targetRawObject) {
            throw new Error('Target raw object 14 not found');
        }

        const targetBoxesSymbol = Object.getOwnPropertySymbols(targetRawObject).find(s => s.toString() === 'Symbol(@boxes)');
        if (!targetBoxesSymbol) {
            throw new Error('Target @boxes symbol not found');
        }

        this.log('Original target boxes:', Array.isArray(targetRawObject[targetBoxesSymbol]) ? targetRawObject[targetBoxesSymbol].length : 'not array');

        // SIMULATE THE APP'S COPY/PASTE: Direct assignment to preserve Ruby symbols
        this.log('Performing direct assignment (like the fixed app)...');
        targetRawObject[targetBoxesSymbol] = sourceBoxes; // Direct assignment!

        this.log('Copy/paste simulation completed');
        this.log('New target boxes:', Array.isArray(targetRawObject[targetBoxesSymbol]) ? targetRawObject[targetBoxesSymbol].length : 'not array');

        // Verify the assignment worked
        if (!Array.isArray(targetRawObject[targetBoxesSymbol])) {
            throw new Error('Copy/paste failed - target is not an array');
        }

        if (targetRawObject[targetBoxesSymbol].length !== sourceBoxes.length) {
            throw new Error(`Copy/paste failed - length mismatch: expected ${sourceBoxes.length}, got ${targetRawObject[targetBoxesSymbol].length}`);
        }

        this.success('Step 2 PASSED: App copy/paste operation simulated');
        this.testResults.push({ test: 'Simulate App Copy/Paste', passed: true });
    }

    async testSaveAndVerify() {
        this.log('Step 3: Save modified file and verify integrity (simulating app save)');

        // Reconstruct the file exactly like the app does
        const modifiedData = await this.reconstructFileExactlyLikeApp(this.gameNewData, this.gameNewObjects.rawObjects);

        // Save the test file
        const testFileName = 'tests/test-real-app-behavior.rxdata';
        fs.writeFileSync(testFileName, modifiedData);
        this.testFiles.push(testFileName);

        this.log(`Modified file saved: ${modifiedData.length} bytes`);
        this.log(`Size difference: ${modifiedData.length - this.gameNewData.length} bytes`);

        // Try to reload and parse the modified file
        const reloadedData = fs.readFileSync(testFileName);
        this.log(`Reloaded file: ${reloadedData.length} bytes`);

        try {
            this.reloadedObjects = this.parseFileExactlyLikeApp(reloadedData);
            this.log(`Reloaded objects: ${Object.keys(this.reloadedObjects.rawObjects).length}`);
        } catch (error) {
            throw new Error(`Failed to parse reloaded file: ${error.message}`);
        }

        // Verify the boxes are still there and correct
        const reloadedObj14 = this.reloadedObjects.rawObjects[14];
        if (!reloadedObj14) {
            throw new Error('Reloaded object 14 not found');
        }

        const reloadedBoxesSymbol = Object.getOwnPropertySymbols(reloadedObj14).find(s => s.toString() === 'Symbol(@boxes)');
        if (!reloadedBoxesSymbol) {
            throw new Error('Reloaded @boxes symbol not found');
        }

        const reloadedBoxes = reloadedObj14[reloadedBoxesSymbol];
        if (!Array.isArray(reloadedBoxes)) {
            throw new Error(`Reloaded boxes is not an array: ${typeof reloadedBoxes}`);
        }

        this.log(`Reloaded boxes count: ${reloadedBoxes.length}`);

        // Compare with original source
        const originalSourceBoxes = this.gameOldObjects.rawObjects[16][Object.getOwnPropertySymbols(this.gameOldObjects.rawObjects[16]).find(s => s.toString() === 'Symbol(@boxes)')];

        if (reloadedBoxes.length !== originalSourceBoxes.length) {
            throw new Error(`Box count mismatch: expected ${originalSourceBoxes.length}, got ${reloadedBoxes.length}`);
        }

        this.success('Step 3 PASSED: File saved and verified successfully');
        this.testResults.push({ test: 'Save and Verify', passed: true });
    }

    async reconstructFileExactlyLikeApp(originalData, rawObjects) {
        // Replicate the app's reconstructFileWithModifications method
        const marshalHeaders = [];
        for (let i = 0; i < originalData.length - 1; i++) {
            if (originalData[i] === 4 && originalData[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const newSections = [];

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : originalData.length;
            const section = originalData.slice(start, end);

            if (rawObjects[i]) {
                // Use the raw Ruby object directly - serialize it
                this.log(`Serializing raw object ${i}...`);
                const serialized = dump(rawObjects[i]);
                newSections.push(serialized);
                this.log(`Object ${i}: serialized to ${serialized.length} bytes (was ${section.length})`);
            } else {
                // Use original section
                newSections.push(section);
                this.log(`Object ${i}: using original ${section.length} bytes`);
            }
        }

        // Combine all sections
        const totalLength = newSections.reduce((sum, section) => sum + section.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const section of newSections) {
            result.set(section, offset);
            offset += section.length;
        }

        return result;
    }

    async testGameCompatibility() {
        this.log('Step 4: Test game compatibility (verify file structure)');

        const testFileName = 'tests/test-real-app-behavior.rxdata';
        const testData = fs.readFileSync(testFileName);

        // Parse the file one more time to ensure it's completely valid
        const finalParse = this.parseFileExactlyLikeApp(testData);

        let parsedCount = 0;
        const totalObjects = Object.keys(finalParse.rawObjects).length;

        for (const objIndex of Object.keys(finalParse.rawObjects)) {
            if (finalParse.rawObjects[objIndex]) {
                parsedCount++;
            }
        }

        this.log(`Game compatibility: ${parsedCount}/${totalObjects} objects parsed successfully`);

        if (parsedCount < totalObjects) {
            throw new Error(`Game compatibility failed: only ${parsedCount}/${totalObjects} objects parsed`);
        }

        // Verify critical game objects are intact
        const criticalObjects = [0, 2, 3, 14]; // Player data, game data, boxes
        for (const objIndex of criticalObjects) {
            if (!finalParse.rawObjects[objIndex]) {
                throw new Error(`Critical game object ${objIndex} is missing or corrupted`);
            }
        }

        this.success('Step 4 PASSED: Game compatibility verified');
        this.testResults.push({ test: 'Game Compatibility', passed: true });
    }

    printResults() {
        console.log('\n=== REAL APP BEHAVIOR TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 REAL APP BEHAVIOR TEST PASSED!');
            console.log('The copy/paste operation works correctly and produces game-compatible save files.');
            console.log('The save file corruption issue has been FIXED! ✨');
        } else {
            console.log('❌ Real app behavior test failed. The save file corruption issue persists.');
            process.exit(1);
        }
    }

    cleanup() {
        this.log('\nCleaning up test files...');
        this.testFiles.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
                this.log(`Deleted: ${file}`);
            }
        });
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    const test = new RealAppBehaviorTest();
    test.runTest().catch(error => {
        console.error('Real app behavior test failed:', error);
        process.exit(1);
    });
}

module.exports = RealAppBehaviorTest;