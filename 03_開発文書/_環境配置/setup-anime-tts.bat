@echo off
REM ============================================================================
REM anime-tts (Damarcreative) Setup Script for Windows
REM
REM This script clones the anime-tts repository and sets up the Python
REM environment required by the Claudian Bridge "Add to TTS" feature.
REM
REM Prerequisites:
REM   - git            (https://git-scm.com/download/win)
REM   - Python 3.10    via the 'py' launcher (https://www.python.org/downloads/windows/)
REM                    NOTE: torch 1.13.1 / librosa 0.9.1 are pinned in
REM                    requirements.txt and may not build on Python 3.11+.
REM
REM Optional:
REM   - Visual Studio Build Tools (required to compile monotonic_align)
REM                    (https://visualstudio.microsoft.com/downloads/)
REM
REM Usage:
REM   setup-anime-tts.bat                          -> uses %USERPROFILE%\anime-tts
REM   setup-anime-tts.bat D:\tools\anime-tts       -> uses D:\tools\anime-tts
REM   setup-anime-tts.bat --force-py=3.11 D:\foo   -> override Python version (advanced)
REM   setup-anime-tts.bat --force-py=any ...       -> use the highest installed version
REM
REM Idempotent: re-running on an existing clone skips already-completed phases.
REM ============================================================================

setlocal EnableExtensions EnableDelayedExpansion

REM ---- Configuration ----
set "PYTHON_VERSION=3.10"
set "REPO_URL=https://github.com/Damarcreative/anime-tts.git"
set "HF_BASE_URL=https://huggingface.co/tensor-diffusion/anime-tts/resolve/main/anime-tts-model/"
set "DEFAULT_MODEL=ameth.pth"
set "VENV_DIR=.venv"

REM ---- Argument parsing ----
set "TARGET_DIR="
set "FORCE_PY="

:parse_args
if "%~1"=="" goto :args_done

if /i "%~1"=="--force-py=any" (
    set "FORCE_PY=any"
    shift
    goto :parse_args
)
if /i "%~1"=="--force-any" (
    set "FORCE_PY=any"
    shift
    goto :parse_args
)
if /i "%~1"=="--force" (
    set "FORCE_PY=any"
    shift
    goto :parse_args
)
set "ARG1=%~1"
if /i "!ARG1:~0,11!"=="--force-py=" (
    set "FORCE_PY=!ARG1:~11!"
    shift
    goto :parse_args
)
if /i "%~1"=="--force-py" (
    if not "%~2"=="" (
        set "FORCE_PY=%~2"
        shift
        shift
        goto :parse_args
    ) else (
        echo   [ERROR] --force-py requires an argument, e.g. --force-py 3.11
        echo.
        set "EXIT_CODE=99"
        goto :end
    )
)
if /i "%~1"=="/?" (
    echo Usage: setup-anime-tts.bat [target_dir] [options]
    echo Options:
    echo   --force-py=VERSION    Override required Python version, e.g. --force-py=3.11
    echo   --force-py=any        Use the highest installed Python version
    echo   --force               Alias for --force-py=any
    echo.
    set "EXIT_CODE=0"
    goto :end
)

if "!TARGET_DIR!"=="" (
    set "TARGET_DIR=%~1"
    shift
    goto :parse_args
)

echo   [ERROR] Unknown argument: %~1
echo.
set "EXIT_CODE=99"
goto :end

:args_done
if "!TARGET_DIR!"=="" set "TARGET_DIR=%USERPROFILE%\anime-tts"

REM ---- Header ----
echo.
echo ============================================================
echo  anime-tts (Damarcreative) Setup
echo  Target directory : !TARGET_DIR!
echo  Python           : %PYTHON_VERSION% (via py launcher)
echo  Default model    : %DEFAULT_MODEL%
if not "!FORCE_PY!"=="" echo  Force override   : !FORCE_PY!
echo ============================================================
echo.

REM ---- Phase 1: Prerequisite check ----
echo [Phase 1/6] Checking prerequisites...

where git >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] git is not in PATH. Install from https://git-scm.com/download/win
    echo.
    set "EXIT_CODE=1"
    goto :end
)
for /f "delims=" %%g in ('git --version') do set "GIT_VERSION=%%g"
echo   [OK] %GIT_VERSION%

REM ---- Phase 1b: Detect available Python versions ----
REM Show raw 'py -0' output, then probe common versions to build a
REM reliable usable list (parsing py -0 text is format-fragile).
set "PY_AVAILABLE="
set "PY_SELECTED="

where py >nul 2>&1
if errorlevel 1 (
    echo   [WARN] 'py' launcher not found in PATH.
    echo          Install Python from https://www.python.org/downloads/windows/
    echo          and tick "Install launcher for all users".
) else (
    echo   [INFO] Available Python versions via 'py' launcher:
    py -0 2>nul
    echo.
    for %%v in (3.14 3.13 3.12 3.11 3.10 3.9 3.8) do (
        py -%%v --version >nul 2>&1
        if not errorlevel 1 (
            set "PY_AVAILABLE=!PY_AVAILABLE! %%v"
            echo     - Python %%v
        )
    )
)

REM ---- Resolve which Python to use ----
REM Case A: --force-py=any (use the LAST/highest installed)
if /i "!FORCE_PY!"=="any" (
    if "!PY_AVAILABLE!"=="" (
        echo   [ERROR] --force-py=any requested but 'py' launcher found no Python versions.
        echo.
        set "EXIT_CODE=2"
        goto :end
    )
    REM Pick the highest probed version from the probe list
    for %%p in (!PY_AVAILABLE!) do (
        if "!PY_SELECTED!"=="" set "PY_SELECTED=%%p"
    )
    echo   [WARN] --force-py=any selected Python !PY_SELECTED! instead of recommended %PYTHON_VERSION%.
    echo          Phase 4 will relax the torch pin automatically for compatibility.
    goto :py_resolved
)

REM Case B: --force-py=X.Y (use that specific version)
if not "!FORCE_PY!"=="" (
    set "FORCE_PY_FOUND="
    for %%p in (!PY_AVAILABLE!) do (
        if /i "%%p"=="!FORCE_PY!" set "FORCE_PY_FOUND=yes"
    )
    if "!FORCE_PY_FOUND!"=="yes" (
        set "PY_SELECTED=!FORCE_PY!"
        echo   [WARN] --force-py=!FORCE_PY! selected instead of recommended %PYTHON_VERSION%.
        echo          Phase 4 will relax the torch pin automatically for compatibility.
        goto :py_resolved
    ) else (
        echo   [ERROR] --force-py=!FORCE_PY! requested but not in available versions:
        for %%p in (!PY_AVAILABLE!) do echo     - %%p
        echo.
        set "EXIT_CODE=2"
        goto :end
    )
)

REM Case C: default (strict 3.10)
set "PY310_FOUND="
for %%p in (!PY_AVAILABLE!) do (
    if /i "%%p"=="%PYTHON_VERSION%" set "PY310_FOUND=yes"
)
if "!PY310_FOUND!"=="yes" (
    set "PY_SELECTED=%PYTHON_VERSION%"
    echo   [OK] Python %PYTHON_VERSION% available
    goto :py_resolved
)

REM 3.10 not found and no --force flag: prompt user
echo.
echo   [ERROR] Python %PYTHON_VERSION% is not installed via the 'py' launcher.
echo.
echo   Available versions on this system:
for %%p in (!PY_AVAILABLE!) do echo     - Python %%p
if "!PY_AVAILABLE!"=="" echo     - (none found via py launcher)
echo.
echo   Recommended action:
echo     A. Install Python %PYTHON_VERSION% from https://www.python.org/downloads/windows/
echo        (tick "Add Python to PATH" or install via Microsoft Store)
echo.
echo   Advanced options (skip 3.10, use what's installed; pip install may FAIL):
echo     B. Use --force-py=X.Y   with one of the versions listed above
echo     C. Use --force-py=any   to auto-pick the highest installed
echo.
echo   Re-run example:
echo     setup-anime-tts.bat --force-py=any !TARGET_DIR!
echo.
set "EXIT_CODE=2"
goto :end

:py_resolved
REM Verify the selected Python actually responds
py -!PY_SELECTED! --version >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Python !PY_SELECTED! selected but does not respond to 'py -!PY_SELECTED!'.
    echo.
    set "EXIT_CODE=2"
    goto :end
)
for /f "tokens=2" %%v in ('py -!PY_SELECTED! --version') do set "PY_VERSION=%%v"
echo   [OK] Python !PY_VERSION! selected

REM Detect MSVC: 'cl' in PATH, or Visual Studio Build Tools via vswhere.
set "MSVC_FOUND="
where cl >nul 2>&1
if not errorlevel 1 set "MSVC_FOUND=yes"
set "VSWHERE="
if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if "!VSWHERE!"=="" if exist "%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"
if not "!VSWHERE!"=="" (
    "!VSWHERE!" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 >nul 2>&1
    if not errorlevel 1 set "MSVC_FOUND=yes"
)
if "!MSVC_FOUND!"=="yes" (
    echo   [OK] MSVC compiler detected
) else (
    echo   [WARN] MSVC not found. Phase 6 monotonic_align may fail.
    echo          Install Visual Studio Build Tools if you hit this.
)

echo.

REM ---- Phase 2: Clone repository ----
echo [Phase 2/6] Cloning %REPO_URL% ...
if exist "%TARGET_DIR%\main.py" (
    echo   [SKIP] %TARGET_DIR% already contains main.py
) else (
    if exist "%TARGET_DIR%" (
        echo   [ERROR] %TARGET_DIR% exists but does not look like anime-tts.
        echo           Remove the directory or choose a different target.
        echo.
        set "EXIT_CODE=3"
        goto :end
    )
    git clone "%REPO_URL%" "%TARGET_DIR%"
    if errorlevel 1 (
        echo   [ERROR] git clone failed.
        echo.
        set "EXIT_CODE=3"
        goto :end
    )
)
pushd "%TARGET_DIR%"
echo.

REM ---- Phase 3: Create virtual environment ----
echo [Phase 3/6] Creating Python !PY_SELECTED! virtual environment at %VENV_DIR%\ ...
if exist "%VENV_DIR%\Scripts\python.exe" (
    echo   [SKIP] %VENV_DIR% already exists
) else (
    py -!PY_SELECTED! -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo   [ERROR] Failed to create virtual environment.
        echo.
        set "EXIT_CODE=4"
        popd
        goto :end
    )
    echo   [OK] Created %VENV_DIR%
)
echo.

