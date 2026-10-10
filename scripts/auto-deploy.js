#!/usr/bin/env node

/**
 * ZAD Smart Auto-Deployer & Firebase Setup Assistant
 * يقوم هذا السكربت بفحص وإصلاح ونشر المشروع إلى Firebase تلقائياً بضغطة زر واحدة.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('\n======================================================');
console.log('🚀 فاحص وناشر نَبض التداول التلقائي إلى Firebase Hosting');
console.log('======================================================\n');

function run(command, desc) {
  try {
    console.log(`⏳ جاري تنفيذ: ${desc}...`);
    const output = execSync(command, { stdio: 'inherit' });
    console.log(`✅ نجح: ${desc}\n`);
    return true;
  } catch (error) {
    console.error(`❌ تنبيه: لم يكتمل ${desc}. الخطأ:`, error.message);
    return false;
  }
}

// 1. التحقق من بناء المشروع وتجهيز مجلد dist
console.log('1️⃣ فحص بناء المشروع (Vite Build)...');
run('npm run build', 'بناء المشروع وتوليد ملفات dist');

if (!fs.existsSync(path.resolve('dist', 'index.html'))) {
  console.error('❌ خطأ: لم يتم العثور على dist/index.html! تأكد من ملفات الكود.');
  process.exit(1);
}

// 2. التحقق من وجود firebase.json
if (!fs.existsSync('firebase.json')) {
  console.log('⚠️ إنشاء ملف firebase.json...');
  fs.writeFileSync('firebase.json', JSON.stringify({
    hosting: {
      public: 'dist',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      rewrites: [{ source: '**', destination: '/index.html' }]
    }
  }, null, 2));
}

// 3. النشر المباشر عبر Firebase CLI
console.log('2️⃣ النشر المباشر إلى Firebase Hosting...');
const deployed = run('npx firebase deploy --only hosting', 'نشر الملفات إلى استضافة Firebase');

if (deployed) {
  console.log('\n🎉🎉 تم النشر بنجاح تام! يمكنك الآن فتح الروابط:\n');
  console.log('👉 https://gen-lang-client-0312361187.web.app');
  console.log('👉 https://gen-lang-client-0312361187.firebaseapp.com\n');
} else {
  console.log('\n💡 إذا ظهر لك أنك بحاجة لتسجيل الدخول:');
  console.log('1. اكتب في موجه الأوامر: npx firebase login');
  console.log('2. ثم أعد تشغيل: npm run deploy:firebase\n');
}
