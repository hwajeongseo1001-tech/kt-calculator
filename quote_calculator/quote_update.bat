@echo off
cd /d "C:\Users\user\Desktop"
cd "법인 정책"
echo ============================================
echo   납품 정책 견적서 데이터 업데이트
echo ============================================
echo.
"C:\Program Files\nodejs\node.exe" quote_update.js
echo.
echo ============================================
echo   Done!
echo ============================================
pause
