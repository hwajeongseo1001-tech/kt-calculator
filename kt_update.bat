@echo off
cd /d "C:\Users\user\Desktop"
cd "법인 정책"
echo ============================================
echo   KT Data Auto Update + GitHub Deploy
echo ============================================
echo.
"C:\Program Files\nodejs\node.exe" kt_auto_update.js
echo.
echo ============================================
echo   Done!
echo ============================================
pause
