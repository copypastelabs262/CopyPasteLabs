import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The fixture transcription provider reads fixtures/transcription/*.json at
  // runtime with readdirSync. Nothing imports those files, so Next's tracer
  // cannot see them and a serverless deployment ships without them -- the
  // provider then throws ENOENT on the first transcribe, in production only.
  // Naming them here is what puts them in the bundle.
  //
  // Listed even though Sarvam is the production default, because a deployment
  // that sets TRANSCRIPTION_PROVIDER=fixture for a demo should work rather than
  // fail in a way nobody can reproduce locally.
  outputFileTracingIncludes: {
    "/api/lectures/[id]/transcribe": ["./fixtures/transcription/**"],
    "/api/lectures/[id]/poll": ["./fixtures/transcription/**"],
  },
};

export default nextConfig;
