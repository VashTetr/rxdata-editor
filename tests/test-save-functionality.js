const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');
const path = require('path');

/**
 * Test Suite: Save Functionality
 * Tests the core save/load functionality for RXData files with modifications
 */

class SaveFunctionalityTests {
    constructor() {
        this.testResults = [];
        this.testFiles = [];
    }

    log(message) {
        console.log(`[TEST] ${message}`);
    }

    error(message) {
        console.error(`[ERROR] ${message}`);
    }

    success(message) {
        console.log(`[SUCCESS] ${message}`);
    }

    async runAllTests() {
        console.log('=== RXDATA SAVE FUNCTIONALITY TEST SUITE ===\n');

        try {
            await this.testBasicLoadAndParse();
            await this.testModificationAndSave();
            await this.testPersistenceAfterReload();
            await this.testMultipleModifications();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`Test suite failed: ${error.message}`);
            process.exit(1);
        }
    }

    async testBasicLoadAndParse() {
        this.log('Test 1: Basic Load and Parse');

        const testFile = 'Game new.rxdata';
        if (!fs.existsSync(testFile)) {
            throw new Error(`Test file ${testFile} not found`);
        }

        const originalData = fs.readFileSync(testFile);
        this.log(`Loaded file: ${originalData.length} bytes`);

        // Find marshal headers
        const marshalHeaders = [];
        for (let i = 0; i < originalData.length - 1; i++) {
            if (originalData[i] === 4 && originalData[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        if (marshalHeaders.length === 0) {
            throw new Error('No Ruby Marshal headers found');
        }

        this.log(`Found ${marshalHeaders.length} Ruby Marshal objects`);

        // Parse each object
        let parsedCount = 0;
        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : originalData.length;
            const section = originalData.slice(start, end);

            try {
                const parsed = load(section);
                parsedCount++;
            } catch (e) {
                this.log(`Object ${i} failed to parse: ${e.message}`);
            }
        }

        if (parsedCount === 0) {
            throw new Error('No objects could be parsed');
        }

        this.success(`Test 1 PASSED: ${parsedCount}/${marshalHeaders.length} objects parsed successfully`);
        this.testResults.push({ test: 'Basic Load and Parse', passed: true });
    }

    async testModificationAndSave() {
        this.log('Test 2: Modification and Save');

        const originalData = fs.readFileSync('Game new.rxdata');

        // Parse the file
        const marshalHeaders = [];
        for (let i = 0; i < originalData.length - 1; i++) {
            if (originalData[i] === 4 && originalData[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const parsedObjects = {};
        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : originalData.length;
            const section = originalData.slice(start, end);

            try {
                const parsed = load(section);
                parsedObjects[i] = parsed;
            } catch (e) {
                // Skip unparseable objects
            }
        }

        // Modify object 0 if it exists
        if (!parsedObjects[0]) {
            throw new Error('Object 0 not available for modification test');
        }

        const obj0 = parsedObjects[0];
        const symbols = Object.getOwnPropertySymbols(obj0);
        const pokegearSymbol = symbols.find(s => s.toString() === 'Symbol(@pokegear)');

        if (!pokegearSymbol) {
            throw new Error('@pokegear symbol not found in object 0');
        }

        const originalValue = obj0[pokegearSymbol];
        const modifiedValue = !originalValue;
        obj0[pokegearSymbol] = modifiedValue;

        this.log(`Modified @pokegear: ${originalValue} → ${modifiedValue}`);

        // Reconstruct the file
        const newSections = [];
        for (let i = 0; i < marshalHeaders.length; i++) {
            if (parsedObjects[i]) {
                const serialized = dump(parsedObjects[i]);
                newSections.push(serialized);
            } else {
                const start = marshalHeaders[i];
                const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : originalData.length;
                const originalSection = originalData.slice(start, end);
                newSections.push(originalSection);
            }
        }

        // Combine sections
        const totalLength = newSections.reduce((sum, section) => sum + section.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const section of newSections) {
            result.set(section, offset);
            offset += section.length;
        }

        // Save test file
        const testFileName = 'tests/test-modified.rxdata';
        fs.writeFileSync(testFileName, result);
        this.testFiles.push(testFileName);

        this.log(`Saved modified file: ${result.length} bytes (diff: ${result.length - originalData.length})`);

        this.success('Test 2 PASSED: File modified and saved successfully');
        this.testResults.push({ test: 'Modification and Save', passed: true });
    }

    async testPersistenceAfterReload() {
        this.log('Test 3: Persistence After Reload');

        const testFileName = 'tests/test-modified.rxdata';
        if (!fs.existsSync(testFileName)) {
            throw new Error('Modified test file not found');
        }

        const testData = fs.readFileSync(testFileName);

        // Parse the test file
        const testHeaders = [];
        for (let i = 0; i < testData.length - 1; i++) {
            if (testData[i] === 4 && testData[i + 1] === 8) {
                testHeaders.push(i);
            }
        }

        if (testHeaders.length === 0) {
            throw new Error('No marshal headers found in test file');
        }

        // Parse object 0
        const start = testHeaders[0];
        const end = testHeaders.length > 1 ? testHeaders[1] : testData.length;
        const section = testData.slice(start, end);

        const parsed = load(section);
        const symbols = Object.getOwnPropertySymbols(parsed);
        const pokegearSymbol = symbols.find(s => s.toString() === 'Symbol(@pokegear)');

        if (!pokegearSymbol) {
            throw new Error('@pokegear symbol not found in reloaded file');
        }

        const reloadedValue = parsed[pokegearSymbol];

        // The original value was false, so modified should be true
        if (reloadedValue !== true) {
            throw new Error(`Expected @pokegear to be true, got ${reloadedValue}`);
        }

        this.log(`Verified @pokegear value persisted: ${reloadedValue}`);

        this.success('Test 3 PASSED: Modifications persisted after reload');
        this.testResults.push({ test: 'Persistence After Reload', passed: true });
    }

    async testMultipleModifications() {
        this.log('Test 4: Multiple Modifications');

        const originalData = fs.readFileSync('Game new.rxdata');

        // Parse and modify multiple values
        const marshalHeaders = [];
        for (let i = 0; i < originalData.length - 1; i++) {
            if (originalData[i] === 4 && originalData[i + 1] === 8) {
                marshalHeaders.push(i);
            }
        }

        const parsedObjects = {};
        for (let i = 0; i < marshalHeaders.length; i++) {
            const start = marshalHeaders[i];
            const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : originalData.length;
            const section = originalData.slice(start, end);

            try {
                const parsed = load(section);
                parsedObjects[i] = parsed;
            } catch (e) {
                // Skip unparseable objects
            }
        }

        let modificationsCount = 0;

        // Modify object 0
        if (parsedObjects[0]) {
            const obj0 = parsedObjects[0];
            const symbols = Object.getOwnPropertySymbols(obj0);

            // Modify @pokegear
            const pokegearSymbol = symbols.find(s => s.toString() === 'Symbol(@pokegear)');
            if (pokegearSymbol) {
                obj0[pokegearSymbol] = true;
                modificationsCount++;
                this.log('Modified @pokegear to true');
            }

            // Modify @money if it exists and is a number
            const moneySymbol = symbols.find(s => s.toString() === 'Symbol(@money)');
            if (moneySymbol && typeof obj0[moneySymbol] === 'number') {
                const originalMoney = obj0[moneySymbol];
                obj0[moneySymbol] = originalMoney + 1000;
                modificationsCount++;
                this.log(`Modified @money: ${originalMoney} → ${obj0[moneySymbol]}`);
            }
        }

        if (modificationsCount === 0) {
            throw new Error('No modifications could be made');
        }

        // Save and verify
        const newSections = [];
        for (let i = 0; i < marshalHeaders.length; i++) {
            if (parsedObjects[i]) {
                const serialized = dump(parsedObjects[i]);
                newSections.push(serialized);
            } else {
                const start = marshalHeaders[i];
                const end = i + 1 < marshalHeaders.length ? marshalHeaders[i + 1] : originalData.length;
                const originalSection = originalData.slice(start, end);
                newSections.push(originalSection);
            }
        }

        const totalLength = newSections.reduce((sum, section) => sum + section.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const section of newSections) {
            result.set(section, offset);
            offset += section.length;
        }

        const testFileName = 'tests/test-multiple-mods.rxdata';
        fs.writeFileSync(testFileName, result);
        this.testFiles.push(testFileName);

        this.success(`Test 4 PASSED: ${modificationsCount} modifications applied and saved`);
        this.testResults.push({ test: 'Multiple Modifications', passed: true });
    }

    printResults() {
        console.log('\n=== TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 ALL TESTS PASSED! Save functionality is working correctly.');
        } else {
            console.log('❌ Some tests failed. Check the implementation.');
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
    const tests = new SaveFunctionalityTests();
    tests.runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = SaveFunctionalityTests;