REM ---- Phase 4: Install requirements ----
echo [Phase 4/6] Installing dependencies (PyTorch 1.13.1 + libs, 2-3 GB, may take 10+ minutes) ...
"%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo   [ERROR] pip self-upgrade failed.
    echo.
    set "EXIT_CODE=5"
    popd
    goto :end
)
set "REQ_FILE=requirements.txt"
if not "!PY_SELECTED!"=="3.10" (
    echo   [INFO] Python !PY_SELECTED! is not 3.10. Relaxing torch pin for compatibility...
    findstr /v /c:"torch==1.13.1" requirements.txt > requirements.relaxed.txt
    echo.>> requirements.relaxed.txt
    echo torch>> requirements.relaxed.txt
    set "REQ_FILE=requirements.relaxed.txt"
)
"%VENV_DIR%\Scripts\python.exe" -m pip install -r "!REQ_FILE!"
if errorlevel 1 (
    echo   [ERROR] pip install failed. Check internet connection / Python version compatibility.
    echo           torch may not have wheels for Python !PY_SELECTED!. Full error is above.
    echo.
    set "EXIT_CODE=5"
    popd
    goto :end
)
echo   [OK] Dependencies installed
echo.

REM ---- Phase 5: Download default model ----
echo [Phase 5/6] Downloading default model '%DEFAULT_MODEL%' from Hugging Face ...
if not exist "model" mkdir model
if exist "model\%DEFAULT_MODEL%" (
    echo   [SKIP] model\%DEFAULT_MODEL% already exists
    goto :phase5_done
)
"%VENV_DIR%\Scripts\python.exe" -c "import urllib.request, sys; urllib.request.urlretrieve('%HF_BASE_URL%%DEFAULT_MODEL%', 'model/%DEFAULT_MODEL%')"
if errorlevel 1 (
    echo   [ERROR] Model download failed.
    echo.
    set "EXIT_CODE=6"
    popd
    goto :end
)
echo   [OK] model\%DEFAULT_MODEL% downloaded
:phase5_done
echo.
echo   To download ALL 38 models later, run:
echo       %VENV_DIR%\Scripts\python.exe download-model.py
echo.

