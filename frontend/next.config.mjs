import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a minimal standalone server bundle for the Docker image.
  output: 'standalone',
  // Pin the file-tracing root to this app so standalone output is deterministic
  // regardless of any parent lockfiles.
  outputFileTracingRoot: dirname,
};

export default nextConfig;
