SHELTRI 🐾 — Full Project (Node.js)

```
SHELTRI/
├── backend/      Node.js + Express + SQLite (JWT)  → http://127.0.0.1:8000/api
├── ai-service/   FastAPI + Gemini + ViT breed      → http://127.0.0.1:8001
└── frontend/     index.html + script.js + style.css
```

شغّلي الـ 3 مع بعض، كل واحد في Terminal لوحده.

## 1) Backend (محتاج Node.js 18 أو أحدث)
```
cd backend
npm install
npm start
```
الداتابيز SQLite بتتعمل وبتتزرع لوحدها أول مرة، وملف `.env` جاهز.
لو `npm install` وقع على `better-sqlite3`: نزّلي Node LTS (20 أو 22) وجرّبي تاني.

**لو كنتي مشغّلة النسخة اللي فاتت:** الأعمدة الجديدة بتتضاف لوحدها على الداتابيز القديمة، بس حسابات الشيلتر التجريبية مش هتظهر. عشان تظهر امسحي `backend/database/pawhaven.sqlite*` أو شغّلي `npm run seed:fresh` (بيمسح كل البيانات القديمة).

## 2) AI service (Python 3.10+)
```
cd ai-service
python -m venv venv
venv\Scripts\activate           (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --port 8001
```
أول تشغيل هينزّل موديل السلالات من HuggingFace (محتاج نت). البورت لازم يفضل **8001**.

## 3) Frontend
افتحي `frontend/index.html` بدوبل كليك، أو:
```
cd frontend
python -m http.server 5500      ← http://localhost:5500
```
لو الباك على بورت تاني غيّري أول سطر `API` في `frontend/script.js`.

## الحسابات التجريبية (الباسورد `password` للكل)
| الدور | الإيميل | بيعمل إيه |
|---|---|---|
| Admin | admin@petsapp.com | داشبورد الأدمن (زرار ⚙️ Admin) |
| Shelter (معتمد) | shelter@petsapp.com | داشبورد الشيلتر (زرار 🏡 My Shelter) |
| Shelter (منتظر موافقة) | hope@petsapp.com | بيشوف إن الشيلتر pending |
| User | user@petsapp.com | تبنّي، تبرع، شوب، boarding، تقارير |
| Employee | employee@petsapp.com | عن طريق الـ API (`/employee/login`) |

## الأدوار
- **User:** تبنّي (بيستنى موافقة الشيلتر وممكن يلغيه)، مفضلة ❤️، بحث، تبرع، شوب وسلة وأوردرات، boarding، تقارير بالـ AI، تعديل البروفايل والباسورد.
- **Shelter:** من Sign up اختاري **🏡 Shelter** واكتبي اسم ومكان الشيلتر. الحساب بيستنى موافقة الأدمن، وبعدها بتضيفي حيوانات، وتقبلي/ترفضي طلبات التبنّي، وتشوفي التبرعات، وتتحكمي في الموظفين، وتتابعي الـ boarding والتقارير.
- **Admin:** إحصائيات ومتابعة كل حاجة، قبول أو رفض الشيلترز (مع سبب)، وإدارة الحيوانات والمستخدمين والتبرعات والتقارير والأوردرات والمنتجات.
- الأدمن الجديد بيتعمل من داشبورد الأدمن (Users ثم Add user / admin). التسجيل كأدمن من `/signup` مقفول افتراضيًا.

## تنبيه
ملف `ai-service/.env` فيه مفتاح Gemini، ومترفعيش المشروع على GitHub كده.
