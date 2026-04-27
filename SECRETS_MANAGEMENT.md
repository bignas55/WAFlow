# Secrets Management Guide — WAFlow

This guide explains how to securely manage sensitive configuration data (API keys, database credentials, encryption keys) for WAFlow.

---

## Quick Start

### Development (Local)

1. **Copy the template:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your local values:**
   ```bash
   nano .env  # or your preferred editor
   ```

3. **Never commit `.env` to git:**
   ```bash
   git status
   # Verify .env is listed as "ignored"
   ```

4. **Start the server:**
   ```bash
   pnpm dev
   # Server validates all required env vars at startup
   # If anything is missing, you'll get a clear error message
   ```

### Production Deployment

Never deploy with `.env` files. Instead:

1. **Set environment variables in your deployment platform**
2. **Use a secrets manager** (if available)
3. **Keep `.env.example` safe** (contains no real secrets, for reference only)

---

## Environment Variable Categories

### 🔴 CRITICAL (Must Change Before Production)

These variables contain sensitive credentials that MUST be generated fresh for production:

| Variable | Example | Notes |
|----------|---------|-------|
| `JWT_SECRET` | `ae253943f9...` (64-char hex) | Signing key for authentication tokens. **NEVER share.** |
| `ENCRYPTION_KEY` | `8cebb984bb...` (64-char hex) | Encrypts API keys in database. **NEVER change once data exists.** |
| `WHATSAPP_APP_SECRET` | `your_meta_secret` | Meta app secret for webhook verification. |
| `DATABASE_URL` | `mysql://user:pass@host/db` | Database credentials. **NEVER hardcode in code.** |
| `REDIS_URL` | `redis://host:6379` | Redis credentials (if auth required). |

### 🟡 RECOMMENDED (Good to Configure)

These enable optional features; configure if you plan to use them:

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp integration |
| `SMTP_HOST` | Email alerts and notifications |
| `TWILIO_ACCOUNT_SID` | SMS fallback for reminders |
| `GOOGLE_CLIENT_ID` | Google Calendar sync |

### 🟢 OPTIONAL (Nice to Have)

These are less critical but improve functionality:

| Variable | Purpose |
|----------|---------|
| `PUPPETEER_EXECUTABLE_PATH` | Custom browser path for WhatsApp Web |
| `AI_FALLBACK_API_URL` | Fallback LLM if primary fails |

---

## Generating Secure Keys

### Generate JWT_SECRET

```bash
# Generate a cryptographically secure 32-byte (64-character hex) key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Example output:
# ae253943f9637ed454bfa701d20661554c8f883759152e33f107b2c2badc4c28d1b9d37fbf199b6eaa48e5656b58d473
```

**⚠️ Important:**
- Do NOT reuse the example values from `.env.example` in production
- Generate a NEW key for each environment (dev, staging, production)
- Store securely (never share, never commit)

### Generate ENCRYPTION_KEY

```bash
# Generate a cryptographically secure 32-byte (64-character hex) key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**⚠️ CRITICAL:**
- This key encrypts sensitive data in your database
- **NEVER change this key once data is encrypted** — you will lose all encrypted values
- Back up this key separately from your database
- If you lose this key, you cannot decrypt stored API credentials

---

## Setting Environment Variables by Platform

### Docker Compose

Use a `.env` file (same as local development):

```bash
cp .env.example .env
# Edit .env with your values
docker compose up
```

### Docker (Container)

Pass environment variables via `-e` flag:

```bash
docker run \
  -e DATABASE_URL="mysql://..." \
  -e JWT_SECRET="..." \
  -e ENCRYPTION_KEY="..." \
  -e AI_API_URL="..." \
  ...
  your-waflow-image
```

Or use a `.env` file:

```bash
docker run --env-file .env your-waflow-image
```

### Kubernetes

Create a Secret:

```bash
kubectl create secret generic waflow-secrets \
  --from-literal=DATABASE_URL="mysql://..." \
  --from-literal=JWT_SECRET="..." \
  --from-literal=ENCRYPTION_KEY="..." \
  ...
