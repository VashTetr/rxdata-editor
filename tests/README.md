# RXData Editor Test Suite

This directory contains automated tests for the RXData Editor application.

## Test Structure

- `test-save-functionality.js` - Tests the core save/load functionality with modifications
- `run-tests.js` - Main test runner that executes all test suites
- `README.md` - This file

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
npm run test:save
```

### Run Tests Before Commit
```bash
npm run precommit
```

## Test Coverage

### Save Functionality Tests
1. **Basic Load and Parse** - Verifies that RXData files can be loaded and parsed correctly
2. **Modification and Save** - Tests that modifications can be made and saved to new files
3. **Persistence After Reload** - Ensures modifications persist when files are reloaded
4. **Multiple Modifications** - Tests multiple simultaneous modifications

## Adding New Tests

When adding new functionality to the RXData Editor:

1. Create a new test file in the `tests/` directory
2. Follow the naming convention: `test-[feature-name].js`
3. Export a test class with a `runAllTests()` method
4. Add the test suite to `run-tests.js`
5. Update this README with the new test coverage

## Test Requirements

- Tests must be able to run independently
- Tests should clean up any temporary files they create
- Tests must return proper exit codes (0 for success, 1 for failure)
- Tests should provide clear, descriptive output

## CI/CD Integration

These tests are designed to be run in CI/CD pipelines:

- Exit code 0 indicates all tests passed
- Exit code 1 indicates test failures
- Detailed output is provided for debugging
- No user interaction required

## Test Data

Tests use the existing `Game new.rxdata` and `Game old.rxdata` files in the project root. Ensure these files are present before running tests.