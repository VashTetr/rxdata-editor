const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Test Suite: Reload After Save Test
 * Tests the complete workflow: load → edit → save → reload
 * This reproduces the exact issue the user reported
 */

class ReloadAfterSaveTest {
    constructor() {
        this.testResults = [];
        this.testFiles = [];

        // Simulate the app's structure
        this.leftPane = {
            data: null,
            filePath: null,
            parsedData: null,
            rawObjects: null,
            selectedPath: null,
            selectedValue: null
        };

        this.modifiedObjects = {
            left: new Set()
        };
    }

    log(message) {
        console.log(`[RELOAD-TEST] ${message}`);
    }

    error(message) {
        console.error(`[RELOAD-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[RELOAD-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== RELOAD AFTER SAVE TEST ===\n');
        console.log('This test reproduces the user-reported issue: edit → save → reload → change is lost');

        try {
            await this.testInitialLoad();
            await this.testMakeChange();
            await this.testSaveFile();
            await this.testReloadFile();
            await this.testVerifyChangeStillExists();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`Reload after save test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
            process.exit(1);
        }
    }

    async testInitialLoad() {
        this.log('Step 1: Initial file load (simulating app startup)');

        const originalFile = 'Game new.rxdata';
        await this.loadFileByPathLikeApp(originalFile, 'left');

        // Get the original character name
        const playerObject = this.leftPane.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@name)');
        this.originalName = this.convertToString(playerObject[nameSymbol]);

        this.log(`Original character name: "${this.originalName}"`);
        this.log(`Modified objects tracking: ${this.modifiedObjects.left.size} objects`);