```

Reference in your Pod manifest:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: waflow
spec:
  containers:
  - name: app
    image: waflow:latest
    env:
    - name: DATABASE_URL
      valueFrom:
        secretKeyRef:
          name: waflow-secrets
          key: DATABASE_URL
    - name: JWT_SECRET
      valueFrom:
        secretKeyRef:
          name: waflow-secrets
          key: JWT_SECRET
    # ... more variables
```

### Heroku

```bash
# Set variables
heroku config:set DATABASE_URL="mysql://..." --app your-app
heroku config:set JWT_SECRET="..." --app your-app
heroku config:set ENCRYPTION_KEY="..." --app your-app
# ... etc

# Verify
heroku config --app your-app
```

### AWS Elastic Beanstalk

Create `.ebextensions/env.config`:

```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    DATABASE_URL: "mysql://..."
    JWT_SECRET: "..."
    ENCRYPTION_KEY: "..."
    # ... more variables
```

Or use AWS Secrets Manager (recommended):

```bash
# Store secret
aws secretsmanager create-secret \
  --name waflow/production \
  --secret-string '{"DATABASE_URL":"...","JWT_SECRET":"...","ENCRYPTION_KEY":"..."}'

# Reference in EB environment
aws elasticbeanstalk create-environment \
  --environment-name production \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SECRETS_MANAGER_ARN,Value=arn:aws:secretsmanager:...
```

### AWS Secrets Manager (Recommended for Production)

1. **Create a secret:**
   ```bash
   aws secretsmanager create-secret \
     --name waflow/production \
     --region us-east-1 \
     --secret-string '{"DATABASE_URL":"mysql://...","JWT_SECRET":"...","ENCRYPTION_KEY":"..."}'
   ```

2. **Update secret:**
   ```bash
   aws secretsmanager update-secret \
     --secret-id waflow/production \
     --secret-string '{"DATABASE_URL":"...","JWT_SECRET":"..."}'
   ```

3. **Rotate keys:**
   ```bash
   # For non-AWS Secrets Manager managed rotation,
   # update the secret with new key and restart app
   aws secretsmanager update-secret \
     --secret-id waflow/production \
     --secret-string '{"JWT_SECRET":"NEW_KEY_HERE"}'
   ```

4. **Configure application:**
   ```bash
   # Option A: Application reads from Secrets Manager
   # (Would need custom code to load from Secrets Manager)
   
   # Option B: Lambda/ECS pulls secret → env vars
   # (Standard practice with container orchestration)
   ```

### HashiCorp Vault (Advanced)

1. **Store secrets:**
   ```bash
   vault kv put secret/waflow/production \
     DATABASE_URL="mysql://..." \
     JWT_SECRET="..." \
     ENCRYPTION_KEY="..."
   ```

2. **Application fetches at startup:**
   ```typescript
   // Pseudo-code: your app would load from Vault instead of .env
   const VaultClient = require('@hashicorp/vault-client');
   const vault = new VaultClient({
     endpoint: process.env.VAULT_ADDR,
     token: process.env.VAULT_TOKEN,
   });
   const secrets = await vault.read('secret/data/waflow/production');
   ```

---

## Deployment Checklist

Before deploying to production:

- [ ] **Secrets generated** — JWT_SECRET and ENCRYPTION_KEY are fresh (not from .env.example)
- [ ] **.env not committed** — `.env` is in `.gitignore` and never committed to repo
- [ ] **Environment variables set** — All required variables configured in deployment platform
- [ ] **No hardcoded secrets** — Code review confirms no API keys hardcoded in source
- [ ] **Secrets rotated** — Last rotation date documented
- [ ] **Backup plan** — ENCRYPTION_KEY backed up separately (it CANNOT be recovered if lost)
- [ ] **Access restricted** — Only authorized personnel can view production secrets
- [ ] **Logging checked** — No secrets logged in application logs
- [ ] **Configuration validated** — Server starts without errors

### Start Server

Once configured:

