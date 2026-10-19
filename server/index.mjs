import express from 'express';
import { MongoClient } from 'mongodb';

const DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

if (process.env.NODE_ENV === 'production') {
  throw new Error('This unauthenticated MongoDB API is for local development only.');
}

const uri = process.env.MONGODB_URI;
if (!uri || uri.includes('<') || uri.includes('>')) {
  throw new Error('Set MONGODB_URI in the ignored .env file using your MongoDB Atlas credentials.');
}

const tenantId = process.env.MONGODB_TENANT_ID || DEFAULT_TENANT_ID;
const client = new MongoClient(uri);
try {
  await client.connect();
} catch {
  console.error('Could not connect to MongoDB. Verify MONGODB_URI, Atlas network access, and database-user permissions.');
  process.exit(1);
}

const database = client.db(process.env.MONGODB_DB_NAME || 'ibms');
const collections = {
  pipelines: database.collection('pipelines'),
  pipelineStages: database.collection('pipeline_stages'),
  stageHistory: database.collection('stage_history_audit'),
  deals: database.collection('deals'),
};

class SnapshotValidationError extends Error {}

await Promise.all([
  collections.pipelines.createIndex({ tenantId: 1, code: 1 }, { unique: true }),
  collections.pipelineStages.createIndex({ tenantId: 1, pipelineId: 1, stageOrder: 1 }, { unique: true }),
  collections.stageHistory.createIndex({ tenantId: 1, dealId: 1, enteredAt: -1 }),
  collections.deals.createIndex({ tenantId: 1, id: 1 }, { unique: true }),
]);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use('/api', (request, response, next) => {
  const origin = request.get('origin');
  if (origin && !allowedOrigins.has(origin)) {
    response.status(403).json({ error: 'This local API only accepts requests from the local IBMS frontend.' });
    return;
  }
  if (origin) {
    response.set('Access-Control-Allow-Origin', origin);
    response.set('Vary', 'Origin');
    response.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});

function documentId(id) {
  return `${tenantId}:${id}`;
}

function clientDocument(document, includeTenantId = false) {
  const { _id, tenantId: documentTenantId, ...data } = document;
  return includeTenantId ? { ...data, tenantId: documentTenantId } : data;
}

async function readSnapshot() {
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

async function replaceTenantData(collection, items, session) {
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

app.get('/api/pipeline-data', async (_request, response, next) => {
  try {
    response.json(await readSnapshot());
  } catch (error) {
    next(error);
  }
});

app.put('/api/pipeline-data', async (request, response, next) => {
  try {
    const snapshot = validateSnapshot(request.body);
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await replaceTenantData(collections.pipelines, snapshot.pipelines, session);
        await replaceTenantData(collections.pipelineStages, snapshot.pipelineStages, session);
        await replaceTenantData(collections.stageHistory, snapshot.stageHistory, session);
        await replaceTenantData(collections.deals, snapshot.deals, session);
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
  await client.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
