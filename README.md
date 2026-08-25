# Digital Signature Platform - Backend API

Backend repository of the Digital Signature Platform. This Node.js/Express application powers a highly secure, multi-tier document routing engine. It handles cloud-based PDF storage, strict sequential signing hierarchies, cryptographic hashing, physical PDF manipulation, and automated email handoffs.

---

## The User Journey & Backend Implementation

This backend was explicitly designed to support the following real-world signature lifecycle:

### Step 1: The Setup & Hierarchy Configuration
* **Upload:** Initiators upload a PDF. Handled by `POST /api/documents/upload`. The file bypasses the local disk and is streamed directly into **Cloudflare R2** via the AWS SDK.
* **Assign the Hierarchy:** Handled by `POST /api/workflows/create`. The payload accepts an array of signers and enforces sequential `step_order` rules in the PostgreSQL database.
* **Condition A (Me First):** If the Initiator is the first signer, the API instantly returns a unique `redirectToken` so the frontend can bypass the email queue and push the user straight to the signing canvas.
* **Condition B (Third-Party First):** If Alice (Level 1) signs first, the API generates her secure `access_token` and fires an automated email notification via **Nodemailer**.

### Step 2: The First Signature
* Handled by `POST /api/signatures/submit`. The backend verifies the `access_token`. 
* **The Background Magic:** The system pulls the PDF from Cloudflare R2 into memory, uses `pdf-lib` to physically draw the visual signature (Name, Date, Hash) at the assigned X/Y coordinates, and overwrites the file in the cloud bucket.
* A cryptographic SHA-256 hash is generated using the document ID, signer email address, and timestamp.

### Step 3 & Step 4: The Handoff & Final Approval (Levels 2 & 3)
* The database engine automatically queries the `workflow_steps` table for `step_order + 1`. 
* If a next signer (e.g., Bob or Charlie) exists, the status updates to **In Progress** and the system fires the next automated email link. 
* Each subsequent signature generates a new cryptographic hash, sealing the prior state.

### Step 5: Completion & The Audit Trail
* When the final signer (Charlie) completes their step, the main `documents` table status updates to **Completed**.
* Every interaction is permanently logged in the `audit_logs` table, storing the Actor's Email, IP Address, Timestamp, and Cryptographic Hash.

---

## Testing Proofs & API Endpoints

Below is the documented proof of the backend lifecycle, tested end-to-end via Postman.

### 1. User Authentication (JWT)
* **Endpoint:** `POST /api/auth/register` & `POST /api/auth/login`
* **Action:** Registers a new initiator and returns a secure JWT token for API access.
#### Register:
![Register](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20Registration.png)
#### Login:
![Login](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20Login.png)

### 2. Cloudflare R2 Document Upload
* **Endpoint:** `POST /api/documents/upload`
* **Headers:** `Authorization: Bearer <JWT_TOKEN>`
* **Action:** Accepts a `multipart/form-data` PDF, streams it to Cloudflare R2, and returns the newly created Document UUID.
#### Uploading Document:
![Upload](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20Upload%20Document.png)
#### Document in cloudflare R2:
![Uploaded document](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20R2%20Files.png)

### 3. Workflow Creation & Routing Engine
* **Endpoint:** `POST /api/workflows/create`
* **Headers:** `Authorization: Bearer <JWT_TOKEN>`
* **Action:** Inserts sequential steps into the database. Demonstrates the "Me First" bypass by returning a `redirectToken` for the initiator, while holding Level 2 and 3 in `pending` status.
![Workflow](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20Creat%20Workflow.png)

### 4. Signature Submission & Cryptographic Hashing
* **Endpoint:** `POST /api/signatures/submit`
* **Action:** The core engine. Verifies the signer's token, generates the SHA-256 hash, and logs the IP address.
#### Level 2 sign and status is In Process:
![Signature in progress](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20sign%20In%20process.png)
#### Last person sign and status change to complete:
![Signature on compelation](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20Sign%20complete.png)

### 5. Physical PDF Stamping
* **Proof:** The `pdfManager.js` utility successfully pulls the file from R2, applies the visual signature block, and saves it. (Note: We used name and date because we were testing only Backend api in Postman)
#### Original Document: 
![Document before Sign](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20Document%20before%20sign.png)
#### Signed Document:
![Document after Sign](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20Document%20after%20sign.png)

### 6. Automated Email Notification
* **Proof:** The `emailManager.js` successfully dispatches HTML-formatted emails containing the secure `access_token` link for the next signer in the queue.
![email](https://github.com/Clovie8/Multi-level-digital-signature-platform/blob/main/backend/uploads/D%20Email.png)

---

## 🛠 Tech Stack & Architecture

* **Runtime Engine:** Node.js / Express.js
* **Relational Database:** PostgreSQL (`pg` library, heavily utilizing SQL Transactions `BEGIN/COMMIT`)
* **Cloud Storage:** Cloudflare R2 (`@aws-sdk/client-s3`)
* **PDF Manipulation:** `pdf-lib` (Memory buffer manipulation)
* **Security:** `jsonwebtoken` (Auth), `bcrypt` (Passwords), Node `crypto` (SHA-256 Hashing)
* **Communications:** `nodemailer` (SMTP)

---

## Local Setup & Installation

### 1. Environment Variables
Create a `.env` file in the root directory:

```env
PORT=5000

# PostgreSQL
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=digital_signature_db

# Security
JWT_SECRET=your_jwt_secret_key

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name

# SMTP Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### 2. Run the Server
```bash
npx nodemon src/server.js
```
