@echo off
title Day du an len GitHub - Multi-Language TTS Director
cd /d "%~dp0"

echo ===================================================
echo   BAT DAU QUY TRINH DAY DU AN LEN GITHUB
echo ===================================================
echo.

echo [1/5] Khoi tao Git repository...
if not exist .git (
    git init
    echo Khoi tao Git repository thanh cong.
) else (
    echo Git repository da ton tai.
)
echo.

echo [2/5] Cau hinh remote repository...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/HoangKyAnh05/Tool_Connect.git
git branch -M main
echo Da lien ket voi repository: https://github.com/HoangKyAnh05/Tool_Connect.git
echo.

echo [3/5] Them cac tep vao Git (da bo qua node_modules, log va file mp3)...
git add .
echo Da chuan bi cac tep de commit.
echo.

echo [4/5] Commit cac thay doi...
git commit -m "Optimize project, paginate timeline, and normalize default voices" >nul 2>&1
if %errorlevel% neq 0 (
    git commit -m "Optimize project, paginate timeline, and normalize default voices"
)
echo Da commit thanh cong.
echo.

echo [5/5] Dang day du an len GitHub...
echo Luu y: Cua so dang nhap GitHub co the hien len de xac thuc quyen cua ban.
git push -u origin main --force

if %errorlevel% equ 0 (
    echo.
    echo ===================================================
    echo   DA DAY DU AN LEN GITHUB THANH CONG!
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo   CO LOI XAY RA KHI DAY LEN GITHUB.
    echo   Hay chac chan rang:
    echo   1. Tai khoan GitHub cua ban co quyen ghi vao repository nay.
    echo   2. Ban da xac thuc/nhap dung Personal Access Token hoac dang nhap.
    echo ===================================================
)

pause
