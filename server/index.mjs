import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import User, { USER_ROLES } from './models/User.mjs';

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const ROLES = USER_ROLES;
const ROLE_TO_APP = {
  'System Admin': 'admin',
  Sales: 'sales',
  Accountant: 'finance',
  Client: 'client',
};
const TOKEN_LIFETIME_SECONDS = 60 * 60 * 8;
const COOKIE_NAME = 'ibms_session';
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : []),
]);

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is missing. Copy .env.example to .env and set your MongoDB Atlas connection string.');
}
if (uri.includes('<') || uri.includes('>')) {
  throw new Error('MONGODB_URI still contains a placeholder. Replace <username>, <db_password>, and any other angle-bracket placeholders with real Atlas values.');
}
if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
  throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32 || /replace|change.?me|example/i.test(jwtSecret)) {
  throw new Error('JWT_SECRET is missing, a placeholder, or too short. Set a unique random secret of at least 32 characters in .env.');
}

const tenantId = process.env.MONGODB_TENANT_ID || DEFAULT_TENANT_ID;
try {
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME || 'ibms' });
} catch {
  console.error('Could not connect to MongoDB. Verify MONGODB_URI, Atlas network access, and database-user permissions.');
  process.exit(1);
}

const database = mongoose.connection.db;
const collections = {
  pipelines: database.collection('pipelines'),
  pipelineStages: database.collection('pipeline_stages'),
  stageHistory: database.collection('stage_history_audit'),
  deals: database.collection('deals'),
};

await User.init();
await Promise.all([
  collections.pipelines.createIndex({ tenantId: 1, code: 1 }, { unique: true }),
  collections.pipelineStages.createIndex({ tenantId: 1, pipelineId: 1, stageOrder: 1 }, { unique: true }),
  collections.stageHistory.createIndex({ tenantId: 1, dealId: 1, enteredAt: -1 }),
  collections.deals.createIndex({ tenantId: 1, id: 1 }, { unique: true }),
]);

if (process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_PASSWORD) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password || Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Bootstrap admin requires BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD between 12 and 72 bytes.');
  }
  const hasAdmin = await User.exists({ role: 'System Admin' });
  if (!hasAdmin) {
    await User.create({
      name: process.env.BOOTSTRAP_ADMIN_NAME || 'System Admin',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'System Admin',
      tenantId,
      title: 'System Administrator',
    });
    console.log(`Bootstrapped the initial system administrator: ${email}`);
  }
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use('/api', (request, response, next) => {
  const origin = request.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    response.status(403).json({ error: 'This API does not accept requests from this origin.' });
    return;
  }
  if (origin) {
    response.set('Access-Control-Allow-Origin', origin);
    response.set('Vary', 'Origin');
    response.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.set('Access-Control-Allow-Credentials', 'true');
  }
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: ROLE_TO_APP[user.role],
    title: user.title,
  };
}

function setSessionCookie(response, user) {
  const token = jwt.sign({ sub: user._id.toString() }, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: TOKEN_LIFETIME_SECONDS,
    issuer: 'ibms-api',
    audience: 'ibms-web',
  });
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: TOKEN_LIFETIME_SECONDS * 1000,
  });
}

async function requireAuth(request, response, next) {
  try {
    const token = request.cookies[COOKIE_NAME];
    if (!token) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const payload = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'ibms-api',
      audience: 'ibms-web',
    });
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') {
      response.status(401).json({ error: 'Invalid session.' });
      return;
    }
    const user = await User.findById(payload.sub).select('_id name email role tenantId title');
    if (!user) {
      response.status(401).json({ error: 'Account no longer exists.' });
      return;
    }
    request.auth = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      response.status(401).json({ error: 'Session expired. Sign in again.' });
      return;
    }
    next(error);
  }
}

function authorize(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.auth.role)) {
      response.status(403).json({ error: 'Your role does not have permission to perform this action.' });
      return;
    }
    next();
  };
}

const validCredentials = (name, email, password) => typeof name === 'string'
  && name.trim().length > 0
  && name.trim().length <= 120
  && typeof email === 'string'
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  && email.length <= 254
  && typeof password === 'string'
  && Buffer.byteLength(password, 'utf8') >= 12
  && Buffer.byteLength(password, 'utf8') <= 72;

