import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The fixture transcription provider reads fixtures/transcription/*.json at
  // runtime with readdirSync. Nothing imports those files, so Next's tracer
  // cannot see them and a serverless deployment ships without them -- the
  // provider then throws ENOENT on the first transcribe, in production only.
  // Naming them here is what puts them in the bundle.
  //
  // Kept even though replay is now refused outright on any deployment, because
  // the tracer's failure mode is worth avoiding regardless: an ENOENT thrown on
  // the first transcribe, in production only, that nobody can reproduce
  // locally. Shipping four small JSON files is cheaper than that.
  outputFileTracingIncludes: {
    "/api/lectures/[id]/transcribe": ["./fixtures/transcription/**"],
    "/api/lectures/[id]/poll": ["./fixtures/transcription/**"],
  },
};

export default nextConfig;