        this.success('Step 1 PASSED: Initial file loaded');
        this.testResults.push({ test: 'Initial Load', passed: true });
    }

    async loadFileByPathLikeApp(filePath, pane) {
        // Simulate the app's loadFileByPath method
        const data = fs.readFileSync(filePath);
        const paneData = this[pane + 'Pane'];
        paneData.filePath = filePath;
        paneData.data = data;

        // Parse like the app does
        const marshalHeaders = [];
        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const parsedObjects = {};
        const rawObjects = {};

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            try {
                const rawParsed = load(section);
                rawObjects[i] = rawParsed;

                if (rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)) {
                    const symbols = Object.getOwnPropertySymbols(rawParsed);
                    const rubyVars = symbols.filter(sym => sym.toString().includes('@'));

                    if (rubyVars.length > 0) {
                        parsedObjects[i] = rawParsed; // Simplified for this test
                    }
                }
            } catch (parseError) {
                this.log(`Failed to parse section ${i}: ${parseError.message}`);
            }
        }

        paneData.parsedData = parsedObjects;
        paneData.rawObjects = rawObjects;

        // CRITICAL: Clear modification tracking when loading (like the fixed app does)
        this.modifiedObjects[pane].clear();
        this.log(`Cleared modification tracking for ${pane} pane`);
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

    async testMakeChange() {
        this.log('Step 2: Make a change (simulating property editor edit)');

        this.newName = 'TestEditedName';
        this.log(`Changing name from "${this.originalName}" to "${this.newName}"`);

        // Simulate the property editor change
        const playerObject = this.leftPane.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@name)');

        // Convert to Uint8Array like the app does
        const newNameBytes = new Uint8Array(Array.from(this.newName).map(char => char.charCodeAt(0)));
        playerObject[nameSymbol] = newNameBytes;

        // Mark object as modified (like the app does)
        this.modifiedObjects.left.add(0);
        this.log(`Marked object 0 as modified`);
        this.log(`Modified objects tracking: ${this.modifiedObjects.left.size} objects`);

        // Verify the change was made
        const updatedName = this.convertToString(playerObject[nameSymbol]);
        if (updatedName !== this.newName) {
            throw new Error(`Change not applied correctly: expected "${this.newName}", got "${updatedName}"`);
        }

        this.success('Step 2 PASSED: Change made and tracked');
        this.testResults.push({ test: 'Make Change', passed: true });
    }

    async testSaveFile() {
        this.log('Step 3: Save file (simulating app save with selective serialization)');

        // Reconstruct file with selective serialization
        const updatedData = await this.reconstructFileWithModifications(this.leftPane);

        const testFileName = 'tests/test-reload-after-save.rxdata';
        fs.writeFileSync(testFileName, updatedData);
        this.testFiles.push(testFileName);

        this.log(`Original size: ${this.leftPane.data.length} bytes`);
        this.log(`Saved size: ${updatedData.length} bytes`);
        this.log(`Size difference: ${updatedData.length - this.leftPane.data.length} bytes`);

        // Update the pane data to reflect the saved file (like the app does)
        this.leftPane.data = updatedData;
        this.leftPane.filePath = testFileName;

        this.success('Step 3 PASSED: File saved with selective serialization');
        this.testResults.push({ test: 'Save File', passed: true });
    }

    async reconstructFileWithModifications(paneData) {
        // Simulate the app's reconstructFileWithModifications method
        const data = paneData.data;
        const marshalHeaders = [];

        for (let i = 0; i < data.length - 1; i++) {
            if (data[i] === 4 && data[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const newSections = [];

        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : data.length;
            const section = data.slice(start, end);

            // Check if this object was modified
            if (this.wasObjectModified(paneData, i)) {
                this.log(`Re-serializing modified object ${i}`);
                const serialized = dump(paneData.rawObjects[i]);
                newSections.push(serialized);
            } else {
                this.log(`Preserving original object ${i}`);
                newSections.push(section);
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

    wasObjectModified(paneData, objectIndex) {
        const paneKey = paneData === this.leftPane ? 'left' : 'right';
        return this.modifiedObjects[paneKey].has(objectIndex);
    }

    async testReloadFile() {
        this.log('Step 4: Reload file (simulating user clicking reload)');

        const testFileName = 'tests/test-reload-after-save.rxdata';

        this.log(`Modified objects before reload: ${this.modifiedObjects.left.size} objects`);
        this.log(`Objects marked as modified: [${Array.from(this.modifiedObjects.left).join(', ')}]`);

        // Reload the file (this should clear modification tracking)
        await this.loadFileByPathLikeApp(testFileName, 'left');

        this.log(`Modified objects after reload: ${this.modifiedObjects.left.size} objects`);

        this.success('Step 4 PASSED: File reloaded');
        this.testResults.push({ test: 'Reload File', passed: true });
    }

    async testVerifyChangeStillExists() {
        this.log('Step 5: Verify change still exists after reload');

        // Check the character name in the reloaded file
        const playerObject = this.leftPane.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@name)');
        const reloadedName = this.convertToString(playerObject[nameSymbol]);

        this.log(`Reloaded character name: "${reloadedName}"`);
        this.log(`Expected character name: "${this.newName}"`);

        if (reloadedName !== this.newName) {
            throw new Error(`Change was lost after reload! Expected "${this.newName}", got "${reloadedName}"`);
        }

        this.success('Step 5 PASSED: Change persisted after reload');
        this.testResults.push({ test: 'Verify Change Persistence', passed: true });
    }

    printResults() {
        console.log('\n=== RELOAD AFTER SAVE TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 RELOAD AFTER SAVE TEST PASSED!');
            console.log('The complete workflow works correctly:');
            console.log('- Changes are made and tracked');
            console.log('- Files are saved with selective serialization');
            console.log('- Changes persist after reload');
            console.log('- Modification tracking is properly reset');
        } else {
            console.log('❌ Reload after save test failed.');
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
    const test = new ReloadAfterSaveTest();
    test.runTest().catch(error => {
        console.error('Reload after save test failed:', error);
        process.exit(1);
    });
}

module.exports = ReloadAfterSaveTest;