REM ---- Phase 6: Build monotonic_align ----
REM The Damarcreative fork uses a numba-JIT implementation
REM (monotonic_align/core.py) and ships no setup.py, so no Cython build is
REM required. Only repos with the original VITS layout
REM (monotonic_align/setup.py present) need a build.
echo [Phase 6/6] Setting up monotonic_align ...
if exist "monotonic_align\setup.py" (
    if exist "monotonic_align\monotonic_align\monotonic_align.cp310-win_amd64.pyd" (
        echo   [SKIP] monotonic_align already compiled for Python 3.10
    ) else (
        REM Generic check: any compiled pyd in the right place
        dir /b "monotonic_align\monotonic_align\*.pyd" >nul 2>&1
        if not errorlevel 1 (
            echo   [SKIP] monotonic_align already compiled
        ) else (
            pushd monotonic_align
            "%VENV_DIR%\Scripts\python.exe" setup.py build_ext --inplace
            if errorlevel 1 (
                echo   [ERROR] monotonic_align build failed.
                echo           This typically means MSVC is missing. Install Visual Studio Build Tools:
                echo           https://visualstudio.microsoft.com/downloads/
                echo.
                popd
                set "EXIT_CODE=7"
                popd
                goto :end
            )
            popd
            echo   [OK] monotonic_align built
        )
    )
) else (
    echo   [SKIP] monotonic_align uses numba JIT. No Cython build required.
)
echo.

popd

REM ---- Summary ----
echo ============================================================
echo  Setup complete!
echo.
echo  Repository : !TARGET_DIR!
echo  Virtualenv : !TARGET_DIR!\%VENV_DIR%
echo  Python     : !PY_VERSION!
echo  Model      : !TARGET_DIR!\model\%DEFAULT_MODEL%
echo.
echo  -----------------------------------------------------------
echo  Next steps:
echo  1. Restart Obsidian (if it was running).
echo  2. Settings -^> Community Plugins -^> Claudian Bridge -^> Text to Speech.
echo  3. Engine: select "anime-tts (Damarcreative)".
echo  4. animeTtsDir: paste this path:
echo.
echo       !TARGET_DIR!
echo.
echo  -----------------------------------------------------------
echo  Useful commands (run from !TARGET_DIR!):
echo.
echo  Activate venv       : %VENV_DIR%\Scripts\activate.bat
echo  Download more models: %VENV_DIR%\Scripts\python.exe download-model.py
echo  Deactivate venv     : deactivate
echo ============================================================
echo.

:end
endlocal & exit /b %EXIT_CODE%