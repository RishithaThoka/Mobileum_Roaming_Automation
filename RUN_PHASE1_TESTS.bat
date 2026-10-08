@echo off
echo.
echo  ================================================================
echo    Phase 1 Verification — Migration + Tests
echo  ================================================================
echo.
echo  This script will:
echo    1. Apply migration 014 (decided_by columns)
echo    2. Seed an Admin override scenario for the screenshot
echo    3. Run all 6 test suites
echo    4. Write full output to phase1_test_results.txt
echo.
echo  Requirements:
echo    - Node.js must be installed
echo    - Backend server must be running (node backend/server.js) on port 4021
echo      for the HTTP-based tests (workflow-policy, ownership-admin, domain-routing)
echo.
cd /d "%~dp0"

echo [1/2] Applying migration 014 and seeding override...
node run_phase1_verification.js > phase1_test_results.txt 2>&1

echo [2/2] Done! Results saved to phase1_test_results.txt
echo.
echo Opening results...
type phase1_test_results.txt
echo.
pause
