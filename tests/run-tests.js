#!/usr/bin/env node

/**
 * Test Runner for RXData Editor
 * Runs all test suites and reports results
 */

const SaveFunctionalityTests = require('./test-save-functionality');
const BoxCopyTests = require('./test-box-copy');
const RealAppBehaviorTest = require('./test-real-app-behavior');

async function runAllTests() {
    console.log('🧪 RXData Editor Test Suite Runner\n');

    const testSuites = [
        { name: 'Save Functionality', class: SaveFunctionalityTests },
        { name: 'Box Copy Functionality', class: BoxCopyTests },
        { name: 'Real App Behavior', class: RealAppBehaviorTest, method: 'runTest' }
    ];

    let totalPassed = 0;
    let totalTests = 0;

    for (const suite of testSuites) {
        console.log(`\n📋 Running ${suite.name} Tests...`);
        console.log('='.repeat(50));

        try {
            const testInstance = new suite.class();

            // Use the appropriate method for each test suite
            if (suite.method === 'runTest') {
                await testInstance.runTest();
            } else {
                await testInstance.runAllTests();
            }

            // Count results (this is a simple approach, could be improved)
            totalTests += testInstance.testResults.length;
            totalPassed += testInstance.testResults.filter(r => r.passed).length;

        } catch (error) {
            console.error(`❌ ${suite.name} test suite failed:`, error.message);
            process.exit(1);
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🏁 FINAL RESULTS');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalTests - totalPassed}`);

    if (totalPassed === totalTests) {
        console.log('\n🎉 ALL TESTS PASSED! The application is ready for deployment.');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed. Please fix the issues before committing.');
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests };