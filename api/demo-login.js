import { timingSafeEqual } from 'node:crypto';

function matchesSecret(candidate, expected) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const expectedUsername = process.env.DEMO_ADMIN_USERNAME;
  const expectedPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!expectedUsername || !expectedPassword) {
    console.error('Demo login server credentials are not configured.');
    return response.status(503).json({ error: 'Demo login is not configured.' });
  }

  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'Invalid login request.' });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (
    !matchesSecret(username, expectedUsername)
    || !matchesSecret(password, expectedPassword)
  ) {
    return response.status(401).json({ error: 'Invalid username or password.' });
  }

  return response.status(200).json({ authenticated: true });
}
