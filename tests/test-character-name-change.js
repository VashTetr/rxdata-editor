const fs = require('fs');
const { load, dump } = require('@hyrious/marshal');

/**
 * Test Suite: Character Name Change Test
 * Tests changing the character name and verifying the game can still load the save
 * This reproduces the exact issue the user reported
 */

class CharacterNameChangeTest {
    constructor() {
        this.testResults = [];
        this.testFiles = [];
    }

    log(message) {
        console.log(`[NAME-TEST] ${message}`);
    }

    error(message) {
        console.error(`[NAME-ERROR] ${message}`);
    }

    success(message) {
        console.log(`[NAME-SUCCESS] ${message}`);
    }

    async runTest() {
        console.log('=== CHARACTER NAME CHANGE TEST ===\n');
        console.log('This test changes the character name and verifies save integrity');

        try {
            await this.testLoadOriginalFile();
            await this.testFindCharacterName();
            await this.testChangeCharacterName();
            await this.testSaveAndVerify();
            await this.testCompareWithOriginal();

            this.printResults();
            this.cleanup();

        } catch (error) {
            this.error(`Character name change test failed: ${error.message}`);
            this.error(`Stack: ${error.stack}`);
            process.exit(1);
        }
    }

    async testLoadOriginalFile() {
        this.log('Step 1: Load original save file');

        const originalFile = 'Game new.rxdata';
        if (!fs.existsSync(originalFile)) {
            throw new Error(`${originalFile} not found`);
        }

        this.originalData = fs.readFileSync(originalFile);
        this.log(`Original file: ${this.originalData.length} bytes`);

        // Parse the file exactly like the app does
        this.originalObjects = this.parseFileExactlyLikeApp(this.originalData);
        this.log(`Parsed objects: ${Object.keys(this.originalObjects.rawObjects).length}`);

        this.success('Step 1 PASSED: Original file loaded');
        this.testResults.push({ test: 'Load Original File', passed: true });
    }

    parseFileExactlyLikeApp(data) {
        // Find marshal headers
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

    async testFindCharacterName() {
        this.log('Step 2: Find character name in save data');

        // Character name is typically in object 0 under @name
        const playerObject = this.originalObjects.rawObjects[0];
        if (!playerObject) {
            throw new Error('Player object (0) not found');
        }

        this.log('Player object symbols:');
        Object.getOwnPropertySymbols(playerObject).forEach(sym => {
            this.log(`  ${sym.toString()}`);
        });

        const nameSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@name)');
        if (!nameSymbol) {
            throw new Error('@name symbol not found in player object');
        }

        this.originalName = playerObject[nameSymbol];
        this.log(`Original character name raw: ${JSON.stringify(this.originalName)}`);
        this.log(`Name type: ${typeof this.originalName}`);
        this.log(`Name constructor: ${this.originalName.constructor.name}`);

        // Check if it's a byte array that represents a string
        if (Array.isArray(this.originalName)) {
            this.log(`Name as byte array: [${this.originalName.join(', ')}]`);

            // Convert byte array to string
            try {
                const nameString = String.fromCharCode(...this.originalName);
                this.log(`Name as string: "${nameString}"`);
                this.originalNameString = nameString;
            } catch (e) {
                this.log(`Failed to convert to string: ${e.message}`);
            }
        } else if (this.originalName instanceof Uint8Array) {
            this.log(`Name as Uint8Array: [${Array.from(this.originalName).join(', ')}]`);

            try {
                const nameString = String.fromCharCode(...Array.from(this.originalName));
                this.log(`Name as string: "${nameString}"`);
                this.originalNameString = nameString;
            } catch (e) {
                this.log(`Failed to convert to string: ${e.message}`);
            }
        } else if (typeof this.originalName === 'string') {
            this.log(`Name is already a string: "${this.originalName}"`);
            this.originalNameString = this.originalName;
        } else {
            this.log(`Name is unknown type: ${typeof this.originalName}`);
        }

        if (!this.originalName) {
            throw new Error('Character name not found');
        }

        this.success('Step 2 PASSED: Character name found and analyzed');
        this.testResults.push({ test: 'Find Character Name', passed: true });
    }

