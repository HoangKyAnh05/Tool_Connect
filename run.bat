@echo off
title Khoi chay Multi-Language TTS Director
cd /d "%~dp0"

if not exist node_modules (
    echo Khong tim thay thu muc node_modules. Dang tu dong tai va cai dat cac thu vien (npm install)...
    call npm install
)

echo Dang khoi chay ung dung...
call npm start

if %errorlevel% neq 0 (
    echo Da co loi xay ra khi chay ung dung.
    pause
)