```bash
# Development
pnpm dev
# Server logs:
# ✅ Configuration loaded successfully
#    Environment: DEVELOPMENT
#    Database: configured
#    AI Model: gemma4:latest
#    Port: 3000

# Production
npm start
# Should see same success message
```

---

## Secret Rotation

### When to Rotate

- **Quarterly** — Regular security practice
- **Immediately** — If secret is exposed/compromised
- **On team changes** — If someone with access leaves

### How to Rotate JWT_SECRET

1. **Generate new JWT_SECRET:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Update in deployment platform** (NOT .env)
3. **Restart application** (no data loss; tokens re-issued on next login)
4. **Old tokens invalidate** (users re-login; passwordVersion mechanism takes care of this)

### How to Rotate ENCRYPTION_KEY

⚠️ **WARNING:** ENCRYPTION_KEY rotation is complex and data-lossy. Only do if absolutely necessary:

1. **Backup database** — Before any rotation attempt
2. **Export encrypted data** — Decrypt with old key
3. **Re-encrypt** — Encrypt with new key
4. **Update ENCRYPTION_KEY** — In deployment platform
5. **Restart application** — Should work with new key

**Better practice:** Use ENCRYPTION_KEY once, never rotate. If you must rotate:
- Plan maintenance window
- Brief service downtime is expected
- Have database backup ready

---

## Troubleshooting

### Error: "Missing required environment variable: DATABASE_URL"

**Problem:** DATABASE_URL not set

**Solution:**
```bash
# Check if set
echo $DATABASE_URL

# Set it
export DATABASE_URL="mysql://user:pass@localhost:3307/waflow"

# Or add to .env
echo 'DATABASE_URL=mysql://user:pass@localhost:3307/waflow' >> .env
```

### Error: "ENCRYPTION_KEY must be exactly 64 hex characters"

**Problem:** Key is wrong length

**Solution:**
```bash
# Generate new key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Copy output to ENCRYPTION_KEY
export ENCRYPTION_KEY="<paste-output-here>"
```

### Error: "JWT_SECRET must be at least 32 characters"

**Problem:** JWT secret too weak

**Solution:**
```bash
# Generate new secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update
export JWT_SECRET="<paste-output-here>"
```

### Secrets work locally but not in production

**Problem:** Environment variables not propagated to container

**Solution:**
1. Verify variables are set: `docker exec <container> env | grep JWT_SECRET`
2. Check deployment logs for validation errors
3. Ensure Kubernetes secrets, Heroku config vars, etc. are actually set

---

## Best Practices

### DO ✅

- ✅ Generate unique keys for each environment
- ✅ Back up ENCRYPTION_KEY separately
- ✅ Rotate JWT_SECRET quarterly
- ✅ Use external secrets manager in production
- ✅ Restrict access to secrets to authorized personnel only
- ✅ Document rotation dates
- ✅ Use httpOnly cookies for JWT (already implemented)
- ✅ Keep `.env.example` updated with documentation

### DON'T ❌

- ❌ Commit `.env` to version control
- ❌ Hardcode secrets in source code
- ❌ Share secrets via email or Slack
- ❌ Use `.env.example` values in production
- ❌ Log secrets to stdout/stderr
- ❌ Change ENCRYPTION_KEY once data is encrypted
- ❌ Reuse secrets across environments

---

## Security Summary

| Layer | Mechanism | Status |
|-------|-----------|--------|
| **Secrets Storage** | External env vars (no .env in production) | ✅ |
| **Secrets Encryption** | AES-256-GCM in database | ✅ |
| **Authentication** | JWT + passwordVersion invalidation | ✅ |
| **API Keys** | Encrypted before DB storage | ✅ |
| **Validation** | Fail-fast if missing in production | ✅ |
| **Rotation** | JWT rotatable; ENCRYPTION_KEY not rotatable | ⚠️ |

---

## Further Reading

- [OWASP — Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [AWS — Storing Secrets Securely](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [Kubernetes — Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [12 Factor App — Store config in environment](https://12factor.net/config)

---

**Last Updated:** April 24, 2026  
**Maintainer:** Nathan (shirangonathan88@gmail.com)
