# PawHaven API — Node.js + Express + SQLite

```
npm install
npm start          # http://127.0.0.1:8000/api   (first run creates + seeds the database)
```
`.env` جاهز. لو عايزة تفضّي الداتابيز وتزرعيها من الأول: `npm run seed:fresh`.

| Env | Default | |
|---|---|---|
| PORT | 8000 | لازم يفضل 8000 عشان الفرونت |
| JWT_SECRET | (متولّد) | غيّريه قبل أي نشر |
| JWT_EXPIRES | 12h | مدة التوكن |
| AI_URL | http://127.0.0.1:8001 | خدمة الـ AI |
| AUTO_SEED | true | يزرع بيانات تجريبية لو الداتابيز فاضية |
| ALLOW_ADMIN_SIGNUP | false | `true` يسمح بالتسجيل كأدمن من `/signup` (مش مفضّل) |

## Endpoints (كلها تحت `/api`، والـ Authorization: `Bearer <token>`)
**Public:** `POST /signup` · `POST /login` · `GET /` · `GET /petspublic?type=&shelter_id=&available=true&search=&page=` · `GET /pets/:id` · `GET /shelters-public` · `GET /shelters/:id` · `GET /products?search=` · `GET /products/:id` · `POST /predict` (image)
(الحيوانات والشيلترز بتظهر للناس بس لما الشيلتر يكون `approved`.)

**User:** `GET /user/home` · `PUT /user/profile` · `POST|DELETE /adopt` · `GET|POST /favorites` · `DELETE /favorites/:petId` · `POST /donations` · `GET|POST /reports` · `GET|DELETE /reports/:id` · `GET|POST /cart` · `PUT|DELETE /cart/:id` · `GET|POST /orders` · `GET|DELETE /orders/:id` · `POST /orders/:id/process-payment` · `GET|POST /boardings` · `GET|DELETE /boardings/:id`

**Shelter owner (role=shelter):** `POST /signup` بـ `role=shelter` + `shelter_name` + `location` بيعمل شيلتر بحالة `pending` لحد ما الأدمن يوافق.
`GET|PUT /shelter/me` (بيانات + إحصائيات) · `/shelter/pets` (CRUD) · `GET /shelter/adoptions` + `PATCH|DELETE /shelter/adoptions/:petId` · `GET /shelter/donations` · `/shelter/employees` (CRUD للموظفين) · `GET /shelter/boardings` + `PATCH /shelter/boardings/:id/{approve|activate|complete|reject}` · `GET /shelter/reports` + `PATCH /shelter/reports/:id`

**Admin (role=admin):** `GET /admin/stats` · `/shelters` (CRUD + `?status=`) · `PATCH /shelters/:id/approve` · `PATCH /shelters/:id/reject` `{note}` · `/pets` · `/users` · `/employees` · `/donations` · `GET /admin/reports` + `PATCH /admin/reports/:id` · `GET /admin/orders` · `GET /admin/boardings` · `POST|PUT|DELETE /products`

**Employee:** `POST /employee/login` · `GET /employee/home` · `/employee/pets` (CRUD) · `PATCH|DELETE /employee/adoptionreview/:userId` · `POST|PUT|DELETE /employee/products` · `GET /employee/boardings` · `PATCH /employee/boardings/:id/{approve|activate|complete|reject}`

الصور: الـ seeded من `/images/<file>` والمرفوعة من `/storage/<path>`.
ملفات Postman القديمة في `docs/`.
