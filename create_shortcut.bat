@echo off
title Multi-Language TTS Director - Create Desktop Shortcut
color 0B

echo ===================================================
echo             CREATE DESKTOP SHORTCUT
echo ===================================================
echo.
echo Script nay se tao Shortcut cho Multi-Language TTS Director tren Desktop cua ban.
echo Ung dung se khoi chay truc tiep ma KHONG hien thi cua so terminal nao.
echo.

:: Kiem tra va tu dong cai dat dependencies neu chua co
if not exist "node_modules\electron\dist\electron.exe" (
    echo [WARNING] Khong tim thay Electron.
    echo Dang chay npm install de tai va thiet lap Electron truoc...
    call npm install
)

echo.
echo Dang tao shortcut ngoai Desktop...

powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Multi-Language TTS Director.lnk'); $Shortcut.TargetPath = 'd:\code_tino_19_4\Code_Tool_Python\Tool_Connect\node_modules\electron\dist\electron.exe'; $Shortcut.Arguments = '.'; $Shortcut.WorkingDirectory = 'd:\code_tino_19_4\Code_Tool_Python\Tool_Connect'; $Shortcut.Description = 'Khoi chay Multi-Language TTS Director'; $Shortcut.Save()"

echo.
echo [SUCCESS] Shortcut 'Multi-Language TTS Director' da duoc tao thanh cong tren Desktop!
echo Bay gio ban co the dong cua so nay va click dup vao shortcut ngoai desktop de chay ung dung.
echo.
pause
