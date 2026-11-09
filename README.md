# Port Container Clearance Tracker

**An Event-Driven Container Clearance Management System for Somali Ports**

![Project Status](https://img.shields.io/badge/Status-In%20Development-orange)
![Stack](https://img.shields.io/badge/Stack-MERN-blue)
![Challenge](https://img.shields.io/badge/Challenge-SimadiLab%2010X-purple)

---

## 1. Project Overview

### About the Project

The **Port Container Clearance Tracker** is a web-based container clearance management system designed to digitize and simplify the import container clearance process at Somali ports.

The system provides a centralized platform where importers, clearing agents, customs officers, and administrators can manage, monitor, and track containers throughout the entire clearance process.

It replaces fragmented manual processes with a structured, transparent, and event-driven digital workflow.

The system tracks every container from its arrival at the port until its final collection.

### The Problem

Importers and clearing agents operating at Somali ports often face difficulties knowing the exact clearance status of their containers.

Traditional clearance processes involve manually exchanging documents, communicating between different parties, and following up with customs offices to determine progress.

These challenges create several problems:

- Importers cannot easily see the current status of their containers.
- Documents are exchanged manually, making tracking and verification difficult.
- Customs duties may be calculated inconsistently.
- Containers experience unnecessary clearance delays.
- Demurrage costs increase when containers remain at ports for extended periods.
- There is limited transparency regarding the actions performed during clearance.
- Different stakeholders lack a centralized platform for communication and coordination.

### The Solution

The Port Container Clearance Tracker provides a centralized digital solution that connects all stakeholders involved in container clearance.

It allows users to:

- Register and manage import containers.
- Upload and review required clearance documents.
- Track container clearance progress in real time.
- Calculate customs duties using configurable HS chapter rates.
- Simulate mobile money duty payments.
- Schedule and record container inspections.
- Generate digital release orders.
- Verify container collection using secure gate codes.
- Receive notifications when important events occur.
- Monitor shipping-line integrations through webhooks.
- Calculate and monitor estimated demurrage costs.
- Access public container tracking without creating an account.

The system is designed specifically around the operational needs of Somali ports.

---

## 2. Project Objectives

The main objectives are:

1. Digitize the container clearance process.
2. Improve transparency between importers, clearing agents, and customs officers.
3. Reduce unnecessary clearance delays.
4. Provide reliable document management and verification.
5. Standardize customs duty calculations.
6. Maintain a complete and traceable history of container activities.
7. Reduce avoidable demurrage costs.
8. Provide administrators with centralized operational control.
9. Introduce event-driven notifications and shipping-line integrations.
10. Support both Somali and English languages.

---

## 3. Target Users and Roles

The system has four primary user roles.

### 3.1 Administrator (ADMIN)

The administrator manages the overall platform.

Responsibilities:

- Manage system users.
- Activate and deactivate accounts.
- Manage ports.
- Manage shipping lines.
- Configure customs duty rates.
- Configure port fees.
- Configure demurrage rates.
- Manage shipping-line webhook endpoints.
- Monitor webhook delivery attempts.
- View system reports and analytics.
- Monitor container clearance activities.
- Review audit records.
- Revoke previously issued release orders when necessary.

### 3.2 Importer (IMPORTER)

Importers are responsible for bringing goods into Somalia.

Responsibilities:

- Register import containers.
- Manage bills of lading.
- Upload required documents.
- View document review results.
- Replace rejected documents.
- Track container clearance progress.
- View customs duty assessments.
- Simulate duty payments.
- View inspection schedules and results.
- Download release orders.
- Receive notifications.
- Monitor estimated demurrage costs.

### 3.3 Clearing Agent (CLEARING_AGENT)

Clearing agents manage clearance activities on behalf of importers.

Responsibilities:

- Register containers on behalf of importers.
- Manage container documentation.
- Monitor clearance progress.
- Upload and replace documents.
- Make simulated duty payments.
- View inspection information.
- Download release orders.
- Collect released containers using the assigned gate code.
- Receive container notifications.

### 3.4 Customs Officer (CUSTOMS_OFFICER)

Customs officers are responsible for reviewing, assessing, inspecting, and releasing containers.

Responsibilities:

- Review submitted documents.
- Approve or reject documents.
- Provide rejection reasons.
- Calculate and assess customs duties.
- Confirm duty assessments.
- Schedule inspections.
- Record inspection results.
- Place containers on hold when necessary.
- Release eligible containers.
- Generate release orders.

---

## 4. Supported Somali Ports

The system supports four major Somali ports:

| Port | Location |
|---|---|
| Mogadishu Port | Mogadishu, Somalia |
| Berbera Port | Berbera, Somalia |
| Bosaso Port | Bosaso, Somalia |
| Kismayo Port | Kismayo, Somalia |

Administrators manage the available port records.

---

## 5. Container Clearance Workflow

The core of the system is an event-driven clearance workflow.

Every container follows eight predefined stages.

### The Eight Clearance Stages

| No. | Stage | Responsible Party |
|---|---|---|
| 1 | Arrived | System / Importer / Agent |
| 2 | Documents Submitted | Importer / Agent |
| 3 | Customs Review | Customs Officer |
| 4 | Duty Assessed | Customs Officer |
| 5 | Duty Paid | System after successful payment |
| 6 | Inspection | Customs Officer |
| 7 | Released | Customs Officer |
| 8 | Collected | Clearing Agent |

### Workflow Explanation

**Stage 1: Arrived**

A container is registered with its shipping information, bill of lading, container number, port, cargo description, HS code, CIF value, and arrival date.

The system creates the initial clearance event.

**Stage 2: Documents Submitted**

The importer or clearing agent uploads the four required documents:

- Commercial Invoice
- Packing List
- Bill of Lading
- Certificate of Origin

All required document types must have at least one uploaded version.

**Stage 3: Customs Review**

A customs officer reviews the submitted documents.

Each document can be approved or rejected.

Rejected documents require a written explanation. The importer or agent can upload a replacement version.

**Stage 4: Duty Assessed**

After all four documents are approved, the customs officer calculates the customs duty.

The assessment includes the applicable HS chapter duty percentage and fixed port fees.

**Stage 5: Duty Paid**

The importer or clearing agent completes the simulated payment.

Supported payment providers:

- EVC Plus
- Zaad
- eDahab

Successful payments generate a receipt number and automatically advance the container.

**Stage 6: Inspection**

A customs officer schedules an inspection and assigns an inspector.

The officer records the inspection result:

- Pass
- Fail

A failed inspection places the container on hold with a recorded reason.

**Stage 7: Released**

After successful payment and a passed inspection, the customs officer releases the container.

The system generates a PDF release order containing a QR code and a secure six-digit gate code.

**Stage 8: Collected**

The clearing agent uses the assigned gate code to confirm collection.

The container's clearance workflow is completed.

### Stage Transition Rules

The backend enforces the order of the eight stages.

Users cannot skip stages or perform transitions outside their assigned permissions.

The only permitted backward transition is:

`CUSTOMS_REVIEW → DOCUMENTS_SUBMITTED`

This transition requires a written reason from Customs.

Every successful stage change creates a permanent clearance event.

---

## 6. Main System Features

### 6.1 Container Registration

Users can register containers with:

- Bill of Lading number
- Container number
- Container size
- Shipping line
- Port
- Cargo description
- HS code
- CIF value in USD
- Arrival date

Container numbers are validated according to ISO 6346, including the check digit.

The system prevents the same container number from being registered as active more than once.

One bill of lading can contain multiple containers.

### 6.2 Document Management and Versioning

The system supports four required document types:

1. Commercial Invoice
2. Packing List
3. Bill of Lading
4. Certificate of Origin

Accepted file formats:

- PDF
- JPG
- PNG

Maximum file size: 5 MB.

Every replacement upload creates a new version.

For example:

- Version 1
- Version 2
- Version 3

Older versions remain available for historical viewing and downloading.

Each version records the uploader and upload time.

### 6.3 Document Review

Customs officers can approve or reject the newest version of each document.

A rejection requires a reason containing at least 10 characters.

The system notifies the importer and clearing agent when a document is rejected.

A container cannot proceed to duty assessment until all four required documents are approved.

### 6.4 Customs Duty Calculator

Customs duty is calculated using the following formula:

**Duty = CIF Value × Duty Percentage + Port Fees**

The duty percentage is determined by the first two digits of the container's HS code.

Administrators manage the HS chapter duty rates and fixed port fees.

Every assessment saves the rate and fee values used at the time of calculation so historical assessments remain unchanged when administrators update rates.

If a required HS chapter rate does not exist, the assessment is blocked.

### 6.5 Simulated Mobile Money Payment

The system provides a mock mobile money payment interface.

Supported providers:

- EVC Plus
- Zaad
- eDahab

The user selects a provider, enters a phone number, reviews the amount, and confirms payment.

A successful payment generates a receipt using this format:

`RCPT-YYYYMMDD-0001`

A phone number ending in `0000` produces a simulated failed payment for testing.

The system records payment attempts and prevents a container from being paid more than once.

No real financial transactions occur.

### 6.6 Inspection Scheduling

Customs officers schedule inspections by selecting:

- Inspection date
- Inspection time
- Assigned inspector

After the inspection, the officer records:

- Inspection result
- Notes
- Optional photographs

A passed inspection allows the container to proceed toward release.

A failed inspection places the container on hold.

Held containers remain subject to demurrage calculations.

### 6.7 Release Orders

After successful payment and a passed inspection, Customs can generate a release order.

The generated PDF contains:

- Container number
- Bill of Lading
- Importer information
- Duty receipt number
- Release date
- Customs officer name
- QR code linking to public tracking
- Six-digit gate code

Gate codes are generated securely, stored as salted scrypt hashes, and verified using constant-time comparison.

The plaintext code is included in the authorized release document but excluded from ordinary API responses.

Revoked release orders remain revoked. A replacement requires verification and a new release order, preserving the historical record.

### 6.8 Public Container Tracking

Anyone can track a container without logging in.

The user enters a container number to view:

- Current clearance stage
- Completed clearance stages
- Date of each completed stage

Sensitive information is never exposed publicly.

The public tracking page does not display:

- CIF values
- Customs duty amounts
- Uploaded documents
- Importer names
- Personal information

Public tracking requests are rate-limited to 10 lookups per minute per IP address.

### 6.9 Notifications

The notification system informs importers and clearing agents about important container activities.

Notifications include:

- Container stage changes
- Document approvals
- Document rejections and reasons
- Duty assessments
- Successful or failed payment attempts
- Inspection scheduling
- Inspection results
- Container holds
- Release orders
- Release revocations
- Container collection

The system supports in-app notifications and simulated SMS messages.

SMS messages are stored in an internal outbox in both Somali and English.

Notifications can be marked as read when opened.

Users without phone numbers still receive in-app notifications.

### 6.10 Webhook Simulator

The webhook system allows administrators to configure an endpoint for each shipping line.

When a container changes stage, the system sends an event containing:

- Event ID
- Container number
- Previous stage
- New stage
- Event timestamp

Every delivery attempt is recorded.

Failed deliveries are retried after:

1. 1 minute
2. 2 minutes
3. 4 minutes

After the retry limit, the delivery is marked as failed.

Administrators can manually resend failed deliveries.

A separate local Express mock receiver is included for demonstrating webhook integrations.

### 6.11 Demurrage Monitoring

The system identifies containers that have not been collected within seven days of arrival.

Estimated demurrage is calculated using:

**Demurrage = Days Beyond 7 × Daily Container Rate**

Example administrative rates:

| Container Size | Example Daily Rate |
|---|---:|
| 20 ft | $50 |
| 40 ft | $100 |

Containers are flagged when they exceed the seven-day allowance.

The dashboard displays flagged containers sorted by estimated demurrage cost.

Demurrage counting stops after collection.

### 6.12 Analytics and Dashboard

The dashboard provides operational information based on actual database records.

Planned analytics include:

- Total registered containers
- Containers by clearance stage
- Containers by port
- Clearance activity over time
- Containers awaiting document review
- Containers awaiting inspection
- Released and collected containers
- Demurrage alerts and estimated costs
- Duty collection statistics

Charts must use real database queries rather than hard-coded sample numbers.

---

## 7. Technical Architecture

The application uses a separated frontend and backend architecture.

### Frontend

The React application provides the user interface and communicates with the backend through HTTP API requests.

### Backend

The Express.js application handles:

- Authentication
- Authorization
- Input validation
- Business rules
- Clearance workflow
- Document management
- Payment simulation
- Notifications
- Webhooks
- Database operations

### Architecture Flow

```text
             FRONTEND
                |
                |
          React Application
                |
                | HTTP / REST API
                |
             BACKEND
                |
          Express Server
                |
       ---------------------
       |         |         |
   Middleware  Routes   Services
       |         |         |
       ---------------------
                |
             Models
                |
             MongoDB
```

Business logic should remain separate from database access. Routes handle HTTP requests, services handle business operations, and models handle database structures and persistence.

### Event-Driven Architecture

```text
       Container Stage Change
                 |
                 v
          Validate Transition
                 |
                 v
          Save Clearance Event
                 |
                 v
         Event Processing
                 |
       ---------------------
       |         |         |
       v         v         v
 Notifications Webhooks  Audit Log
       |
       v
   SMS Outbox
```

The clearance event log is the historical source for reconstructing a container's stage history.

---

## 8. Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend user interface |
| JavaScript | Application programming language |
| Node.js | Backend runtime |
| Express.js | Backend API framework |
| MongoDB | Database |
| Mongoose | Database modeling and queries |
| JWT | Authentication |
| bcrypt | Password hashing |
| Multer | File uploads |
| Axios | HTTP communication |
| Tailwind CSS | User interface styling |
| React Router | Frontend navigation |
| Nodemon | Backend development |
| Express Rate Limit | API rate limiting |
| QR Code Library | QR code generation |
| PDF Library | Release order generation |
| Git & GitHub | Version control |

*Exact package versions should be recorded from the project's package.json files.*

---

## 9. Database Design

The project uses MongoDB with Mongoose schemas.

### Main Data Models

| Model | Purpose |
|---|---|
| User | Stores user accounts and roles |
| Port | Stores supported port information |
| ShippingLine | Stores shipping-line information |
| BillOfLading | Stores bill of lading records |
| Container | Stores container information and current status |
| Document | Stores document records |
| DocumentVersion | Stores individual uploaded document versions |
| ClearanceEvent | Stores container stage history |
| DutyRate | Stores customs duty rates and fees |
| DutyAssessment | Stores historical duty calculations |
| Payment | Stores payment attempts and receipts |
| Inspection | Stores inspection schedules and results |
| ReleaseOrder | Stores issued and revoked release orders |
| Notification | Stores in-app notifications |
| SmsOutbox | Stores simulated SMS messages |
| WebhookDelivery | Stores webhook attempts and delivery status |
| AuditLog | Stores sensitive system activities |

### Important Relationships

- One importer can register multiple containers.
- One bill of lading can contain multiple containers.
- One container can have multiple documents.
- One document can have multiple versions.
- One container can have multiple clearance events.
- One container can have duty assessments and payment records.
- One container can have multiple inspection records.
- One container can have historical release orders.
- Users can receive multiple notifications.
- Shipping lines can have webhook configurations and delivery records.

**Database requirement note:** MongoDB is the database selected for this implementation. The challenge brief specifies a relational database with at least six related tables and primary/foreign keys. This implementation does not satisfy that requirement as written. A relational database implementation or an approved alternative would be needed to claim full compliance.

---

## 10. Authentication and Security

The system uses role-based authentication and server-side authorization.

Security measures include:

- JWT-based authentication.
- Password hashing.
- Role-based access control.
- Server-side request validation.
- Protected API endpoints.
- Resource ownership checks.
- Account activation checks.
- API rate limiting.
- Secure gate-code generation and verification.
- File type and size validation.
- Audit logging of sensitive operations.
- Environment variables for private configuration.
- Protection against unauthorized stage changes.

The frontend does not serve as the security boundary. Every protected operation must be validated by the backend.

---

## 11. API Documentation

The application exposes REST API endpoints.

The detailed API reference should be maintained in the `docs/` directory or in a dedicated API section of this README.

For every endpoint, document:

- HTTP method
- URL path
- Required authentication
- Required role
- Request parameters
- Request body
- Successful response
- Possible error responses

Example endpoint documentation:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/auth/login | Authenticate a user |
| GET | /api/users | Retrieve users |
| POST | /api/containers | Register a container |
| GET | /api/containers | Retrieve accessible containers |
| GET | /api/containers/:id | Retrieve container details |
| GET | /api/containers/:id/events | Retrieve clearance history |
| POST | /api/containers/:id/documents | Upload a document |
| POST | /api/containers/:id/submit-documents | Submit required documents |
| POST | /api/containers/:id/advance | Advance the clearance stage |
| POST | /api/containers/:id/payments | Create a simulated payment |
| POST | /api/containers/:id/inspections | Schedule an inspection |
| POST | /api/containers/:id/release | Generate a release order |
| GET | /api/public/track/:containerNumber | Public container tracking |

*These are documentation examples. Confirm the actual registered route paths before treating this table as the final API reference.*

---

## 12. Installation and Setup

### Prerequisites

Install the following:

- Node.js
- npm
- MongoDB
- Git

### Step 1: Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd YOUR_PROJECT_FOLDER
```

### Step 2: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 3: Configure Backend Environment Variables

Create a `.env` file using `.env.example` as a reference.

Example:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/port_clearance
JWT_SECRET=your_secret_here
NODE_ENV=development
```

Add every other required environment variable used by the actual application.

### Step 4: Start the Backend

```bash
npm run dev
```

### Step 5: Install Frontend Dependencies

Open another terminal:

```bash
cd frontend
npm install
```

### Step 6: Start the Frontend

```bash
npm run dev
```

Open the local development URL displayed by Vite.

### Step 7: Load Seed Data

Run the project's seed script to create the initial administrator and required demonstration data.

The exact command should match the script defined in `package.json`.

---

## 13. Testing

Automated tests should verify the most important business rules and technical requirements.

The test suite should cover at least 15 unit or integration tests.

Important test scenarios include:

1. Successful user authentication.
2. Invalid login credentials.
3. Unauthorized role access.
4. Container registration.
5. ISO 6346 container number validation.
6. Duplicate active container prevention.
7. Invalid stage transition rejection.
8. Valid stage transition.
9. Customs review backward transition with a reason.
10. Document upload validation.
11. Document version creation.
12. Document rejection requiring a reason.
13. Duty calculation.
14. Payment success and failure.
15. Duplicate payment prevention.
16. Inspection failure and hold.
17. Release eligibility.
18. Gate-code verification.
19. Webhook retry handling.
20. Public tracking data privacy.

### Run Tests

```bash
npm test
```

*The command must match the actual test script in package.json.*

### Continuous Integration

GitHub Actions should automatically run the test suite whenever code is pushed or a pull request is created.

---

## 14. Somali and English Language Support

The application is designed to support two languages:

- English
- Somali

Users can switch languages through the language selector.

The selected language controls the text displayed throughout the application, including:

- Navigation menus
- Dashboard information
- Forms
- Buttons
- Notifications
- Validation messages
- Error messages
- PDF release orders

The interface should support responsive layouts on both mobile devices and desktop computers.

---

## 15. Simulated Integrations

### Mobile Money

The system simulates mobile money payments through EVC Plus, Zaad, and eDahab.

No real financial transaction takes place.

### SMS

SMS notifications are generated in Somali and English and stored in the internal SMS outbox.

No external SMS gateway is required.

### Webhooks

A local mock receiver demonstrates how shipping-line systems receive clearance events.

These integrations demonstrate the system's event-driven design without requiring production external services.

---

## 16. Project Structure

The following is the intended high-level organization. Exact folder names should match the current repository.

```text
Port-Container-Clearance-Tracker/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── routes/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── assets/
│   │
│   └── package.json
│
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── tests/
│   ├── scripts/
│   ├── server.js
│   └── package.json
│
├── mock-receiver/
│   ├── server.js
│   └── package.json
│
├── docs/
│   ├── API.md
│   └── database-diagram.md
│
├── .gitignore
├── README.md
└── .env.example
```

---

## 17. Development Progress

The project is being developed incrementally.

The following table should be updated according to actual implementation and testing.

| Feature | Status |
|---|---|
| Project setup and configuration | Done |
| Authentication and user roles | Partial / verify |
| User management | Done |
| Port management | Done |
| Container registration | Partial / verify |
| ISO 6346 validation | Implemented / verify |
| Bill of Lading management | Partial |
| Document upload | Implemented / verify |
| Document versioning | Implemented / verify |
| Document review | Implemented / verify |
| Eight-stage clearance workflow | Implemented / verify |
| Duty calculator | Partial / verify |
| Simulated payments | Partial / verify |
| Inspection scheduling | Partial / verify |
| Release order PDF | Partial / verify |
| Secure gate codes | Implemented / verify |
| Public tracking | Partial / verify |
| Notifications | Partial |
| SMS outbox | Partial |
| Webhook simulator | Partial |
| Demurrage monitoring | Partial |
| Analytics dashboard | Partial |
| Somali and English switching | Partial / verify |
| Automated tests | Not confirmed |
| GitHub Actions CI | Not confirmed |
| README and API documentation | In progress |

*Status labels must be changed only after the corresponding feature has been tested.*

---

## 18. Demo Accounts

The following demonstration accounts should be created through the seed script.

| Role | Email | Password |
|---|---|---|
| Administrator | Add seeded email | Add seeded password |
| Importer | Add seeded email | Add seeded password |
| Clearing Agent | Add seeded email | Add seeded password |
| Customs Officer | Add seeded email | Add seeded password |

These accounts are intended exclusively for local demonstration.

Never commit real credentials or production passwords to GitHub.

---

## 19. Demo Presentation Checklist

The following scenarios demonstrate the complete clearance workflow.

1. Log in as an importer.
2. Register a new container.
3. Upload all four required documents.
4. Log in as Customs.
5. Reject one document with a reason.
6. Return to the importer account.
7. Upload a replacement document.
8. Demonstrate both document versions.
9. Approve all required documents.
10. Assess customs duty.
11. Log in as the importer or clearing agent.
12. Complete the simulated mobile money payment.
13. Show the generated payment receipt.
14. Schedule and complete an inspection.
15. Generate the container release order.
16. Demonstrate QR tracking and gate-code verification.
17. Mark the container as collected.
18. Show the complete event history.
19. Attempt an invalid stage transition and demonstrate backend rejection.
20. Demonstrate a failed webhook delivery and its retries.
21. Open the public tracking page.
22. Demonstrate the analytics dashboard.

---

## 20. Assumptions and Known Limitations

The following assumptions and limitations should be maintained and updated throughout development.

- Payments are simulated and do not transfer real money.
- SMS messages are generated internally and are not sent through a real SMS provider.
- Shipping-line webhooks use a local mock receiver for demonstration.
- Public tracking exposes only non-sensitive container clearance information.
- Historical clearance events must remain available for auditing.
- Document replacement creates a new version rather than overwriting the previous file.
- Historical duty assessments retain the rates used when they were created.
- Release-order revocation does not erase the original release record.
- Held containers continue accumulating estimated demurrage costs.
- MongoDB is the selected database, although the assessment brief explicitly requests a relational database.

Additional assumptions should be documented here whenever implementation decisions are made outside the original project brief.

---

## 21. Security and Privacy

Security is an essential part of the application.

The system must ensure:

- Users can access only resources they are authorized to access.
- Importers cannot access another importer's private information without authorization.
- Clearing agents can perform only permitted clearance activities.
- Customs officers can perform customs-related operations.
- Administrators have controlled management privileges.
- Sensitive actions are recorded in the audit log.
- Public tracking never exposes confidential financial or personal information.
- Uploaded documents are validated before acceptance.
- Private environment variables are never committed to the repository.

---

## 22. GitHub Repository and Development History

The project is maintained using Git and GitHub.

Development progress is committed regularly to demonstrate the actual implementation process.

Each working day should have at least one meaningful commit.

Example commit messages:

```text
feat: implement user authentication
feat: add container registration
feat: implement document versioning
feat: add clearance event tracking
fix: validate container stage transitions
feat: implement duty calculator
feat: add simulated payments
feat: implement webhook retries
test: add clearance workflow tests
docs: complete project documentation
```

The repository must contain:

- Complete frontend source code.
- Complete backend source code.
- Mock webhook receiver.
- Database seed scripts.
- Automated tests.
- GitHub Actions configuration.
- README documentation.
- `.env.example`.
- Screenshots of the application.

---

## 23. Project Goals

The ultimate goal is to demonstrate how a traditional manual container clearance process can be transformed into a centralized, transparent, secure, and event-driven digital system.

The project demonstrates practical software engineering concepts, including:

- Role-based access control.
- Backend business-rule enforcement.
- Event-driven architecture.
- Document versioning.
- Financial calculations.
- Simulated payment processing.
- Secure release verification.
- Webhook integrations.
- Audit trails.
- Database-driven analytics.
- Multilingual user interfaces.

**Port Container Clearance Tracker aims to make container clearance more transparent, traceable, and efficient across Somali ports.**

---

**Project:** Port Container Clearance Tracker  
**Challenge:** SimadiLab 10X Challenge  
**Development:** Solo Project  
**Target Environment:** Local demonstration  
**Primary Market:** Somalia