    async testChangeCharacterName() {
        this.log('Step 3: Change character name');

        const playerObject = this.originalObjects.rawObjects[0];
        const nameSymbol = Object.getOwnPropertySymbols(playerObject).find(s => s.toString() === 'Symbol(@name)');

        this.newNameString = 'TestName123';
        this.log(`Changing name to: "${this.newNameString}"`);

        // CRITICAL: We need to maintain the same data format as the original
        // If original was byte array, new should be byte array
        if (Array.isArray(this.originalName)) {
            this.log('Original name was array - converting new name to byte array');
            this.newName = Array.from(this.newNameString).map(char => char.charCodeAt(0));
            this.log(`New name as byte array: [${this.newName.join(', ')}]`);
        } else if (this.originalName instanceof Uint8Array) {
            this.log('Original name was Uint8Array - converting new name to Uint8Array');
            this.newName = new Uint8Array(Array.from(this.newNameString).map(char => char.charCodeAt(0)));
            this.log(`New name as Uint8Array: [${Array.from(this.newName).join(', ')}]`);
        } else {
            this.log('Original name was string - keeping as string');
            this.newName = this.newNameString;
        }

        // CRITICAL: Direct assignment to raw object (like the app does)
        playerObject[nameSymbol] = this.newName;

        this.log('Name change completed');
        this.log(`Verification - new name raw: ${JSON.stringify(playerObject[nameSymbol])}`);

        // Verify the change
        const changedName = playerObject[nameSymbol];
        let verificationPassed = false;

        if (Array.isArray(changedName) && Array.isArray(this.newName)) {
            verificationPassed = JSON.stringify(changedName) === JSON.stringify(this.newName);
        } else if (changedName instanceof Uint8Array && this.newName instanceof Uint8Array) {
            verificationPassed = Array.from(changedName).join(',') === Array.from(this.newName).join(',');
        } else {
            verificationPassed = changedName === this.newName;
        }

        if (!verificationPassed) {
            throw new Error('Name change failed - verification mismatch');
        }

        this.success('Step 3 PASSED: Character name changed');
        this.testResults.push({ test: 'Change Character Name', passed: true });
    }

    async testSaveAndVerify() {
        this.log('Step 4: Save modified file and verify');

        // Reconstruct the file exactly like the app does
        const modifiedData = await this.reconstructFileExactlyLikeApp(this.originalData, this.originalObjects.rawObjects);

        const testFileName = 'tests/test-character-name-change.rxdata';
        fs.writeFileSync(testFileName, modifiedData);
        this.testFiles.push(testFileName);

        this.log(`Modified file saved: ${modifiedData.length} bytes`);
        this.log(`Size difference: ${modifiedData.length - this.originalData.length} bytes`);

        // Try to reload and parse the modified file
        const reloadedData = fs.readFileSync(testFileName);
        this.log(`Reloaded file: ${reloadedData.length} bytes`);

        try {
            this.reloadedObjects = this.parseFileExactlyLikeApp(reloadedData);
            this.log(`Reloaded objects: ${Object.keys(this.reloadedObjects.rawObjects).length}`);
        } catch (error) {
            throw new Error(`Failed to parse reloaded file: ${error.message}`);
        }

        // Verify the name change persisted
        const reloadedPlayerObject = this.reloadedObjects.rawObjects[0];
        if (!reloadedPlayerObject) {
            throw new Error('Reloaded player object not found');
        }

        const reloadedNameSymbol = Object.getOwnPropertySymbols(reloadedPlayerObject).find(s => s.toString() === 'Symbol(@name)');
        if (!reloadedNameSymbol) {
            throw new Error('Reloaded @name symbol not found');
        }

        const reloadedName = reloadedPlayerObject[reloadedNameSymbol];
        this.log(`Reloaded character name raw: ${JSON.stringify(reloadedName)}`);

        // Convert reloaded name to string for comparison
        let reloadedNameString = '';
        if (Array.isArray(reloadedName)) {
            reloadedNameString = String.fromCharCode(...reloadedName);
        } else if (reloadedName instanceof Uint8Array) {
            reloadedNameString = String.fromCharCode(...Array.from(reloadedName));
        } else {
            reloadedNameString = reloadedName;
        }

        this.log(`Reloaded character name as string: "${reloadedNameString}"`);

        if (reloadedNameString !== this.newNameString) {
            throw new Error(`Name change did not persist: expected "${this.newNameString}", got "${reloadedNameString}"`);
        }

        this.success('Step 4 PASSED: File saved and name change verified');
        this.testResults.push({ test: 'Save and Verify', passed: true });
    }

