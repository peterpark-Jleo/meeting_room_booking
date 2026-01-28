import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const versionLogPath = path.join(rootDir, 'VERSION_LOG.txt');
const buildInfoPath = path.join(rootDir, 'public', 'build-info.js');

let version = 'local';
let date = new Date().toLocaleDateString('en-GB');

try {
    const content = fs.readFileSync(versionLogPath, 'utf8');
    const firstLine = content.split('\n')[0];
    const parts = firstLine.split(' - ');
    if (parts.length >= 2) {
        version = parts[0].trim();
        date = parts[1].trim();
    }
} catch (e) {
    console.warn('Could not read VERSION_LOG.txt, using defaults.');
}

const sha = process.env.GITHUB_SHA || 'local';

const output = `window.__BUILD_INFO__ = { version: "${version}", date: "${date}", sha: "${sha}" };\n`;

fs.writeFileSync(buildInfoPath, output);
console.log(`Generated build-info.js: ${version} (${date}) [${sha}]`);
