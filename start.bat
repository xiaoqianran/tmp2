@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM 检查虚拟环境
if not exist ".venv\Scripts\activate.bat" (
    echo [INFO] 首次运行，正在创建虚拟环境...
    uv venv --seed
    if errorlevel 1 (pause & exit /b 1)
)

REM 激活虚拟环境
call ".venv\Scripts\activate.bat"

REM 安装 Python 依赖
if not exist ".venv\Lib\site-packages\nicegui" (
    echo [INFO] 正在安装 Python 依赖...
    uv pip install -r requirements.txt
    if errorlevel 1 (pause & exit /b 1)
)

REM 安装前端依赖
if not exist "node_modules" (
    echo [INFO] 正在安装前端依赖...
    call npm install
    if errorlevel 1 (pause & exit /b 1)
)

echo.
echo ============================================
echo   PDF Layout Inspector
echo   打开浏览器访问: http://127.0.0.1:8767
echo ============================================
echo.

python app.py
pause
