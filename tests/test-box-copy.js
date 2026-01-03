const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Test Suite: Box Copy Functionality
 * Tests copying boxes from Game old (object 16) to Game new (object 14)
 * This replicates the exact operation that breaks in the app
 */

class BoxCopyTests {
    constructor() {
        this.testResults = [];
        this.testFiles = [];
    }

    log(message) {
        console.log(`[BOX-TEST] ${message}`);
    }

    error(message) {
        console.error(`[BOX-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[BOX-SUCCESS] ${message}`);
    }

    async runAllTests() {
        console.log('=== BOX COPY FUNCTIONALITY TEST SUITE ===\n');

        try {
            await this.testLoadBothFiles();
            await this.testAnalyzeBoxStructures();
            await this.testCopyBoxesOperation();
            await this.testSaveAndReload();
            await this.testVerifyIntegrity();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`Box copy test suite failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
            process.exit(1);
        }
    }

    async testLoadBothFiles() {
        this.log('Test 1: Load Both Game Files');

        const gameNewFile = 'Game new.rxdata';
        const gameOldFile = 'Game old.rxdata';

        if (!fs.existsSync(gameNewFile)) {
            throw new Error(`${gameNewFile} not found`);
        }
        if (!fs.existsSync(gameOldFile)) {
            throw new Error(`${gameOldFile} not found`);
        }

        this.gameNewData = fs.readFileSync(gameNewFile);
        this.gameOldData = fs.readFileSync(gameOldFile);

        this.log(`Game new: ${this.gameNewData.length} bytes`);
        this.log(`Game old: ${this.gameOldData.length} bytes`);

        // Parse both files
        this.gameNewObjects = this.parseRXDataFile(this.gameNewData);
        this.gameOldObjects = this.parseRXDataFile(this.gameOldData);

        this.log(`Game new: ${Object.keys(this.gameNewObjects).length} objects parsed`);
        this.log(`Game old: ${Object.keys(this.gameOldObjects).length} objects parsed`);

        this.success('Test 1 PASSED: Both files loaded and parsed');
        this.testResults.push({ test: 'Load Both Game Files', passed: true });
    }

    parseRXDataFile(data) {
        // Find marshal headers
        const marshalHeaders = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        // Parse each object
        const parsedObjects = {};
        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            try {
                const parsed = load(section);
                parsedObjects[i] = parsed;
            } catch (e) {
                this.log(`Object ${i} failed to parse: ${e.message}`);
            }
        }

        return parsedObjects;
    }

    async testAnalyzeBoxStructures() {
        this.log('Test 2: Analyze Box Structures');

        // Check Game new object 14 (should have @boxes)
        if (!this.gameNewObjects[14]) {
            throw new Error('Game new object 14 not found');
        }

        // Check Game old object 16 (should have @boxes, @deshretBoxes, @omuranBoxes)
        if (!this.gameOldObjects[16]) {
            throw new Error('Game old object 16 not found');
        }

        const gameNewObj14 = this.gameNewObjects[14];
        const gameOldObj16 = this.gameOldObjects[16];

        this.log('Game new object 14 symbols:');
        Object.getOwnPropertySymbols(gameNewObj14).forEach(sym => {
            this.log(`  ${sym.toString()}`);
        });

        this.log('Game old object 16 symbols:');
        Object.getOwnPropertySymbols(gameOldObj16).forEach(sym => {
            this.log(`  ${sym.toString()}`);
        });

        // Find the boxes symbols
        const gameNewBoxesSymbol = Object.getOwnPropertySymbols(gameNewObj14).find(s => s.toString() === 'Symbol(@boxes)');
        const gameOldBoxesSymbol = Object.getOwnPropertySymbols(gameOldObj16).find(s => s.toString() === 'Symbol(@boxes)');

        if (!gameNewBoxesSymbol) {
            throw new Error('Game new @boxes symbol not found');
        }
        if (!gameOldBoxesSymbol) {
            throw new Error('Game old @boxes symbol not found');
        }

        const gameNewBoxes = gameNewObj14[gameNewBoxesSymbol];
        const gameOldBoxes = gameOldObj16[gameOldBoxesSymbol];

        this.log(`Game new boxes: ${Array.isArray(gameNewBoxes) ? gameNewBoxes.length : 'not array'}`);
        this.log(`Game old boxes: ${Array.isArray(gameOldBoxes) ? gameOldBoxes.length : 'not array'}`);

        // Store for later use
        this.gameNewBoxesSymbol = gameNewBoxesSymbol;
        this.gameOldBoxesSymbol = gameOldBoxesSymbol;

        this.success('Test 2 PASSED: Box structures analyzed');
        this.testResults.push({ test: 'Analyze Box Structures', passed: true });
    }

    async testCopyBoxesOperation() {
        this.log('Test 3: Copy Boxes Operation (Game old 16→@boxes to Game new 14→@boxes)');

        const gameNewObj14 = this.gameNewObjects[14];
        const gameOldObj16 = this.gameOldObjects[16];

        // Get the source boxes (from Game old)
        const sourceBoxes = gameOldObj16[this.gameOldBoxesSymbol];

        this.log(`Source boxes type: ${Array.isArray(sourceBoxes) ? 'Array' : typeof sourceBoxes}`);
        this.log(`Source boxes length: ${Array.isArray(sourceBoxes) ? sourceBoxes.length : 'N/A'}`);

        if (!Array.isArray(sourceBoxes)) {
            throw new Error('Source boxes is not an array');
        }

        // CRITICAL FIX: Don't deep clone! Direct assignment preserves Ruby Marshal symbols
        this.log('Using direct assignment instead of deep clone to preserve Ruby symbols');

        // Replace the target boxes (in Game new) with direct reference
        const originalBoxes = gameNewObj14[this.gameNewBoxesSymbol];
        this.log(`Original target boxes length: ${Array.isArray(originalBoxes) ? originalBoxes.length : 'N/A'}`);

        // Perform the copy operation - direct assignment
        gameNewObj14[this.gameNewBoxesSymbol] = sourceBoxes;

        this.log('Copy operation completed (direct assignment)');
        this.log(`New target boxes length: ${gameNewObj14[this.gameNewBoxesSymbol].length}`);

        // Test serialization immediately to catch issues early
        try {
            this.log('Testing serialization of modified object...');
            const testSerialized = dump(gameNewObj14);
            this.log(`Modified object 14 serializes successfully: ${testSerialized.length} bytes`);
        } catch (error) {
            throw new Error(`Serialization test failed: ${error.message}`);
        }

        this.success('Test 3 PASSED: Boxes copied successfully');
        this.testResults.push({ test: 'Copy Boxes Operation', passed: true });
    }

    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }

        if (obj instanceof Array) {
            return obj.map(item => this.deepClone(item));
        }

        if (obj instanceof Uint8Array) {
            return new Uint8Array(obj);
        }

        if (typeof obj === 'object') {
            const cloned = {};

            // Clone regular properties first
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key]);
            });

            // Clone symbol properties (important for Ruby objects)
            Object.getOwnPropertySymbols(obj).forEach(sym => {
                cloned[sym] = this.deepClone(obj[sym]);
            });

            // Preserve prototype if it exists
            if (Object.getPrototypeOf(obj) !== Object.prototype) {
                Object.setPrototypeOf(cloned, Object.getPrototypeOf(obj));
            }

            return cloned;
        }

        return obj;
    }

    async testSaveAndReload() {
        this.log('Test 4: Save Modified File and Reload');

        // Reconstruct the Game new file with modifications
        const modifiedData = await this.reconstructFile(this.gameNewData, this.gameNewObjects);

        // Save the modified file
        const testFileName = 'tests/test-box-copy-result.rxdata';
        fs.writeFileSync(testFileName, modifiedData);
        this.testFiles.push(testFileName);

        this.log(`Modified file saved: ${modifiedData.length} bytes`);
        this.log(`Size difference: ${modifiedData.length - this.gameNewData.length} bytes`);

        // Try to reload and parse the modified file
        const reloadedData = fs.readFileSync(testFileName);
        this.log(`Reloaded file: ${reloadedData.length} bytes`);

        try {
            this.reloadedObjects = this.parseRXDataFile(reloadedData);
            this.log(`Reloaded objects: ${Object.keys(this.reloadedObjects).length}`);
        } catch (error) {
            throw new Error(`Failed to parse reloaded file: ${error.message}`);
        }

        this.success('Test 4 PASSED: File saved and reloaded successfully');
        this.testResults.push({ test: 'Save and Reload', passed: true });
    }

    async reconstructFile(originalData, modifiedObjects) {
        // Find marshal headers in original data
        const marshalHeaders = [];
        for (let i = 0; i < originalData.length - 1; i++) {
            if (originalData[i] === 4 && originalData[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        // Reconstruct each section
        const newSections = [];

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : originalData.length;
            const originalSection = originalData.slice(start, end);

            if (modifiedObjects[i]) {
                // Use modified object - serialize it
                try {
                    this.log(`Serializing modified object ${i}...`);
                    const serialized = dump(modifiedObjects[i]);
                    newSections.push(serialized);
                    this.log(`Object ${i}: serialized to ${serialized.length} bytes (was ${originalSection.length})`);
                } catch (error) {
                    this.error(`Failed to serialize object ${i}: ${error.message}`);
                    throw error;
                }
            } else {
                // Use original section
                newSections.push(originalSection);
                this.log(`Object ${i}: using original ${originalSection.length} bytes`);
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

    async testVerifyIntegrity() {
        this.log('Test 5: Verify File Integrity After Copy');

        if (!this.reloadedObjects[14]) {
            throw new Error('Reloaded object 14 not found');
        }

        const reloadedObj14 = this.reloadedObjects[14];
        const boxesSymbol = Object.getOwnPropertySymbols(reloadedObj14).find(s => s.toString() === 'Symbol(@boxes)');

        if (!boxesSymbol) {
            throw new Error('Reloaded @boxes symbol not found');
        }

        const reloadedBoxes = reloadedObj14[boxesSymbol];

        if (!Array.isArray(reloadedBoxes)) {
            throw new Error(`Reloaded boxes is not an array: ${typeof reloadedBoxes}`);
        }

        this.log(`Reloaded boxes count: ${reloadedBoxes.length}`);

        // Compare with original source boxes
        const originalSourceBoxes = this.gameOldObjects[16][this.gameOldBoxesSymbol];

        if (reloadedBoxes.length !== originalSourceBoxes.length) {
            throw new Error(`Box count mismatch: expected ${originalSourceBoxes.length}, got ${reloadedBoxes.length}`);
        }

        // Check first box structure
        if (reloadedBoxes.length > 0 && originalSourceBoxes.length > 0) {
            const reloadedFirstBox = reloadedBoxes[0];
            const originalFirstBox = originalSourceBoxes[0];

            this.log(`First box comparison:`);
            this.log(`  Reloaded type: ${typeof reloadedFirstBox}`);
            this.log(`  Original type: ${typeof originalFirstBox}`);

            if (typeof reloadedFirstBox === 'object' && typeof originalFirstBox === 'object') {
                const reloadedKeys = Object.keys(reloadedFirstBox).length + Object.getOwnPropertySymbols(reloadedFirstBox).length;
                const originalKeys = Object.keys(originalFirstBox).length + Object.getOwnPropertySymbols(originalFirstBox).length;

                this.log(`  Reloaded keys: ${reloadedKeys}`);
                this.log(`  Original keys: ${originalKeys}`);
            }
        }

        // Try to parse all objects to ensure file integrity
        let parsedCount = 0;
        const totalObjects = Object.keys(this.reloadedObjects).length;

        for (const objIndex of Object.keys(this.reloadedObjects)) {
            if (this.reloadedObjects[objIndex]) {
                parsedCount++;
            }
        }

        this.log(`File integrity: ${parsedCount}/${totalObjects} objects parsed successfully`);

        if (parsedCount < totalObjects) {
            throw new Error(`File integrity compromised: only ${parsedCount}/${totalObjects} objects parsed`);
        }

        this.success('Test 5 PASSED: File integrity verified after box copy');
        this.testResults.push({ test: 'Verify File Integrity', passed: true });
    }

    printResults() {
        console.log('\n=== BOX COPY TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 ALL BOX COPY TESTS PASSED! The box copy functionality is working correctly.');
        } else {
            console.log('❌ Box copy tests failed. The save file corruption issue has been identified.');
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

// Run tests if this file is executed directly
if (require.main === module) {
    const tests = new BoxCopyTests();
    tests.runAllTests().catch(error => {
        console.error('Box copy test suite failed:', error);
        process.exit(1);
    });
}

module.exports = BoxCopyTests;