    async reconstructFileExactlyLikeApp(originalData, rawObjects) {
        // Find marshal headers
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
                // Serialize the raw Ruby object
                this.log(`Serializing raw object ${i}...`);

                // DEBUG: Log object details before serialization
                const obj = rawObjects[i];
                this.log(`Object ${i} type: ${typeof obj}`);
                this.log(`Object ${i} constructor: ${obj.constructor.name}`);
                this.log(`Object ${i} symbols: ${Object.getOwnPropertySymbols(obj).length}`);
                this.log(`Object ${i} keys: ${Object.keys(obj).length}`);

                // Check if this is the player object with the name change
                if (i === 0) {
                    const nameSymbol = Object.getOwnPropertySymbols(obj).find(s => s.toString() === 'Symbol(@name)');
                    if (nameSymbol) {
                        this.log(`Object 0 name before serialization: "${obj[nameSymbol]}"`);
                    }
                }

                const serialized = dump(obj);
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

    async testCompareWithOriginal() {
        this.log('Step 5: Compare with original file structure');

        // Compare file structures to identify any corruption
        const originalHeaders = this.findMarshalHeaders(this.originalData);
        const modifiedHeaders = this.findMarshalHeaders(fs.readFileSync('tests/test-character-name-change.rxdata'));

        this.log(`Original file: ${originalHeaders.length} objects`);
        this.log(`Modified file: ${modifiedHeaders.length} objects`);

        if (originalHeaders.length !== modifiedHeaders.length) {
            throw new Error(`Object count mismatch: original ${originalHeaders.length}, modified ${modifiedHeaders.length}`);
        }

        // Compare each object's basic structure
        for (let i = 0; i < originalHeaders.length; i++) {
            const originalObj = this.originalObjects.rawObjects[i];
            const modifiedObj = this.reloadedObjects.rawObjects[i];

            if (!originalObj && !modifiedObj) continue;
            if (!originalObj || !modifiedObj) {
                throw new Error(`Object ${i} existence mismatch`);
            }

            const originalSymbols = Object.getOwnPropertySymbols(originalObj).length;
            const modifiedSymbols = Object.getOwnPropertySymbols(modifiedObj).length;
            const originalKeys = Object.keys(originalObj).length;
            const modifiedKeys = Object.keys(modifiedObj).length;

            this.log(`Object ${i}: symbols ${originalSymbols}→${modifiedSymbols}, keys ${originalKeys}→${modifiedKeys}`);

            if (originalSymbols !== modifiedSymbols) {
                this.log(`WARNING: Object ${i} symbol count changed`);
            }
            if (originalKeys !== modifiedKeys) {
                this.log(`WARNING: Object ${i} key count changed`);
            }
        }

        this.success('Step 5 PASSED: File structure comparison completed');
        this.testResults.push({ test: 'Compare with Original', passed: true });
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

    printResults() {
        console.log('\n=== CHARACTER NAME CHANGE TEST RESULTS ===');

        let passed = 0;
        let total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.test}`);
            if (result.passed) passed++;
        });

        console.log(`\nSUMMARY: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 CHARACTER NAME CHANGE TEST PASSED!');
            console.log('The character name can be changed and the save file remains valid.');
            console.log('However, this does NOT guarantee game compatibility - manual testing required.');
        } else {
            console.log('❌ Character name change test failed.');
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
    const test = new CharacterNameChangeTest();
    test.runTest().catch(error => {
        console.error('Character name change test failed:', error);
        process.exit(1);
    });
}

module.exports = CharacterNameChangeTest;