app.post('/api/auth/register', authLimiter, async (request, response, next) => {
  try {
    const { name, email, password } = request.body ?? {};
    if (!validCredentials(name, email, password)) {
      response.status(400).json({ error: 'Provide a name, valid email, and password between 12 and 72 bytes.' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'Client',
      tenantId,
      title: 'Client',
    });
    setSessionCookie(response, user);
    response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) {
      response.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }
    next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (request, response, next) => {
  try {
    const { email, password } = request.body ?? {};
    if (typeof email !== 'string' || email.length > 254
      || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) {
      response.status(400).json({ error: 'Provide a valid email and password.' });
      return;
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      response.status(401).json({ error: 'Email or password is incorrect.' });
      return;
    }
    setSessionCookie(response, user);
    response.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({ user: publicUser(request.auth) });
});

app.post('/api/auth/logout', (_request, response) => {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
  });
  response.sendStatus(204);
});

app.get('/api/auth/users', requireAuth, authorize('System Admin'), async (request, response, next) => {
  try {
    const users = await User.find({ tenantId: request.auth.tenantId }).select('_id name email role title').sort({ name: 1 });
    response.json({ users: users.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/users', requireAuth, authorize('System Admin'), async (request, response, next) => {
  try {
    const { name, email, password, role, title } = request.body ?? {};
    if (!validCredentials(name, email, password) || !ROLES.includes(role)) {
      response.status(400).json({ error: 'Provide a name, valid email, password between 12 and 72 bytes, and a supported role.' });
      return;
    }
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role,
      tenantId: request.auth.tenantId,
      title: typeof title === 'string' ? title.trim().slice(0, 120) : '',
    });
    response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) {
      response.status(409).json({ error: 'An account with that email already exists.' });
      return;
    }
    next(error);
  }
});

function documentId(id) {
  return `${tenantId}:${id}`;
}

function clientDocument(document, includeTenantId = false) {
  const { _id, tenantId: documentTenantId, ...data } = document;
  return includeTenantId ? { ...data, tenantId: documentTenantId } : data;
}

async function readSnapshot(tenantId) {
  const [pipelines, pipelineStages, stageHistory, deals] = await Promise.all([
    collections.pipelines.find({ tenantId }).toArray(),
    collections.pipelineStages.find({ tenantId }).toArray(),
    collections.stageHistory.find({ tenantId }).toArray(),
    collections.deals.find({ tenantId }).toArray(),
  ]);

  return {
    pipelines: pipelines.map((item) => clientDocument(item, true)),
    pipelineStages: pipelineStages.map((item) => clientDocument(item)),
    stageHistory: stageHistory.map((item) => clientDocument(item, true)),
    deals: deals.map((item) => clientDocument(item)),
  };
}

function validateSnapshot(body) {
  const keys = ['pipelines', 'pipelineStages', 'stageHistory', 'deals'];
  for (const key of keys) {
    if (!Array.isArray(body?.[key])) throw new SnapshotValidationError(`${key} must be an array.`);
  }

  const { pipelines, pipelineStages, stageHistory, deals } = body;
  if (pipelines.length > 100 || pipelineStages.length > 1000 || stageHistory.length > 100000 || deals.length > 50000) {
    throw new SnapshotValidationError('The submitted pipeline data exceeds the supported record limits.');
  }

  const uniqueIds = (items, name) => {
    const ids = items.map((item) => item?.id);
    if (ids.some((id) => typeof id !== 'string' || id.length === 0) || new Set(ids).size !== ids.length) {
      throw new SnapshotValidationError(`${name} must contain unique, non-empty string IDs.`);
    }
  };
  uniqueIds(pipelines, 'pipelines');
  uniqueIds(pipelineStages, 'pipelineStages');
  uniqueIds(stageHistory, 'stageHistory');
  uniqueIds(deals, 'deals');

  const pipelineIds = new Set(pipelines.map((item) => item.id));
  const stageIds = new Set(pipelineStages.map((item) => item.id));
  const dealIds = new Set(deals.map((item) => item.id));
  const stageOrders = new Set();
  for (const pipeline of pipelines) {
    if (typeof pipeline.name !== 'string' || typeof pipeline.code !== 'string' || typeof pipeline.isActive !== 'boolean') {
      throw new SnapshotValidationError(`Pipeline ${pipeline.id} has invalid fields.`);
    }
  }
  for (const stage of pipelineStages) {
    const orderKey = `${stage.pipelineId}:${stage.stageOrder}`;
    if (!pipelineIds.has(stage.pipelineId)
      || typeof stage.name !== 'string'
      || !Number.isInteger(stage.stageOrder)
      || stage.stageOrder < 1
      || !Number.isFinite(stage.winProbabilityPct)
      || stage.winProbabilityPct < 0
      || stage.winProbabilityPct > 100
      || !Number.isInteger(stage.stagnationDaysThreshold)
      || stage.stagnationDaysThreshold < 0
      || stageOrders.has(orderKey)) {
      throw new SnapshotValidationError(`Pipeline stage ${stage.id} has invalid fields or references.`);
    }
    stageOrders.add(orderKey);
  }
  for (const deal of deals) {
    if (typeof deal.client !== 'string' || typeof deal.stage !== 'string' || !Number.isFinite(deal.value)) {
      throw new SnapshotValidationError(`Deal ${deal.id} has invalid fields.`);
    }
    if (deal.pipelineId && !pipelineIds.has(deal.pipelineId)) {
      throw new SnapshotValidationError(`Deal ${deal.id} references an unknown pipeline.`);
    }
  }
  for (const entry of stageHistory) {
    if (!dealIds.has(entry.dealId) || !stageIds.has(entry.toStageId)
      || (entry.fromStageId !== null && !stageIds.has(entry.fromStageId))
      || typeof entry.enteredAt !== 'string') {
      throw new SnapshotValidationError(`Stage history entry ${entry.id} has invalid fields or references.`);
    }
    const target = pipelineStages.find((stage) => stage.id === entry.toStageId);
    if (target?.name === 'Closed-Lost' && !String(entry.lossReason || '').trim()) {
      throw new SnapshotValidationError('A loss reason is required when a deal enters Closed-Lost.');
    }
    const source = pipelineStages.find((stage) => stage.id === entry.fromStageId);
    if (source && source.pipelineId !== target.pipelineId) {
      throw new SnapshotValidationError('A stage history entry cannot cross pipelines.');
    }
  }

  return { pipelines, pipelineStages, stageHistory, deals };
}

async function replaceTenantData(collection, tenantId, items, session) {
  await collection.deleteMany({ tenantId }, { session });
  if (items.length === 0) return;
  await collection.insertMany(items.map((item) => ({
    ...item,
    _id: documentId(item.id),
    tenantId,
  })), { session });
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', persistence: 'mongodb' });
});

