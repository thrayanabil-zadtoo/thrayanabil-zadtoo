@echo off
chcp 65001 >nul
echo ======================================================
echo 🚀 المعالج الذكي لنشر المشروع وتحديث Firebase تلقائيا
echo ======================================================
echo.

echo 1. جاري بناء ملفات المشروع (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo [خطأ] فشل في بناء المشروع! تأكد من تشغيل npm install اولا.
    pause
    exit /b %errorlevel%
)

echo.
echo 2. جاري النشر مباشرة الى استضافة Firebase...
call npx firebase deploy --only hosting
if %errorlevel% neq 0 (
    echo.
    echo [تنبيه] اذا طلب منك تسجيل الدخول، قم بكتابة:
    echo npx firebase login
    echo ثم اعد تشغيل هذا الملف مجددا.
    pause
    exit /b %errorlevel%
)

echo.
echo ======================================================
echo 🎉 مبروك! تم النشر والتحديث بنجاح تام!
echo رابط موقعك الاول: https://gen-lang-client-0312361187.web.app
echo رابط موقعك الثاني: https://gen-lang-client-0312361187.firebaseapp.com
echo ======================================================
pause
