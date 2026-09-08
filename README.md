# File Service

A modern, flexible file service built with Hono.js featuring:

- **Multi-database support**: MongoDB, PostgreSQL, MySQL, or SQLite
- **Flexible storage**: AWS S3 or local file system
- **Serverless-ready**: Optimized for serverless deployments
- **Type-safe**: Full TypeScript with Drizzle ORM

## Features

- 🗄️ **Database Abstraction**: Switch between MongoDB, PostgreSQL, MySQL, or SQLite via environment variables
- 💾 **Storage Flexibility**: Use S3 for cloud storage or local file system for development
- ⚡ **Modern Stack**: Hono.js for performance, Drizzle ORM v1 beta 2 for type safety
- 🔒 **Type Safety**: Full TypeScript coverage with inferred types
- 🚀 **Serverless Ready**: Connection pooling and optimizations for AWS Lambda, Vercel, etc.

## Prerequisites

- Node.js (v18 or higher)
- pnpm (package manager)
- Database of choice (MongoDB, PostgreSQL, MySQL, or SQLite)
- AWS S3 credentials (if using S3 storage) OR local file system

## Installation

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create a `.env` file (see Environment Variables section below)

## Running the Project

### Development Mode

```bash
pnpm run dev
```

The server will start at `http://localhost:8866`

### Production Build

```bash
pnpm run build
pnpm run start
```

## Environment Variables

### Database Configuration

Choose your database by setting `DB_TYPE`:

#### MongoDB

```env
DB_TYPE=mongodb
MONGO_URI=mongodb://localhost:27017/fileservice
```

#### PostgreSQL

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=fileservice
```

#### MySQL

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=fileservice
```

#### SQLite

```env
DB_TYPE=sqlite
DB_PATH=./data/fileservice.db
```

### Storage Configuration

#### S3 Storage (default)

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
```

#### Local File Storage

```env
LOCAL_PATH=/path/to/local/storage
```

If `LOCAL_PATH` is set, the service will use local file system instead of S3.

### Other Configuration

```env
PORT=8866
NODE_ENV=development
```

## API Endpoints

### Health Check

- `GET /` - API info
- `GET /api/health` - Health check with database and storage status

### File Operations

- `POST /api/files/upload` - Upload a file (multipart/form-data)
- `GET /api/files/download/:fileName` - Download a file
- `POST /api/files/presigned-urls` - Generate batch presigned URLs

## Project Structure

```
src/
├── core/
│   ├── services/      # Business logic
│   ├── storage/       # Storage abstractions (S3, Local)
│   └── utils/         # Utilities (errors, logger)
├── server/
│   ├── controllers/   # Request handlers
│   ├── middleware/    # Hono middleware
│   └── routers/       # Route definitions
├── db/
│   ├── schema.*.ts    # Database schemas (per dialect)
│   ├── drizzle.ts     # Drizzle ORM client
│   ├── mongodb-adapter.ts  # MongoDB adapter
│   ├── factory.ts     # Database factory
│   └── repository.ts  # Data access layer
├── config/            # Configuration management
└── index.ts           # Application entry point
```

## Database Migrations

### Generate Migration

```bash
pnpm drizzle-kit generate
```

### Apply Migration

```bash
pnpm drizzle-kit migrate
```

### Pull from Database

```bash
pnpm drizzle-kit pull
```

## Technologies

- **Hono.js** - Fast web framework for serverless
- **Drizzle ORM v1.0.0-beta.2** - Type-safe ORM with multi-dialect support
- **AWS SDK v3** - For S3 integration
- **Winston** - Logging
- **TypeScript** - Type safety
- **SWC** - Fast compilation

## Architecture

### Database Layer

- **Drizzle ORM** for PostgreSQL, MySQL, and SQLite
- **Custom MongoDB Adapter** with Drizzle-like API
- **Unified Repository Layer** works across all databases

### Storage Layer

- **S3 Adapter** using AWS SDK v3
- **Local Adapter** for file system storage
- **Factory Pattern** for runtime switching

### Serverless Optimizations

- Connection pooling with reuse across warm starts
- Lazy initialization
- Optimized cold start performance

## License

ISC