app.get('/api/pipeline-data', requireAuth, authorize('System Admin', 'Sales', 'Accountant'), async (request, response, next) => {
  try {
    response.json(await readSnapshot(request.auth.tenantId));
  } catch (error) {
    next(error);
  }
});

app.put('/api/pipeline-data', requireAuth, authorize('System Admin', 'Sales'), async (request, response, next) => {
  try {
    const snapshot = validateSnapshot(request.body);
    const tenantId = request.auth.tenantId;
    if (request.auth.role !== 'System Admin') {
      const current = await readSnapshot(tenantId);
      const sameRecords = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const historyIsAppendOnly = snapshot.stageHistory.length >= current.stageHistory.length
        && current.stageHistory.every((entry, index) => {
          const next = snapshot.stageHistory[index];
          if (sameRecords(entry, next)) return true;
          if (entry.exitedAt !== null || entry.durationSeconds !== null
            || typeof next.exitedAt !== 'string' || !Number.isInteger(next.durationSeconds)
            || Date.parse(next.exitedAt) < Date.parse(entry.enteredAt)) return false;
          const withoutDuration = (audit) => Object.fromEntries(
            Object.entries(audit).filter(([key]) => key !== 'exitedAt' && key !== 'durationSeconds'),
          );
          const oldAudit = withoutDuration(entry);
          const nextAudit = withoutDuration(next);
          return sameRecords(oldAudit, nextAudit);
        });
      if (!sameRecords(snapshot.pipelines, current.pipelines)
        || !sameRecords(snapshot.pipelineStages, current.pipelineStages)
        || !historyIsAppendOnly) {
        response.status(403).json({ error: 'Only System Admin can change pipeline configuration or existing audit history.' });
        return;
      }
    }
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await replaceTenantData(collections.pipelines, tenantId, snapshot.pipelines, session);
        await replaceTenantData(collections.pipelineStages, tenantId, snapshot.pipelineStages, session);
        await replaceTenantData(collections.stageHistory, tenantId, snapshot.stageHistory, session);
        await replaceTenantData(collections.deals, tenantId, snapshot.deals, session);
      });
    } finally {
      await session.endSession();
    }
    response.json({ saved: true });
  } catch (error) {
    if (error instanceof SnapshotValidationError) {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error('MongoDB API request failed.', error instanceof Error ? error.name : 'Unknown error');
  response.status(500).json({ error: 'MongoDB operation failed. Check the API server logs for details.' });
});

const port = Number(process.env.MONGODB_API_PORT || 3001);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Local MongoDB API listening at http://127.0.0.1:${port}`);
});

async function shutdown() {
  server.close();
  await mongoose.disconnect();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
