const fetch = require('node-fetch');

// Netlify Function to proxy read/write of data/sheep.json in the repository via GitHub API.
// Environment variables required:
// - GITHUB_TOKEN : Personal Access Token with repo write access
// - REPO_OWNER   : repository owner (user/org)
// - REPO_NAME    : repository name (e.g., winterhavenfiles)
// - BRANCH       : branch to use (default: main)
// - FILE_PATH    : file path in repo (default: data/sheep.json)

const GITHUB_API = 'https://api.github.com';

const getEnv = (key, def) => process.env[key] || def;

const repoOwner = getEnv('REPO_OWNER');
const repoName = getEnv('REPO_NAME');
const branch = getEnv('BRANCH', 'main');
const filePath = getEnv('FILE_PATH', 'data/sheep.json');
const token = getEnv('GITHUB_TOKEN');

const headers = () => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'sheep-management-netlify-fn'
});

async function getFileShaAndContent() {
  const url = `${GITHUB_API}/repos/${repoOwner}/${repoName}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`GitHub GET failed: ${res.status} ${body}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return json;
}

exports.handler = async function(event, context) {
  if (!token || !repoOwner || !repoName) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing configuration. Set GITHUB_TOKEN, REPO_OWNER, REPO_NAME in Netlify environment.' }) };
  }

  try {
    if (event.httpMethod === 'GET') {
      const json = await getFileShaAndContent();
      // return decoded content
      const content = Buffer.from(json.content || '', json.encoding || 'base64').toString('utf8');
      return { statusCode: 200, body: content, headers: { 'Content-Type': 'application/json' } };
    }

    if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
      const payload = event.body || '';
      const parsed = typeof payload === 'string' ? payload : JSON.stringify(payload);
      // First get sha (may not exist)
      let sha = null;
      try {
        const current = await getFileShaAndContent();
        sha = current.sha;
      } catch (e) {
        // file might not exist; proceed with null sha to create
      }

      const putUrl = `${GITHUB_API}/repos/${repoOwner}/${repoName}/contents/${encodeURIComponent(filePath)}`;
      const body = {
        message: `Update sheep data via Netlify Function`,
        content: Buffer.from(parsed, 'utf8').toString('base64'),
        branch: branch
      };
      if (sha) body.sha = sha;

      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
        body: JSON.stringify(body)
      });
      const putJson = await putRes.json();
      if (!putRes.ok) {
        return { statusCode: putRes.status, body: JSON.stringify({ error: putJson }) };
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true, result: putJson }) };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: err.status || 500, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
